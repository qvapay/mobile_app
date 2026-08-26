import { useState, useCallback, useRef } from 'react'
import { Alert, Platform, Linking, PermissionsAndroid } from 'react-native'
import Contacts from 'react-native-contacts'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { toast } from 'sonner-native'
import { userApi } from '../api/userApi'
import i18n from '../i18n'
import type { ApiResult } from '../types/api'

const STORAGE_KEYS = {
	MATCHED: 'device_contacts_matched',
	LAST_SYNC: 'device_contacts_last_sync',
	CONSENT: 'device_contacts_consent',
}

const BATCH_SIZE = 2000
const SYNC_COOLDOWN_MS = 15 * 60 * 1000
const CONTACTS_CHECK_TIMEOUT_MS = 2000

/** Estado del permiso de contactos (unión de iOS y Android; iOS 18+ añade 'limited'). */
export type ContactsPermissionStatus = 'authorized' | 'denied' | 'undefined' | 'limited'

/** Usuario QvaPay matcheado, enriquecido con el nombre local del contacto. */
export type MatchedContact = Record<string, unknown> & {
	deviceContactName: string
	matchedPhone: string
}

/** Item de `data.matches` de `POST /user/contacts/sync`. */
type ContactMatch = { phone: string, user: Record<string, unknown> }

/** Payload de `POST /user/contacts/sync`. */
type ContactsSyncPayload = { matches?: ContactMatch[], auto_added_count?: number }

/** Contrato del hook (ver doc de `useDeviceContacts`). */
export type DeviceContacts = {
	matchedContacts: MatchedContact[]
	permissionStatus: ContactsPermissionStatus
	isSyncing: boolean
	error: string | null
	showDisclosure: boolean
	checkPermission: () => Promise<ContactsPermissionStatus>
	requestPermission: () => Promise<'authorized' | 'denied'>
	acceptDisclosure: () => Promise<void>
	declineDisclosure: () => void
	syncContacts: (options?: { force?: boolean, onSyncComplete?: () => void }) => Promise<void>
	loadCachedMatches: () => Promise<MatchedContact[]>
	clearSyncedData: () => Promise<void>
	openSettings: () => void
}

/**
 * Normalizes a phone number to a loose E.164-like form for matching:
 * strips formatting characters, converts a leading "00" to "+", prefixes "+"
 * when missing, and rejects anything with fewer than 5 digits.
 * @param raw - Number as stored in the device contact.
 * @returns Normalized number, or null when unusable.
 */
const normalizePhone = (raw: string | null | undefined): string | null => {
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
 * Reads device contacts, syncs their phone numbers with the backend and caches
 * the matched QvaPay users in AsyncStorage.
 *
 * Permission flow: an in-app "prominent disclosure" modal (Play Store policy)
 * must be accepted once before the OS permission is requested; consent is then
 * persisted so later requests skip straight to the OS dialog. iOS
 * `Contacts.checkPermission()` can hang on iOS 18+, so every check races a 2s
 * timeout. Syncs are throttled to one per 15 minutes unless `force` is passed,
 * and phone numbers are uploaded in batches of 2000. Android checks permission
 * via PermissionsAndroid; iOS treats 'limited' access as authorized.
 * All toasts/errors are localized user-facing strings.
 *
 * @returns `{ matchedContacts, permissionStatus, isSyncing, error,
 *   showDisclosure, checkPermission, requestPermission, acceptDisclosure,
 *   declineDisclosure, syncContacts, loadCachedMatches, clearSyncedData, openSettings }`
 *   — `requestPermission` resolves 'authorized' | 'denied' (waiting on the
 *   disclosure modal when consent is missing); `syncContacts` accepts
 *   `{ force, onSyncComplete }`; `clearSyncedData` wipes cache + consent on logout.
 */
const useDeviceContacts = (): DeviceContacts => {

	const [matchedContacts, setMatchedContacts] = useState<MatchedContact[]>([])
	const [permissionStatus, setPermissionStatus] = useState<ContactsPermissionStatus>('undefined')
	const [isSyncing, setIsSyncing] = useState(false)
	const [error, setError] = useState<string | null>(null)
	const [showDisclosure, setShowDisclosure] = useState(false)
	const syncingRef = useRef(false)
	// Holds a resolve callback so acceptDisclosure can continue the permission flow
	const disclosureResolveRef = useRef<((status: 'authorized' | 'denied') => void) | null>(null)

	// Open device settings
	const openSettings = useCallback(() => {
		if (Platform.OS === 'ios') {
			Linking.openURL('app-settings:')
		} else { Linking.openSettings() }
	}, [])

	// Show alert to guide user to Settings
	const showSettingsAlert = useCallback(() => {
		Alert.alert(
			i18n.t('hooks.deviceContacts.alerts.permissionTitle'),
			i18n.t('hooks.deviceContacts.alerts.permissionBody'),
			[
				{ text: i18n.t('common.actions.cancel'), style: 'cancel' },
				{ text: i18n.t('common.actions.openSettings'), onPress: openSettings },
			]
		)
	}, [openSettings])

	// Check current permission status
	const checkPermission = useCallback(async (): Promise<ContactsPermissionStatus> => {
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
				new Promise<ContactsPermissionStatus>((resolve) => setTimeout(() => resolve('undefined'), CONTACTS_CHECK_TIMEOUT_MS)),
			])
			setPermissionStatus(status)
			return status
		} catch (e) {
			console.warn('Contacts.checkPermission failed:', (e as Error).message)
			setPermissionStatus('undefined')
			return 'undefined'
		}
	}, [])

	// Actually request the OS-level permission (called after consent is given)
	const requestOsPermission = useCallback(async (): Promise<'authorized' | 'denied'> => {
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
			console.warn('OS permission request failed:', (e as Error).message)
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
	const requestPermission = useCallback(async (): Promise<'authorized' | 'denied'> => {
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
					new Promise<ContactsPermissionStatus>((resolve) => setTimeout(() => resolve('undefined'), CONTACTS_CHECK_TIMEOUT_MS)),
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
			return new Promise<'authorized' | 'denied'>((resolve) => {
				disclosureResolveRef.current = resolve
				setShowDisclosure(true)
			})
		} catch (e) {
			console.warn('Contacts permission request failed:', (e as Error).message)
			showSettingsAlert()
			return 'denied'
		}
	}, [requestOsPermission, showSettingsAlert])

	// Load cached matches from AsyncStorage
	const loadCachedMatches = useCallback(async (): Promise<MatchedContact[]> => {
		try {
			const cached = await AsyncStorage.getItem(STORAGE_KEYS.MATCHED)
			if (cached) {
				const parsed = JSON.parse(cached) as MatchedContact[]
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
			await AsyncStorage.removeMany([
				STORAGE_KEYS.MATCHED,
				STORAGE_KEYS.LAST_SYNC,
				STORAGE_KEYS.CONSENT,
			])
			setMatchedContacts([])
		} catch { /* ignore */ }
	}, [])

	// Main sync function
	const syncContacts = useCallback(async ({ force = false, onSyncComplete }: { force?: boolean, onSyncComplete?: () => void } = {}) => {

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
				setError(i18n.t('hooks.deviceContacts.toasts.permissionDenied'))
				toast.error(i18n.t('hooks.deviceContacts.toasts.permissionDenied'))
				return
			}

			// Read all device contacts
			const deviceContacts = await Contacts.getAll()

			// Extract and normalize phone numbers
			const phoneMap = new Map<string, string>()
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
				toast.info(i18n.t('hooks.deviceContacts.toasts.noPhoneNumbers'))
				return
			}

			// Send all batches concurrently
			const batches = []
			for (let i = 0; i < allPhones.length; i += BATCH_SIZE) { batches.push(allPhones.slice(i, i + BATCH_SIZE)) }
			const results = await Promise.all(batches.map((batch) => userApi.syncContacts(batch))) as ApiResult<ContactsSyncPayload>[]

			const allMatches: ContactMatch[] = []
			let totalAutoAdded = 0
			for (const result of results) {
				if (!result.success) { throw new Error(result.error || i18n.t('hooks.deviceContacts.syncFailed')) }
				if (result.data?.matches) { allMatches.push(...result.data.matches) }
				if (result.data?.auto_added_count) { totalAutoAdded += result.data.auto_added_count }
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
				toast.success(i18n.t('hooks.deviceContacts.toasts.autoAdded', { count: totalAutoAdded }))
			} else if (merged.length > 0) {
				toast.success(i18n.t('hooks.deviceContacts.toasts.synced'))
			} else { toast.info(i18n.t('hooks.deviceContacts.toasts.noneOnQvaPay')) }

			onSyncComplete?.()

		} catch (e) {
			setError((e as Error).message || i18n.t('hooks.deviceContacts.syncFailed'))
			toast.error(i18n.t('hooks.deviceContacts.toasts.syncErrorTitle'), { description: (e as Error).message })
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
