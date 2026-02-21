import { useEffect, useState, useCallback } from 'react'
import { Alert, ScrollView, StyleSheet, Text, View, Pressable, Modal, FlatList, TouchableOpacity } from 'react-native'

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

	// Add modal states
	const [showAddModal, setShowAddModal] = useState(false)
	const [userSearch, setUserSearch] = useState('')
	const [searchResults, setSearchResults] = useState([])
	const [isSearching, setIsSearching] = useState(false)

	// Header button "+"
	useEffect(() => {
		navigation.setOptions({
			headerRight: () => (
				<Pressable style={containerStyles.headerRight} onPress={() => setShowAddModal(true)}>
					<FontAwesome6 name="plus" size={24} color={theme.colors.primaryText} iconStyle="solid" />
				</Pressable>
			)
		})
	}, [navigation, containerStyles.headerRight, theme.colors.primaryText])

	// Map API contact to user
	const mapApiContactToUser = useCallback((contact) => {
		// API returns shape:
		// { id, name, Contact: { uuid, name, image, username, kyc, vip, golden_check, phone_verified, telegram_verified }, created_at }
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

	// Render
	if (loading) { return (<QPLoader />) }

	return (
		<>
			<View style={containerStyles.subContainer}>
				<ScrollView contentContainerStyle={containerStyles.scrollContainer} showsVerticalScrollIndicator={false} refreshControl={createHiddenRefreshControl(refreshing, refresh)}>

					<Text style={textStyles.h1}>Contactos</Text>
					<Text style={[textStyles.h3, { color: theme.colors.secondaryText }]}>Personas a las que envias con frecuencia</Text>

					{error && (
						<View style={[containerStyles.card, { borderColor: theme.colors.danger, borderWidth: 1 }]}>
							<Text style={[textStyles.h6, { color: theme.colors.danger }]}>{String(error)}</Text>
						</View>
					)}

					<View style={{ marginTop: 10 }}>
						{(contacts || []).length === 0 ? (
							<View style={[containerStyles.card, { alignItems: 'center' }]}>
								<Text style={[textStyles.h6, { color: theme.colors.secondaryText }]}>No tienes contactos guardados</Text>
							</View>
						) : (
							contacts.map((contact) => (
								<View key={contact.id || contact.uuid || JSON.stringify(contact)} style={[containerStyles.card, { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }]}>
									<ProfileContainerHorizontal user={mapApiContactToUser(contact)} size={52} />
									<Pressable onPress={() => handleDelete(contact)} style={{ padding: 6 }}>
										<FontAwesome6 name="trash" size={16} color={theme.colors.danger} iconStyle="solid" />
									</Pressable>
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
