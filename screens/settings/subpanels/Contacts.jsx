import { useEffect, useState, useCallback, useMemo, useReducer } from 'react'
import { Alert, Text, View, Pressable, Platform } from 'react-native'
import { FlashList } from '@shopify/flash-list'

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

// The contacts resource (items + loading/error/refreshing flags) moves as one unit
const initialData = { contacts: [], loading: true, error: null, refreshing: false }

function dataReducer(state, action) {
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
const mapApiContactToUser = (contact) => {
	const contactUser = contact?.Contact || {}
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
const Contacts = ({ navigation }) => {

	// Theme
	const { theme } = useTheme()
	const textStyles = createTextStyles(theme)
	const containerStyles = createContainerStyles(theme)

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
		const ids = contacts.map(c => c?.Contact?.uuid).filter(Boolean)
		if (ids.length) trackUsers(ids)
		return () => { if (ids.length) untrackUsers(ids) }
	}, [contacts, trackUsers, untrackUsers])

	// Refresh contacts
	const refresh = useCallback(async () => {
		try {
			dispatchData({ type: 'refreshStart' })
			const res = await userApi.getContacts()
			if (res.success) {
				const list = Array.isArray(res.data) ? res.data : (res.data?.contacts || [])
				dispatchData({ type: 'refreshed', contacts: list })
			} else { toast.error(res.error || 'No se pudieron cargar los contactos'); dispatchData({ type: 'refreshDone' }) }
		} catch (e) { toast.error(e.message || 'Error de red'); dispatchData({ type: 'refreshDone' }) }
	}, [])

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
					'Permiso denegado',
					'Para sincronizar tus contactos, activa el permiso en la configuración de tu dispositivo.',
					[
						{ text: 'Cancelar', style: 'cancel' },
						{ text: 'Abrir Configuración', onPress: openSettings },
					]
				)
			} else {
				const result = await requestPermission()
				if (result === 'authorized') {
					syncDeviceContacts(syncOpts)
				} else if (result === 'denied') {
					Alert.alert(
						'Permiso denegado',
						'Para sincronizar tus contactos, activa el permiso en la configuración de tu dispositivo.',
						[
							{ text: 'Cancelar', style: 'cancel' },
							{ text: 'Abrir Configuración', onPress: openSettings },
						]
					)
				}
			}
		} finally {
			setIsResolvingPermission(false)
		}
	}, [checkPermission, requestPermission, syncDeviceContacts, openSettings, refresh])

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
						label: 'Sincronizar',
						icon: { type: 'sfSymbol', name: 'arrow.triangle.2.circlepath' },
						onPress: handleSyncPress,
					},
					{
						type: 'button',
						label: 'Agregar',
						icon: { type: 'sfSymbol', name: 'plus' },
						onPress: () => setShowAddModal(true),
					},
				],
			}),
		})
	}, [navigation, theme.colors.primaryText, handleSyncPress])

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
				const list = Array.isArray(res.data) ? res.data : (res.data?.contacts || [])
				dispatchData({ type: 'loaded', contacts: list })
			} else { dispatchData({ type: 'error', error: res.error || 'No se pudieron cargar los contactos' }) }
		} catch (e) { dispatchData({ type: 'error', error: e.message || 'Error de red' }) }
	}, [])

	useEffect(() => { load() }, [load])

	// Handle toggle favorite
	const handleToggleFavorite = useCallback(async (contact) => {
		const id = contact?.id
		if (!id) return
		try {
			const res = await userApi.toggleFavoriteContact(id)
			if (res.success) {
				dispatchData({ type: 'setContacts', contacts: data.contacts.map((c) => c.id === id ? { ...c, favorite: res.data.favorite } : c) })
			} else { toast.error(res.error || 'No se pudo actualizar') }
		} catch (e) { toast.error(e.message || 'Error de red') }
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [data.contacts])

	// Handle delete contact
	const handleDelete = useCallback((contact) => {
		const id = contact?.id || contact?.uuid || contact?.Contact?.uuid
		if (!id) { toast.error('ID de contacto inválido'); return }
		Alert.alert(
			'Eliminar contacto',
			'¿Seguro que deseas eliminar este contacto?',
			[
				{ text: 'Cancelar', style: 'cancel' },
				{
					text: 'Eliminar', style: 'destructive', onPress: async () => {
						try {
							const res = await userApi.deleteContact(id)
							if (res.success) { toast.success('Contacto eliminado'); refresh() }
							else { toast.error(res.error || 'No se pudo eliminar') }
						} catch (e) { toast.error(e.message || 'Error de red') }
					}
				}
			]
		)
	}, [refresh])

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

	const renderContact = useCallback(({ item: contact, index }) => (
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

	const keyExtractor = useCallback((item) => String(item.id || item.uuid), [])

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
								{contacts.length === 0 ? 'No tienes contactos guardados' : `Sin resultados para "${filterQuery}"`}
							</Text>
						</View>
					)}
					ListFooterComponent={<View style={{ height: 20 }} />}
					contentContainerStyle={containerStyles.scrollContainer}
					showsVerticalScrollIndicator={false}
					refreshControl={createHiddenRefreshControl(refreshing, refresh)}
					estimatedItemSize={70}
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
