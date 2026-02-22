import { useEffect, useState, useCallback } from 'react'
import { Alert, ScrollView, StyleSheet, Text, View, Pressable, Modal, FlatList, TouchableOpacity, ActivityIndicator, Platform } from 'react-native'

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
import Toast from 'react-native-toast-message'

// User AuthContext
import { useAuth } from '../../../auth/AuthContext'

// Pull-to-refresh
import { createHiddenRefreshControl } from '../../../ui/QPRefreshIndicator'

// Device Contacts Hook
import useDeviceContacts from '../../../hooks/useDeviceContacts'

// Contacts Component
const Contacts = ({ navigation }) => {

	// User
	const { user } = useAuth()

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
		matchedContacts,
		permissionStatus,
		isSyncing,
		checkPermission,
		requestPermission,
		syncContacts: syncDeviceContacts,
		loadCachedMatches,
		openSettings,
	} = useDeviceContacts()

	// Resolving permission state (show spinner while checking/requesting)
	const [isResolvingPermission, setIsResolvingPermission] = useState(false)

	// Handle sync button press
	const handleSyncPress = useCallback(async () => {
		setIsResolvingPermission(true)
		try {
			const status = await checkPermission()
			if (status === 'authorized' || status === 'limited') {
				syncDeviceContacts({ force: true })
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
					syncDeviceContacts({ force: true })
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
	}, [checkPermission, requestPermission, syncDeviceContacts, openSettings])

	// Header buttons: sync + add
	useEffect(() => {
		navigation.setOptions({
			// Android fallback
			headerRight: () => (
				<View style={{ flexDirection: 'row', alignItems: 'center', gap: 20 }}>
					<Pressable onPress={handleSyncPress} hitSlop={10}>
						<FontAwesome6 name="address-book" size={22} color={theme.colors.primaryText} iconStyle="solid" />
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
						icon: { type: 'sfSymbol', name: 'person.2' },
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

	// Load cached matches on mount
	useEffect(() => {
		checkPermission()
		loadCachedMatches()
	}, [checkPermission, loadCachedMatches])

	// Map API contact to user
	const mapApiContactToUser = useCallback((contact) => {
		const user = contact?.Contact || {}
		return {
			uuid: user.uuid,
			name: user.name || contact?.name,
			image: user.image,
			username: user.username,
			kyc: !!user.kyc,
			vip: !!user.vip,
			golden_check: !!user.golden_check,
			phone_verified: !!user.phone_verified,
			telegram_verified: !!user.telegram_verified,
		}
	}, [])

	// Check if a matched contact is already saved
	const isAlreadySaved = useCallback((matchedUser) => {
		return contacts.some((c) => {
			const saved = c?.Contact || {}
			return saved.uuid === matchedUser.uuid
		})
	}, [contacts])

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
			} else { Toast.show({ type: 'error', text1: res.error || 'No se pudieron cargar los contactos' }) }
		} catch (e) { Toast.show({ type: 'error', text1: e.message || 'Error de red' }) }
		finally { setRefreshing(false) }
	}, [])

	// Handle toggle favorite
	const handleToggleFavorite = useCallback(async (contact) => {
		const id = contact?.id
		if (!id) return
		try {
			const res = await userApi.toggleFavoriteContact(id)
			if (res.success) {
				setContacts((prev) => prev.map((c) =>
					c.id === id ? { ...c, favorite: res.data.favorite } : c
				))
			} else {
				Toast.show({ type: 'error', text1: res.error || 'No se pudo actualizar' })
			}
		} catch (e) {
			Toast.show({ type: 'error', text1: e.message || 'Error de red' })
		}
	}, [])

	// Handle delete contact
	const handleDelete = useCallback((contact) => {
		const id = contact?.id || contact?.uuid || contact?.Contact?.uuid
		if (!id) { Toast.show({ type: 'error', text1: 'ID de contacto inválido' }); return }
		Alert.alert(
			'Eliminar contacto',
			'¿Seguro que deseas eliminar este contacto?',
			[
				{ text: 'Cancelar', style: 'cancel' },
				{
					text: 'Eliminar', style: 'destructive', onPress: async () => {
						try {
							const res = await userApi.deleteContact(id)
							if (res.success) { Toast.show({ type: 'success', text1: 'Contacto eliminado' }); refresh() }
							else { Toast.show({ type: 'error', text1: res.error || 'No se pudo eliminar' }) }
						} catch (e) { Toast.show({ type: 'error', text1: e.message || 'Error de red' }) }
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
				Toast.show({ type: 'error', text1: result.error || 'Error en la busqueda' })
			}
		} catch (e) {
			setSearchResults([])
			Toast.show({ type: 'error', text1: e.message || 'Error de red' })
		} finally { setIsSearching(false) }
	}

	// Add contact handler
	const handleAddContact = async (selectedUser) => {
		try {
			const res = await userApi.addContact(selectedUser.uuid, selectedUser.name)
			if (res.success) {
				Toast.show({ type: 'success', text1: 'Contacto agregado' })
				setShowAddModal(false)
				setUserSearch('')
				setSearchResults([])
				refresh()
			} else {
				Toast.show({ type: 'error', text1: res.error || 'No se pudo agregar el contacto' })
			}
		} catch (e) {
			Toast.show({ type: 'error', text1: e.message || 'Error de red' })
		}
	}

	// Add all matched contacts at once
	const [isAddingAll, setIsAddingAll] = useState(false)
	const handleAddAll = useCallback(async () => {
		const pending = matchedContacts.filter((m) => !isAlreadySaved(m))
		if (pending.length === 0) return
		setIsAddingAll(true)
		let added = 0
		for (const user of pending) {
			try {
				const res = await userApi.addContact(user.uuid, user.name)
				if (res.success) {
					added++
					setContacts((prev) => [...prev, res.data])
				}
			} catch { /* skip */ }
		}
		if (added > 0) {
			Toast.show({ type: 'success', text1: `${added} contacto${added > 1 ? 's' : ''} agregado${added > 1 ? 's' : ''}` })
		}
		setIsAddingAll(false)
	}, [matchedContacts, isAlreadySaved])

	// Filter contacts locally
	const query = filterQuery.trim().toLowerCase()
	const filteredMatched = matchedContacts
		.filter((m) => !isAlreadySaved(m))
		.filter((m) => {
			if (!query) return true
			const name = (m.name || '').toLowerCase()
			const username = (m.username || '').toLowerCase()
			const deviceName = (m.deviceContactName || '').toLowerCase()
			return name.includes(query) || username.includes(query) || deviceName.includes(query)
		})
	const filteredContacts = query
		? contacts.filter((c) => {
			const u = c?.Contact || {}
			const name = (u.name || c?.name || '').toLowerCase()
			const username = (u.username || '').toLowerCase()
			return name.includes(query) || username.includes(query)
		})
		: contacts

	// Render
	if (loading) { return (<QPLoader />) }

	return (
		<>
			<View style={containerStyles.subContainer}>
				<ScrollView contentContainerStyle={containerStyles.scrollContainer} showsVerticalScrollIndicator={false} refreshControl={createHiddenRefreshControl(refreshing, refresh)}>

					<Text style={textStyles.h1}>Contactos</Text>
					<Text style={[textStyles.h3, { color: theme.colors.secondaryText }]}>Personas a las que envias con frecuencia</Text>

					{/* Local search filter */}
					{(contacts.length > 0 || matchedContacts.length > 0) && (
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

					{/* Syncing indicator */}
					{isSyncing && (
						<View style={[containerStyles.card, { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 10 }]}>
							<ActivityIndicator size="small" color={theme.colors.primary} />
							<Text style={[textStyles.h6, { color: theme.colors.secondaryText }]}>Sincronizando contactos...</Text>
						</View>
					)}

					{/* Sync CTA (when permission not granted) or matched contacts section */}
					{permissionStatus !== 'authorized' && permissionStatus !== 'limited' ? (
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
					) : filteredMatched.length > 0 ? (
						<View style={{ marginTop: 10 }}>
							<View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
								<View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
									<Text style={[textStyles.h5, { color: theme.colors.primaryText, fontWeight: '600' }]}>
										En tu agenda ({filteredMatched.length})
									</Text>
									{isSyncing && <ActivityIndicator size="small" color={theme.colors.primary} />}
								</View>
								<TouchableOpacity
									onPress={handleAddAll}
									disabled={isAddingAll}
									style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}
								>
									{isAddingAll
										? <ActivityIndicator size="small" color={theme.colors.primary} />
										: <FontAwesome6 name="user-plus" size={13} color={theme.colors.primary} iconStyle="solid" />
									}
									<Text style={[textStyles.h6, { color: theme.colors.primary, fontWeight: '600' }]}>
										{isAddingAll ? 'Agregando...' : 'Agregar todos'}
									</Text>
								</TouchableOpacity>
							</View>
							{filteredMatched.map((matched) => (
								<View key={matched.uuid} style={[containerStyles.card, { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }]}>
									<View style={{ flex: 1 }}>
										<ProfileContainerHorizontal user={matched} size={52} />
										{matched.deviceContactName ? (
											<Text style={[textStyles.h6, { color: theme.colors.tertiaryText, marginLeft: 64, marginTop: -4 }]}>
												{matched.deviceContactName}
											</Text>
										) : null}
									</View>
									{!isAlreadySaved(matched) && (
										<TouchableOpacity
											onPress={() => handleAddContact(matched)}
											style={{
												backgroundColor: theme.colors.primary,
												borderRadius: 8,
												paddingHorizontal: 12,
												paddingVertical: 6,
											}}
										>
											<Text style={[textStyles.h6, { color: theme.colors.almostWhite, fontWeight: '600' }]}>Agregar</Text>
										</TouchableOpacity>
									)}
								</View>
							))}
						</View>
					) : null}

					{/* Saved contacts */}
					<View style={{ marginTop: 10 }}>
						{filteredContacts.length > 0 && (
							<Text style={[textStyles.h5, { color: theme.colors.primaryText, fontWeight: '600', marginBottom: 8 }]}>
								Contactos guardados ({filteredContacts.length})
							</Text>
						)}
						{contacts.length === 0 ? (
							<View style={[containerStyles.card, { alignItems: 'center' }]}>
								<Text style={[textStyles.h6, { color: theme.colors.secondaryText }]}>No tienes contactos guardados</Text>
							</View>
						) : filteredContacts.length === 0 ? (
							<View style={[containerStyles.card, { alignItems: 'center' }]}>
								<Text style={[textStyles.h6, { color: theme.colors.secondaryText }]}>Sin resultados para "{filterQuery}"</Text>
							</View>
						) : (
							filteredContacts.map((contact) => (
								<View key={contact.id || contact.uuid || JSON.stringify(contact)} style={[containerStyles.card, { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }]}>
									<View style={{ flex: 1 }}>
										<ProfileContainerHorizontal user={mapApiContactToUser(contact)} size={52} />
									</View>
									<View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
										<Pressable onPress={() => handleToggleFavorite(contact)} hitSlop={8}>
											<FontAwesome6 name="star" size={18} color={contact.favorite ? theme.colors.warning : theme.colors.tertiaryText} iconStyle={contact.favorite ? 'solid' : 'regular'} />
										</Pressable>
										<Pressable onPress={() => handleDelete(contact)} hitSlop={8}>
											<FontAwesome6 name="trash" size={16} color={theme.colors.danger} iconStyle="solid" />
										</Pressable>
									</View>
								</View>
							))
						)}
					</View>
				</ScrollView>
			</View>

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
							<FlatList
								data={searchResults}
								keyExtractor={(item) => item.uuid}
								showsVerticalScrollIndicator={false}
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

const styles = StyleSheet.create({})

export default Contacts
