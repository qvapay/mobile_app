import { useEffect, useState, useCallback, useMemo, useReducer } from 'react'
import { Alert, Text, View, Pressable, Platform } from 'react-native'
import { FlashList } from '@shopify/flash-list'
import { useTranslation } from 'react-i18next'

// Theme
import { useTheme } from '../../../theme/ThemeContext'
import { createTextStyles, createContainerStyles } from '../../../theme/themeUtils'

// UI
import ContactRow from './ContactRow'
import QPLoader from '../../../ui/particles/QPLoader'
import ContactsListHeader from './ContactsListHeader'
import AddContactModal from './AddContactModal'

// Icons
import FontAwesome6 from '@react-native-vector-icons/fontawesome6'

// API
import { userApi } from '../../../api/userApi'

// Toast
import { toast } from 'sonner-native'

// Pull-to-refresh
import { createHiddenRefreshControl } from '../../../ui/QPRefreshIndicator'

// Device Contacts Hook
import useDeviceContacts from '../../../hooks/useDeviceContacts'

// Online Status
import { useOnlineStatus } from '../../../hooks/OnlineStatusContext'

// Prominent Disclosure Modal
import ContactsDisclosureModal from '../../../ui/ContactsDisclosureModal'

// Routes
import { ROUTES } from '../../../routes'

// Tipos
import type { ReactElement } from 'react'
import type { RefreshControlProps } from 'react-native'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import type { CompositeScreenProps } from '@react-navigation/native'
import type { ListRenderItemInfo } from '@shopify/flash-list'
import type { RootStackParamList, SettingsStackParamList } from '../../../types/navigation'
import type { ApiContact, ContactUser } from './ContactRow'

/** Contactos + banderas de carga: se mueven como una unidad. */
type ContactsData = {
	contacts: ApiContact[]
	loading: boolean
	error: string | null
	refreshing: boolean
}

type ContactsAction =
	| { type: 'loadStart' }
	| { type: 'loaded', contacts: ApiContact[] }
	| { type: 'error', error: string }
	| { type: 'refreshStart' }
	| { type: 'refreshed', contacts: ApiContact[] }
	| { type: 'refreshDone' }
	| { type: 'setContacts', contacts: ApiContact[] }

/** Los contactos se navegan desde Ajustes pero envían dinero por el root (Send). */
type ContactsProps = CompositeScreenProps<
	NativeStackScreenProps<SettingsStackParamList, 'Contacts'>,
	NativeStackScreenProps<RootStackParamList>
>

// The contacts resource (items + loading/error/refreshing flags) moves as one unit
const initialData: ContactsData = { contacts: [], loading: true, error: null, refreshing: false }

function dataReducer(state: ContactsData, action: ContactsAction): ContactsData {
	switch (action.type) {
		case 'loadStart':
			return { ...state, loading: true, error: null }
		case 'loaded':
			return { ...state, contacts: action.contacts, loading: false }
		case 'error':
			return { ...state, error: action.error, loading: false }
		case 'refreshStart':
			return { ...state, refreshing: true }
		case 'refreshed':
			return { ...state, contacts: action.contacts, refreshing: false }
		case 'refreshDone':
			return { ...state, refreshing: false }
		case 'setContacts':
			return { ...state, contacts: action.contacts }
		default:
			return state
	}
}

// Map API contact to user
const mapApiContactToUser = (contact: ApiContact): ContactUser => {
	const contactUser: ContactUser = contact?.Contact || {}
	return {
		uuid: contactUser.uuid,
		name: contactUser.name || contact?.name,
		image: contactUser.image,
		username: contactUser.username,
		kyc: !!contactUser.kyc,
		vip: !!contactUser.vip,
		golden_check: !!contactUser.golden_check,
		phone_verified: !!contactUser.phone_verified,
		telegram_verified: !!contactUser.telegram_verified,
	}
}

// Contacts Component
const Contacts = ({ navigation }: ContactsProps) => {

	// Theme
	const { theme } = useTheme()
	const textStyles = createTextStyles(theme)
	const containerStyles = createContainerStyles(theme)

	// Idioma activo
	const { t } = useTranslation()

	// Online status
	const { trackUsers, untrackUsers, isUserOnline } = useOnlineStatus()

	// Contacts resource state
	const [data, dispatchData] = useReducer(dataReducer, initialData)
	const { contacts, loading, error, refreshing } = data

	// Local filter
	const [filterQuery, setFilterQuery] = useState('')

	// Add modal + permission resolution
	const [showAddModal, setShowAddModal] = useState(false)
	const [isResolvingPermission, setIsResolvingPermission] = useState(false)

	// Device contacts hook
	const {
		permissionStatus,
		isSyncing,
		showDisclosure,
		checkPermission,
		requestPermission,
		acceptDisclosure,
		declineDisclosure,
		syncContacts: syncDeviceContacts,
		openSettings,
	} = useDeviceContacts()

	// Track contacts for online status
	useEffect(() => {
		// `filter(Boolean)` no estrecha el tipo en TS: el cast fija el contrato de trackUsers.
		const ids = contacts.map(c => c?.Contact?.uuid).filter(Boolean) as string[]
		if (ids.length) trackUsers(ids)
		return () => { if (ids.length) untrackUsers(ids) }
	}, [contacts, trackUsers, untrackUsers])

	// Refresh contacts
	const refresh = useCallback(async () => {
		try {
			dispatchData({ type: 'refreshStart' })
			const res = await userApi.getContacts()
			if (res.success) {
				// getContacts declara `ApiResult<unknown[]>`: el backend manda array pelado O `{ contacts }`.
				const list = (Array.isArray(res.data) ? res.data : ((res.data as { contacts?: ApiContact[] } | undefined)?.contacts || [])) as ApiContact[]
				dispatchData({ type: 'refreshed', contacts: list })
			} else { toast.error(res.error || t('settings.contacts.toasts.loadFailed')); dispatchData({ type: 'refreshDone' }) }
		} catch (e) { toast.error((e as Error).message || t('settings.contacts.toasts.networkError')); dispatchData({ type: 'refreshDone' }) }
	}, [t])

	// Handle sync button press
	const handleSyncPress = useCallback(async () => {
		setIsResolvingPermission(true)
		const syncOpts = { force: true, onSyncComplete: refresh }
		try {
			const status = await checkPermission()
			if (status === 'authorized' || status === 'limited') {
				syncDeviceContacts(syncOpts)
			} else if (status === 'denied') {
				Alert.alert(
					t('settings.contacts.alerts.permissionDeniedTitle'),
					t('settings.contacts.alerts.permissionDeniedBody'),
					[
						{ text: t('common.actions.cancel'), style: 'cancel' },
						{ text: t('common.actions.openSettings'), onPress: openSettings },
					]
				)
			} else {
				const result = await requestPermission()
				if (result === 'authorized') {
					syncDeviceContacts(syncOpts)
				} else if (result === 'denied') {
					Alert.alert(
						t('settings.contacts.alerts.permissionDeniedTitle'),
						t('settings.contacts.alerts.permissionDeniedBody'),
						[
							{ text: t('common.actions.cancel'), style: 'cancel' },
							{ text: t('common.actions.openSettings'), onPress: openSettings },
						]
					)
				}
			}
		} finally {
			setIsResolvingPermission(false)
		}
	}, [checkPermission, requestPermission, syncDeviceContacts, openSettings, refresh, t])

	// Header buttons: sync + add
	useEffect(() => {
		navigation.setOptions({
			// Android fallback
			headerRight: () => (
				<View style={{ flexDirection: 'row', alignItems: 'center', gap: 20 }}>
					<Pressable onPress={handleSyncPress} hitSlop={10}>
						<FontAwesome6 name="arrows-rotate" size={22} color={theme.colors.primaryText} iconStyle="solid" />
					</Pressable>
					<Pressable onPress={() => setShowAddModal(true)} hitSlop={10}>
						<FontAwesome6 name="plus" size={22} color={theme.colors.primaryText} iconStyle="solid" />
					</Pressable>
				</View>
			),
			// iOS native header items (liquid glass compatible)
			...(Platform.OS === 'ios' && {
				unstable_headerRightItems: () => [
					{
						type: 'button',
						label: t('settings.contacts.header.sync'),
						icon: { type: 'sfSymbol', name: 'arrow.triangle.2.circlepath' },
						onPress: handleSyncPress,
					},
					{
						type: 'button',
						label: t('settings.contacts.header.add'),
						icon: { type: 'sfSymbol', name: 'plus' },
						onPress: () => setShowAddModal(true),
					},
				],
			}),
		})
	}, [navigation, theme.colors.primaryText, handleSyncPress, t])

	// Check permission on mount
	useEffect(() => {
		checkPermission()
	}, [checkPermission])

	// Load contacts
	const load = useCallback(async () => {
		try {
			dispatchData({ type: 'loadStart' })
			const res = await userApi.getContacts()
			if (res.success) {
				// getContacts declara `ApiResult<unknown[]>`: el backend manda array pelado O `{ contacts }`.
				const list = (Array.isArray(res.data) ? res.data : ((res.data as { contacts?: ApiContact[] } | undefined)?.contacts || [])) as ApiContact[]
				dispatchData({ type: 'loaded', contacts: list })
			} else { dispatchData({ type: 'error', error: res.error || t('settings.contacts.toasts.loadFailed') }) }
		} catch (e) { dispatchData({ type: 'error', error: (e as Error).message || t('settings.contacts.toasts.networkError') }) }
	}, [t])

	useEffect(() => { load() }, [load])

	// Handle toggle favorite
	const handleToggleFavorite = useCallback(async (contact: ApiContact) => {
		const id = contact?.id
		if (!id) return
		try {
			// `toggleFavoriteContact` declara `contact_id: number`; el id del contacto puede
			// llegar como string del backend — se manda tal cual (el endpoint lo acepta).
			const res = await userApi.toggleFavoriteContact(id as number)
			if (res.success) {
				// toggleFavoriteContact declara `ApiResult<unknown>`: forma local del envelope.
				const toggled = res.data as { favorite?: boolean } | undefined
				dispatchData({ type: 'setContacts', contacts: data.contacts.map((c) => c.id === id ? { ...c, favorite: toggled!.favorite } : c) })
			} else { toast.error(res.error || t('settings.contacts.toasts.updateFailed')) }
		} catch (e) { toast.error((e as Error).message || t('settings.contacts.toasts.networkError')) }
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [data.contacts, t])

	// Handle delete contact
	const handleDelete = useCallback((contact: ApiContact) => {
		const id = contact?.id || contact?.uuid || contact?.Contact?.uuid
		if (!id) { toast.error(t('settings.contacts.toasts.invalidContactId')); return }
		Alert.alert(
			t('settings.contacts.alerts.deleteTitle'),
			t('settings.contacts.alerts.deleteBody'),
			[
				{ text: t('common.actions.cancel'), style: 'cancel' },
				{
					text: t('common.actions.delete'), style: 'destructive', onPress: async () => {
						try {
							const res = await userApi.deleteContact(id)
							if (res.success) { toast.success(t('settings.contacts.toasts.deleted')); refresh() }
							else { toast.error(res.error || t('settings.contacts.toasts.deleteFailed')) }
						} catch (e) { toast.error((e as Error).message || t('settings.contacts.toasts.networkError')) }
					}
				}
			]
		)
	}, [refresh, t])

	// Filter contacts locally
	const query = filterQuery.trim().toLowerCase()
	const filteredContacts = useMemo(() => {
		if (!query) return contacts
		return contacts.filter((c) => {
			const u = c?.Contact || {}
			const name = (u.name || c?.name || '').toLowerCase()
			const username = (u.username || '').toLowerCase()
			return name.includes(query) || username.includes(query)
		})
	}, [contacts, query])

	const renderContact = useCallback(({ item: contact, index }: ListRenderItemInfo<ApiContact>) => (
		<ContactRow
			contact={contact}
			user={mapApiContactToUser(contact)}
			isFirst={index === 0}
			isLast={index === filteredContacts.length - 1}
			isOnline={isUserOnline(contact?.Contact?.uuid)}
			theme={theme}
			containerStyles={containerStyles}
			onSend={() => navigation.navigate(ROUTES.SEND, { user_uuid: contact?.Contact?.uuid })}
			onToggleFavorite={() => handleToggleFavorite(contact)}
			onDelete={() => handleDelete(contact)}
		/>
	), [containerStyles, handleToggleFavorite, handleDelete, theme, filteredContacts.length, navigation, isUserOnline])

	const keyExtractor = useCallback((item: ApiContact) => String(item.id || item.uuid), [])

	const listHeader = (
		<ContactsListHeader
			contactsCount={contacts.length}
			filteredCount={filteredContacts.length}
			filterQuery={filterQuery}
			onChangeFilter={setFilterQuery}
			error={error}
			isSyncing={isSyncing}
			permissionStatus={permissionStatus}
			isResolvingPermission={isResolvingPermission}
			onSyncPress={handleSyncPress}
			theme={theme}
			textStyles={textStyles}
			containerStyles={containerStyles}
		/>
	)

	// Render
	if (loading) { return (<QPLoader />) }

	return (
		<>
			<View style={containerStyles.subContainer}>
				<FlashList
					data={filteredContacts}
					keyExtractor={keyExtractor}
					renderItem={renderContact}
					extraData={filteredContacts.length}
					ListHeaderComponent={listHeader}
					ListEmptyComponent={(
						<View style={[containerStyles.card, { alignItems: 'center' }]}>
							<Text style={[textStyles.h6, { color: theme.colors.secondaryText }]}>
								{contacts.length === 0 ? t('settings.contacts.emptyList') : t('settings.contacts.noResults', { query: filterQuery })}
							</Text>
						</View>
					)}
					ListFooterComponent={<View style={{ height: 20 }} />}
					contentContainerStyle={containerStyles.scrollContainer}
					showsVerticalScrollIndicator={false}
					refreshControl={createHiddenRefreshControl(refreshing, refresh) as ReactElement<RefreshControlProps>}
					{...({ estimatedItemSize: 70 } as object)}
				/>
			</View>

			{/* Contacts Prominent Disclosure Modal */}
			<ContactsDisclosureModal visible={showDisclosure} onAccept={acceptDisclosure} onDecline={declineDisclosure} />

			{/* Add Contact Modal */}
			<AddContactModal
				visible={showAddModal}
				onClose={() => setShowAddModal(false)}
				onAdded={refresh}
				theme={theme}
				textStyles={textStyles}
				containerStyles={containerStyles}
			/>
		</>
	)
}

export default Contacts
