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
	const syncingRef = useRef(false)

	// Open device settings
	const openSettings = useCallback(() => {
		if (Platform.OS === 'ios') {
			Linking.openURL('app-settings:')
		} else {
			Linking.openSettings()
		}
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

	// Request permission — Android uses PermissionsAndroid, iOS uses Contacts library
	const requestPermission = useCallback(async () => {
		try {
			if (Platform.OS === 'android') {
				const granted = await PermissionsAndroid.request(
					PermissionsAndroid.PERMISSIONS.READ_CONTACTS,
					{
						title: 'Acceso a contactos',
						message: 'QvaPay necesita acceso a tus contactos para encontrar amigos que usan la app.',
						buttonPositive: 'Permitir',
						buttonNegative: 'Cancelar',
					}
				)
				const status = granted === PermissionsAndroid.RESULTS.GRANTED ? 'authorized' : 'denied'
				setPermissionStatus(status)
				if (status === 'authorized') {
					await AsyncStorage.setItem(STORAGE_KEYS.CONSENT, 'true')
				}
				return status
			}

			// iOS — use checkPermission with timeout (iOS 18+ may hang), then requestPermission
			const currentStatus = await Promise.race([
				Contacts.checkPermission(),
				new Promise((resolve) => setTimeout(() => resolve('undefined'), CONTACTS_CHECK_TIMEOUT_MS)),
			])

			if (currentStatus === 'authorized' || currentStatus === 'limited') {
				setPermissionStatus(currentStatus)
				return 'authorized'
			}

			if (currentStatus === 'denied') {
				setPermissionStatus('denied')
				return 'denied'
			}

			// Status is 'undefined' (first time) — show explanatory alert before OS dialog
			return new Promise((resolve) => {
				Alert.alert(
					'Sincronizar agenda',
					'QvaPay revisará los números de teléfono de tus contactos para encontrar amigos que ya usan la app. Tus contactos se envían de forma segura.',
					[
						{ text: 'Ahora no', style: 'cancel', onPress: () => resolve('denied') },
						{
							text: 'Continuar',
							onPress: async () => {
								try {
									const status = await Contacts.requestPermission()
									setPermissionStatus(status)
									if (status === 'authorized' || status === 'limited') {
										await AsyncStorage.setItem(STORAGE_KEYS.CONSENT, 'true')
										resolve('authorized')
									} else {
										resolve('denied')
									}
								} catch {
									Toast.show({ type: 'error', text1: 'No se pudo solicitar el permiso' })
									resolve('denied')
								}
							},
						},
					]
				)
			})
		} catch (e) {
			console.warn('Contacts permission request failed:', e.message)
			showSettingsAlert()
			return 'denied'
		}
	}, [showSettingsAlert])

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
		checkPermission,
		requestPermission,
		syncContacts,
		loadCachedMatches,
		clearSyncedData,
		openSettings,
	}
}

export default useDeviceContacts
