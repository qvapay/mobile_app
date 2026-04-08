import { useEffect, useState, useCallback, useMemo } from 'react'
import { Alert, Text, View, Pressable, Modal, TouchableOpacity, ActivityIndicator, Platform } from 'react-native'
import { FlashList } from '@shopify/flash-list'

// Theme
import { useTheme } from '../../../theme/ThemeContext'
import { createTextStyles, createContainerStyles } from '../../../theme/themeUtils'

// UI
import QPLoader from '../../../ui/particles/QPLoader'
import QPInput from '../../../ui/particles/QPInput'
import QPButton from '../../../ui/particles/QPButton'
import QPAvatar from '../../../ui/particles/QPAvatar'
import ProfileContainerHorizontal from '../../../ui/ProfileContainerHorizontal'

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

// Prominent Disclosure Modal
import ContactsDisclosureModal from '../../../ui/ContactsDisclosureModal'

// Routes
import { ROUTES } from '../../../routes'

// Contacts Component
const Contacts = ({ navigation }) => {

	// Theme
	const { theme } = useTheme()
	const textStyles = createTextStyles(theme)
	const containerStyles = createContainerStyles(theme)

	// State
	const [loading, setLoading] = useState(true)
	const [contacts, setContacts] = useState([])
	const [error, setError] = useState(null)
	const [refreshing, setRefreshing] = useState(false)

	// Local filter
	const [filterQuery, setFilterQuery] = useState('')

	// Add modal states
	const [showAddModal, setShowAddModal] = useState(false)
	const [userSearch, setUserSearch] = useState('')
	const [searchResults, setSearchResults] = useState([])
	const [isSearching, setIsSearching] = useState(false)

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

	// Resolving permission state (show spinner while checking/requesting)
	const [isResolvingPermission, setIsResolvingPermission] = useState(false)

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

	// Map API contact to user
	const mapApiContactToUser = useCallback((contact) => {
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
	}, [])

	// Load contacts
	const load = useCallback(async () => {
		try {
			setLoading(true)
			setError(null)
			const res = await userApi.getContacts()
			if (res.success) {
				const list = Array.isArray(res.data) ? res.data : (res.data?.contacts || [])
				setContacts(list)
			} else { setError(res.error || 'No se pudieron cargar los contactos') }
		} catch (e) { setError(e.message || 'Error de red') }
		finally { setLoading(false) }
	}, [])

	useEffect(() => { load() }, [load])

	// Refresh contacts
	const refresh = useCallback(async () => {
		try {
			setRefreshing(true)
			const res = await userApi.getContacts()
			if (res.success) {
				const list = Array.isArray(res.data) ? res.data : (res.data?.contacts || [])
				setContacts(list)
			} else { toast.error(res.error || 'No se pudieron cargar los contactos') }
		} catch (e) { toast.error(e.message || 'Error de red') }
		finally { setRefreshing(false) }
	}, [])

	// Handle toggle favorite
	const handleToggleFavorite = useCallback(async (contact) => {
		const id = contact?.id
		if (!id) return
		try {
			const res = await userApi.toggleFavoriteContact(id)
			if (res.success) {
				setContacts((prev) => prev.map((c) => c.id === id ? { ...c, favorite: res.data.favorite } : c))
			} else { toast.error(res.error || 'No se pudo actualizar') }
		} catch (e) { toast.error(e.message || 'Error de red') }
	}, [])

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

	// Search handler
	const handleSearch = async () => {
		if (!userSearch.trim()) {
			setSearchResults([])
			return
		}
		try {
			setIsSearching(true)
			const result = await userApi.searchUser(userSearch)
			if (result.success) {
				setSearchResults(result.data || [])
			} else {
				setSearchResults([])
				toast.error(result.error || 'Error en la busqueda')
			}
		} catch (e) {
			setSearchResults([])
			toast.error(e.message || 'Error de red')
		} finally { setIsSearching(false) }
	}

	// Add contact handler
	const handleAddContact = async (selectedUser) => {
		try {
			const res = await userApi.addContact(selectedUser.uuid, selectedUser.name)
			if (res.success) {
				toast.success('Contacto agregado')
				setShowAddModal(false)
				setUserSearch('')
				setSearchResults([])
				refresh()
			} else { toast.error(res.error || 'No se pudo agregar el contacto') }
		} catch (e) { toast.error(e.message || 'Error de red') }
	}

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

	// FlatList renderItem: borderRadius solo en el primer (top) y último (bottom) contacto
	const renderContact = useCallback(({ item: contact, index }) => {
		const isFirst = index === 0
		const isLast = index === filteredContacts.length - 1
		const radius = theme.borderRadius?.md ?? 12
		const cardStyle = [
			containerStyles.card,
			{
				flexDirection: 'row',
				alignItems: 'center',
				justifyContent: 'space-between',
				marginVertical: 0,
				borderRadius: 0,
				...(isFirst && { borderTopLeftRadius: radius, borderTopRightRadius: radius }),
				...(isLast && { borderBottomLeftRadius: radius, borderBottomRightRadius: radius }),
			},
		]
		return (
			<View style={cardStyle}>
				<View style={{ flex: 1 }}>
					<ProfileContainerHorizontal user={mapApiContactToUser(contact)} size={52} />
				</View>
				<View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
					<Pressable onPress={() => navigation.navigate(ROUTES.SEND, { user_uuid: contact?.Contact?.uuid })} hitSlop={8}>
						<FontAwesome6 name="dollar-sign" size={18} color={theme.colors.success} iconStyle="solid" />
					</Pressable>
					<Pressable onPress={() => handleToggleFavorite(contact)} hitSlop={8}>
						<FontAwesome6 name="star" size={18} color={contact.favorite ? theme.colors.warning : theme.colors.tertiaryText} iconStyle={contact.favorite ? 'solid' : 'regular'} />
					</Pressable>
					<Pressable onPress={() => handleDelete(contact)} hitSlop={8}>
						<FontAwesome6 name="trash" size={16} color={theme.colors.danger} iconStyle="solid" />
					</Pressable>
				</View>
			</View>
		)
	}, [containerStyles.card, mapApiContactToUser, handleToggleFavorite, handleDelete, theme, filteredContacts.length, navigation])

	const keyExtractor = useCallback((item) => String(item.id || item.uuid), [])

	// FlatList header
	const listHeader = useMemo(() => (
		<>
			<Text style={textStyles.h1}>Contactos</Text>
			<Text style={[textStyles.h3, { color: theme.colors.secondaryText }]}>Personas a las que envias con frecuencia</Text>

			{contacts.length > 0 && (
				<QPInput
					placeholder="Buscar contacto ..."
					value={filterQuery}
					onChangeText={setFilterQuery}
					autoCapitalize="none"
					prefixIconName="magnifying-glass"
					style={{ marginTop: 12, marginBottom: 0 }}
				/>
			)}

			{error && (
				<View style={[containerStyles.card, { borderColor: theme.colors.danger, borderWidth: 1 }]}>
					<Text style={[textStyles.h6, { color: theme.colors.danger }]}>{String(error)}</Text>
				</View>
			)}

			{isSyncing && (
				<View style={[containerStyles.card, { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 10 }]}>
					<ActivityIndicator size="small" color={theme.colors.primary} />
					<Text style={[textStyles.h6, { color: theme.colors.secondaryText }]}>Sincronizando contactos...</Text>
				</View>
			)}

			{permissionStatus !== 'authorized' && permissionStatus !== 'limited' && (
				<Pressable
					onPress={isResolvingPermission ? undefined : handleSyncPress}
					disabled={isResolvingPermission}
					style={[containerStyles.card, {
						borderColor: theme.colors.primary,
						borderWidth: 1,
						flexDirection: 'row',
						alignItems: 'center',
						gap: 12,
						marginTop: 10,
						opacity: isResolvingPermission ? 0.8 : 1,
					}]}
				>
					{isResolvingPermission ? (
						<ActivityIndicator size="small" color={theme.colors.primary} />
					) : (
						<FontAwesome6 name="address-book" size={28} color={theme.colors.primary} iconStyle="solid" />
					)}
					<View style={{ flex: 1 }}>
						<Text style={[textStyles.h5, { color: theme.colors.primaryText, fontWeight: '600' }]}>
							{isResolvingPermission ? 'Solicitando permiso...' : 'Sincronizar agenda'}
						</Text>
						<Text style={[textStyles.h6, { color: theme.colors.secondaryText }]}>
							Encuentra amigos que usan QvaPay
						</Text>
					</View>
					{!isResolvingPermission && (
						<FontAwesome6 name="chevron-right" size={14} color={theme.colors.tertiaryText} iconStyle="solid" />
					)}
				</Pressable>
			)}

			{filteredContacts.length > 0 && (
				<Text style={[textStyles.h5, { color: theme.colors.primaryText, fontWeight: '600', marginTop: 10, marginBottom: 8 }]}>
					Contactos guardados ({filteredContacts.length})
				</Text>
			)}
		</>
	), [textStyles, containerStyles, theme.colors, contacts.length, filterQuery, error, isSyncing, permissionStatus, isResolvingPermission, handleSyncPress, filteredContacts.length])

	const listEmpty = useMemo(() => (
		<View style={[containerStyles.card, { alignItems: 'center' }]}>
			<Text style={[textStyles.h6, { color: theme.colors.secondaryText }]}>
				{contacts.length === 0 ? 'No tienes contactos guardados' : `Sin resultados para "${filterQuery}"`}
			</Text>
		</View>
	), [containerStyles.card, textStyles.h6, theme.colors.secondaryText, contacts.length, filterQuery])

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
					ListEmptyComponent={listEmpty}
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
			<Modal visible={showAddModal} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowAddModal(false)}>

				<View style={[containerStyles.subContainer, { flex: 1, backgroundColor: theme.colors.background, paddingTop: 20, paddingHorizontal: 0 }]}>

					{/* Modal Header */}
					<View style={{
						flexDirection: 'row',
						alignItems: 'center',
						justifyContent: 'space-between',
						marginBottom: 20,
						paddingHorizontal: 20
					}}>
						<Text style={[textStyles.h4, { color: theme.colors.primaryText }]}>
							Agregar Contacto
						</Text>
						<TouchableOpacity
							onPress={() => setShowAddModal(false)}
							style={{
								backgroundColor: theme.colors.elevation,
								width: 32,
								height: 32,
								borderRadius: 16,
								justifyContent: 'center',
								alignItems: 'center'
							}}
						>
							<FontAwesome6 name="xmark" size={16} color={theme.colors.primaryText} iconStyle="solid" />
						</TouchableOpacity>
					</View>

					{/* Search Input */}
					<View style={{ paddingHorizontal: 20, marginBottom: 20 }}>
						<View style={{ flexDirection: 'row', borderRadius: 10, overflow: 'hidden', borderWidth: 1, borderColor: theme.colors.primary, backgroundColor: theme.colors.surface, alignItems: 'center', height: 50 }}>
							<View style={{ flex: 1 }}>
								<QPInput
									placeholder="Buscar usuario ..."
									value={userSearch}
									onChangeText={setUserSearch}
									disabled={isSearching}
									autoCapitalize="none"
									prefixIconName="user"
									style={{
										borderTopRightRadius: 0,
										borderBottomRightRadius: 0,
										borderWidth: 0,
										marginVertical: 0,
										height: '100%',
									}}
								/>
							</View>
							<QPButton
								title=""
								onPress={handleSearch}
								disabled={isSearching}
								loading={isSearching}
								textStyle={{ color: theme.colors.almostWhite }}
								icon="magnifying-glass"
								iconStyle="solid"
								iconColor={theme.colors.almostWhite}
								style={{
									width: 50,
									height: '100%',
									borderRadius: 0,
									marginVertical: 0,
								}}
							/>
						</View>
					</View>

					{/* Search Results */}
					<View style={{ flex: 1, paddingHorizontal: 20 }}>
						{searchResults.length > 0 ? (
							<FlashList
								data={searchResults}
								keyExtractor={(item) => item.uuid}
								showsVerticalScrollIndicator={false}
								estimatedItemSize={80}
								renderItem={({ item }) => (
									<View style={{
										backgroundColor: theme.colors.surface,
										borderRadius: 12,
										padding: 16,
										marginBottom: 8,
										borderWidth: 1,
										borderColor: theme.colors.border,
										flexDirection: 'row',
										alignItems: 'center',
										gap: 12
									}}>
										<QPAvatar user={item} size={48} />
										<View style={{ flex: 1 }}>
											<Text style={[textStyles.h6, { color: theme.colors.primaryText, fontWeight: '600' }]}>
												{item.name} {item.lastname}
											</Text>
											<Text style={[textStyles.h6, { color: theme.colors.secondaryText }]}>
												@{item.username}
											</Text>
										</View>
										<TouchableOpacity
											onPress={() => handleAddContact(item)}
											style={{
												backgroundColor: theme.colors.primary,
												borderRadius: 8,
												paddingHorizontal: 12,
												paddingVertical: 6,
											}}
										>
											<Text style={[textStyles.h6, { color: theme.colors.almostWhite, fontWeight: '600' }]}>Agregar</Text>
										</TouchableOpacity>
									</View>
								)}
							/>
						) : userSearch.trim() && !isSearching ? (
							<View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', paddingVertical: 40 }}>
								<FontAwesome6 name="user-slash" size={48} color={theme.colors.tertiaryText} iconStyle="solid" />
								<Text style={[textStyles.h6, { color: theme.colors.tertiaryText, marginTop: 16, textAlign: 'center' }]}>
									No se encontraron usuarios
								</Text>
								<Text style={[textStyles.h6, { color: theme.colors.tertiaryText, marginTop: 8, textAlign: 'center' }]}>
									Intenta con otro nombre o username
								</Text>
							</View>
						) : (
							<View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', paddingVertical: 40 }}>
								<FontAwesome6 name="magnifying-glass" size={48} color={theme.colors.tertiaryText} iconStyle="solid" />
								<Text style={[textStyles.h6, { color: theme.colors.tertiaryText, marginTop: 16, textAlign: 'center' }]}>
									Busca por nombre, username o email
								</Text>
							</View>
						)}
					</View>
				</View>
			</Modal>
		</>
	)
}

export default Contacts
