import { useState, useCallback, useRef } from 'react'
import { Alert, Platform, Linking, PermissionsAndroid } from 'react-native'
import Contacts from 'react-native-contacts'
import AsyncStorage from '@react-native-async-storage/async-storage'
import Toast from 'react-native-toast-message'
import { userApi } from '../api/userApi'

const STORAGE_KEYS = {
	MATCHED: 'device_contacts_matched',
	LAST_SYNC: 'device_contacts_last_sync',
	CONSENT: 'device_contacts_consent',
}

const BATCH_SIZE = 2000
const SYNC_COOLDOWN_MS = 15 * 60 * 1000
const CONTACTS_CHECK_TIMEOUT_MS = 2000

/**
 * Normalize a phone number for matching.
 */
const normalizePhone = (raw) => {
	if (!raw || typeof raw !== 'string') return null
	let cleaned = raw.replace(/[^\d+]/g, '')
	if (cleaned.startsWith('00')) {
		cleaned = '+' + cleaned.slice(2)
	}
	const digitCount = cleaned.replace(/\D/g, '').length
	if (digitCount < 5) return null
	if (!cleaned.startsWith('+')) {
		cleaned = '+' + cleaned
	}
	return cleaned
}

/**
 * Hook for reading device contacts, syncing phone numbers with the backend,
 * and caching matched QvaPay users.
 */
const useDeviceContacts = () => {

	const [matchedContacts, setMatchedContacts] = useState([])
	const [permissionStatus, setPermissionStatus] = useState('undefined')
	const [isSyncing, setIsSyncing] = useState(false)
	const [error, setError] = useState(null)
	const [showDisclosure, setShowDisclosure] = useState(false)
	const syncingRef = useRef(false)
	// Holds a resolve callback so acceptDisclosure can continue the permission flow
	const disclosureResolveRef = useRef(null)

	// Open device settings
	const openSettings = useCallback(() => {
		if (Platform.OS === 'ios') {
			Linking.openURL('app-settings:')
		} else { Linking.openSettings() }
	}, [])

	// Show alert to guide user to Settings
	const showSettingsAlert = useCallback(() => {
		Alert.alert(
			'Permiso de contactos',
			'Para sincronizar tus contactos, activa el permiso en la configuración de tu dispositivo.',
			[
				{ text: 'Cancelar', style: 'cancel' },
				{ text: 'Abrir Configuración', onPress: openSettings },
			]
		)
	}, [openSettings])

	// Check current permission status
	const checkPermission = useCallback(async () => {
		try {
			if (Platform.OS === 'android') {
				const granted = await PermissionsAndroid.check(
					PermissionsAndroid.PERMISSIONS.READ_CONTACTS
				)
				const status = granted ? 'authorized' : 'undefined'
				setPermissionStatus(status)
				return status
			}
			// iOS — use react-native-contacts with timeout (iOS 18+ checkPermission may hang)
			const status = await Promise.race([
				Contacts.checkPermission(),
				new Promise((resolve) => setTimeout(() => resolve('undefined'), CONTACTS_CHECK_TIMEOUT_MS)),
			])
			setPermissionStatus(status)
			return status
		} catch (e) {
			console.warn('Contacts.checkPermission failed:', e.message)
			setPermissionStatus('undefined')
			return 'undefined'
		}
	}, [])

	// Actually request the OS-level permission (called after consent is given)
	const requestOsPermission = useCallback(async () => {
		try {
			if (Platform.OS === 'android') {
				const granted = await PermissionsAndroid.request(
					PermissionsAndroid.PERMISSIONS.READ_CONTACTS
				)
				const status = granted === PermissionsAndroid.RESULTS.GRANTED ? 'authorized' : 'denied'
				setPermissionStatus(status)
				return status
			}

			// iOS
			const status = await Contacts.requestPermission()
			setPermissionStatus(status)
			return (status === 'authorized' || status === 'limited') ? 'authorized' : 'denied'
		} catch (e) {
			console.warn('OS permission request failed:', e.message)
			showSettingsAlert()
			return 'denied'
		}
	}, [showSettingsAlert])

	// Accept disclosure → store consent, hide modal, proceed to OS permission
	const acceptDisclosure = useCallback(async () => {
		await AsyncStorage.setItem(STORAGE_KEYS.CONSENT, 'true')
		setShowDisclosure(false)
		const status = await requestOsPermission()
		if (disclosureResolveRef.current) {
			disclosureResolveRef.current(status)
			disclosureResolveRef.current = null
		}
	}, [requestOsPermission])

	// Decline disclosure → hide modal, no consent
	const declineDisclosure = useCallback(() => {
		setShowDisclosure(false)
		if (disclosureResolveRef.current) {
			disclosureResolveRef.current('denied')
			disclosureResolveRef.current = null
		}
	}, [])

	// Request permission — shows disclosure modal if consent not yet given
	const requestPermission = useCallback(async () => {
		try {
			// If consent already stored, go straight to OS permission
			const consent = await AsyncStorage.getItem(STORAGE_KEYS.CONSENT)
			if (consent === 'true') {
				return await requestOsPermission()
			}

			// On iOS, check if already authorized/denied before showing disclosure
			if (Platform.OS === 'ios') {
				const currentStatus = await Promise.race([
					Contacts.checkPermission(),
					new Promise((resolve) => setTimeout(() => resolve('undefined'), CONTACTS_CHECK_TIMEOUT_MS)),
				])

				if (currentStatus === 'authorized' || currentStatus === 'limited') {
					setPermissionStatus(currentStatus)
					await AsyncStorage.setItem(STORAGE_KEYS.CONSENT, 'true')
					return 'authorized'
				}

				if (currentStatus === 'denied') {
					setPermissionStatus('denied')
					return 'denied'
				}
			}

			// No consent yet — show the prominent disclosure modal and wait
			return new Promise((resolve) => {
				disclosureResolveRef.current = resolve
				setShowDisclosure(true)
			})
		} catch (e) {
			console.warn('Contacts permission request failed:', e.message)
			showSettingsAlert()
			return 'denied'
		}
	}, [requestOsPermission, showSettingsAlert])

	// Load cached matches from AsyncStorage
	const loadCachedMatches = useCallback(async () => {
		try {
			const cached = await AsyncStorage.getItem(STORAGE_KEYS.MATCHED)
			if (cached) {
				const parsed = JSON.parse(cached)
				setMatchedContacts(parsed)
				return parsed
			}
			return []
		} catch {
			return []
		}
	}, [])

	// Clear all synced data (used on logout)
	const clearSyncedData = useCallback(async () => {
		try {
			await AsyncStorage.multiRemove([
				STORAGE_KEYS.MATCHED,
				STORAGE_KEYS.LAST_SYNC,
				STORAGE_KEYS.CONSENT,
			])
			setMatchedContacts([])
		} catch { /* ignore */ }
	}, [])

	// Main sync function
	const syncContacts = useCallback(async ({ force = false, onSyncComplete } = {}) => {

		if (syncingRef.current) return
		syncingRef.current = true
		setIsSyncing(true)
		setError(null)

		try {
			// Check cooldown unless forced
			if (!force) {
				const lastSync = await AsyncStorage.getItem(STORAGE_KEYS.LAST_SYNC)
				if (lastSync && Date.now() - parseInt(lastSync, 10) < SYNC_COOLDOWN_MS) {
					await loadCachedMatches()
					return
				}
			}

			// Verify permission
			const permStatus = await checkPermission()
			if (permStatus !== 'authorized' && permStatus !== 'limited') {
				setError('Permiso de contactos no concedido')
				Toast.show({ type: 'error', text1: 'Permiso de contactos no concedido' })
				return
			}

			// Read all device contacts
			const deviceContacts = await Contacts.getAll()

			// Extract and normalize phone numbers
			const phoneMap = new Map()
			for (const contact of deviceContacts) {
				const contactName = [contact.givenName, contact.familyName].filter(Boolean).join(' ').trim() || contact.company || ''
				if (!contact.phoneNumbers) continue
				for (const phone of contact.phoneNumbers) {
					const normalized = normalizePhone(phone.number)
					if (normalized && !phoneMap.has(normalized)) {
						phoneMap.set(normalized, contactName)
					}
				}
			}

			const allPhones = Array.from(phoneMap.keys())
			if (allPhones.length === 0) {
				setMatchedContacts([])
				await AsyncStorage.setItem(STORAGE_KEYS.MATCHED, JSON.stringify([]))
				await AsyncStorage.setItem(STORAGE_KEYS.LAST_SYNC, String(Date.now()))
				Toast.show({ type: 'info', text1: 'No se encontraron números de teléfono en tus contactos' })
				return
			}

			// Send in batches
			const allMatches = []
			let totalAutoAdded = 0
			for (let i = 0; i < allPhones.length; i += BATCH_SIZE) {
				const batch = allPhones.slice(i, i + BATCH_SIZE)
				const result = await userApi.syncContacts(batch)
				if (!result.success) {
					throw new Error(result.error || 'Error al sincronizar contactos')
				}
				if (result.data?.matches) {
					allMatches.push(...result.data.matches)
				}
				if (result.data?.auto_added_count) {
					totalAutoAdded += result.data.auto_added_count
				}
			}

			// Merge with device contact names
			const merged = allMatches.map((match) => ({
				...match.user,
				deviceContactName: phoneMap.get(match.phone) || '',
				matchedPhone: match.phone,
			}))

			// Cache and update state
			await AsyncStorage.setItem(STORAGE_KEYS.MATCHED, JSON.stringify(merged))
			await AsyncStorage.setItem(STORAGE_KEYS.LAST_SYNC, String(Date.now()))
			setMatchedContacts(merged)

			if (totalAutoAdded > 0) {
				Toast.show({ type: 'success', text1: `${totalAutoAdded} contacto${totalAutoAdded > 1 ? 's' : ''} agregado${totalAutoAdded > 1 ? 's' : ''} automáticamente` })
			} else if (merged.length > 0) {
				Toast.show({ type: 'success', text1: 'Contactos sincronizados' })
			} else {
				Toast.show({ type: 'info', text1: 'Ninguno de tus contactos usa QvaPay aún' })
			}

			onSyncComplete?.()

		} catch (e) {
			setError(e.message || 'Error al sincronizar contactos')
			Toast.show({ type: 'error', text1: 'Error al sincronizar', text2: e.message })
			await loadCachedMatches()
		} finally {
			setIsSyncing(false)
			syncingRef.current = false
		}
	}, [loadCachedMatches, checkPermission])

	return {
		matchedContacts,
		permissionStatus,
		isSyncing,
		error,
		showDisclosure,
		checkPermission,
		requestPermission,
		acceptDisclosure,
		declineDisclosure,
		syncContacts,
		loadCachedMatches,
		clearSyncedData,
		openSettings,
	}
}

export default useDeviceContacts
