import { useEffect, useState, useCallback } from 'react'
import { Alert, ScrollView, StyleSheet, Text, View, Pressable } from 'react-native'

// Theme
import { useTheme } from '../../../theme/ThemeContext'
import { createTextStyles, createContainerStyles } from '../../../theme/themeUtils'

// UI
import QPLoader from '../../../ui/particles/QPLoader'
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
import QPRefreshIndicator, { createHiddenRefreshControl } from '../../../ui/QPRefreshIndicator'

// Contacts Component
const Contacts = () => {

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

	// Render
	if (loading) { return (<QPLoader />) }

	return (
		<View style={containerStyles.subContainer}>
			<QPRefreshIndicator refreshing={refreshing} />
			<ScrollView contentContainerStyle={containerStyles.scrollContainer} showsVerticalScrollIndicator={false} refreshControl={createHiddenRefreshControl(refreshing, refresh)}>

				<Text style={textStyles.h1}>Contactos</Text>
				<Text style={[textStyles.h3, { color: theme.colors.secondaryText }]}>Personas a las que envías con frecuencia</Text>

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
	)
}

const styles = StyleSheet.create({})

export default Contacts