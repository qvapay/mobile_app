import { useState, useEffect } from 'react'
import { Text, View } from 'react-native'

// Theme
import { useTheme } from '../../../theme/ThemeContext'
import { createTextStyles, createContainerStyles } from '../../../theme/themeUtils'

// UI
import QPKeyboardView from '../../../ui/QPKeyboardView'

// UI Particles
import QPInput from '../../../ui/particles/QPInput'
import QPButton from '../../../ui/particles/QPButton'
import QPLoader from '../../../ui/particles/QPLoader'

// API
import { userApi } from '../../../api/userApi'

// Notifications
import Toast from 'react-native-toast-message'

// User AuthContext
import { useAuth } from '../../../auth/AuthContext'

// Icons
import FontAwesome6 from '@react-native-vector-icons/fontawesome6'

// User Data Settings Component
const Userdata = () => {

	// Contexts
	const { updateUser } = useAuth()
	const { theme } = useTheme()
	const textStyles = createTextStyles(theme)
	const containerStyles = createContainerStyles(theme)

	// States
	const [isLoading, setIsLoading] = useState(false)
	const [isLoadingData, setIsLoadingData] = useState(true)

	// Form fields
	const [username, setUsername] = useState('')
	const [name, setName] = useState('')
	const [lastname, setLastname] = useState('')
	const [email, setEmail] = useState('')
	const [phone, setPhone] = useState('')
	const [telegram, setTelegram] = useState('')
	const [twitter, setTwitter] = useState('')
	const [address, setAddress] = useState('')
	const [country, setCountry] = useState('')
	const [bio, setBio] = useState('')

	// User status fields
	const [userStatus, setUserStatus] = useState({
		kyc: false,
		phone_verified: false,
		telegram_id: '',
		createdAt: ''
	})

	// Load user data on component mount
	useEffect(() => {
		loadUserData()
	}, [])

	// Load user data from API
	const loadUserData = async () => {
		try {
			setIsLoadingData(true)
			const result = await userApi.getUserProfile()
			if (result.success && result.data) {
				const userData = result.data
				setUsername(userData.username || '')
				setName(userData.name || '')
				setLastname(userData.lastname || '')
				setEmail(userData.email || '')
				setPhone(userData.phone || '')
				setTelegram(userData.telegram || '')
				setTwitter(userData.twitter || '')
				setAddress(userData.address || '')
				setBio(userData.bio || '')
				setCountry(userData.KYC?.country || '')
				setUserStatus({
					kyc: userData.kyc || false,
					phone_verified: userData.phone_verified || false,
					telegram_id: userData.telegram_id || '',
					createdAt: userData.createdAt || ''
				})
			} else { Toast.show({ type: 'error', text1: 'Error al cargar datos del usuario' }) }
		} catch (error) {
			Toast.show({ type: 'error', text1: 'Error al cargar datos del usuario' })
		} finally { setIsLoadingData(false) }
	}

	// Handle form submission
	const handleSubmit = async () => {
		if (!name || !lastname) {
			Toast.show({ type: 'error', text1: 'Completa al menos el nombre y apellido' })
			return
		}
		if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
			Toast.show({ type: 'error', text1: 'Formato de correo electrónico inválido' })
			return
		}
		if (country && country.length !== 2) {
			Toast.show({ type: 'error', text1: 'El código de país debe tener 2 caracteres (ej: US, ES)' })
			return
		}

		try {
			setIsLoading(true)
			const updateData = {
				name: name.trim(),
				lastname: lastname.trim(),
				bio: bio.trim(),
				address: address.trim(),
				country: country.trim().toUpperCase(),
				telegram: telegram.trim(),
				twitter: twitter.trim()
			}
			const result = await userApi.updateUser(updateData)
			if (result.success && result.data) {
				Toast.show({ type: 'success', text1: 'Datos actualizados correctamente' })
				const userData = result.data
				setUsername(userData.username || username)
				setName(userData.name || name)
				setLastname(userData.lastname || lastname)
				setBio(userData.bio || bio)
				updateUser({ name: userData.name || name, lastname: userData.lastname || lastname })
			} else { Toast.show({ type: 'error', text1: result.error || 'Error al actualizar' }) }
		} catch (error) {
			Toast.show({ type: 'error', text1: 'Error al actualizar' })
		} finally { setIsLoading(false) }
	}

	// Format date for display
	const formatDate = (dateString) => {
		if (!dateString) return 'N/A'
		try {
			return new Date(dateString).toLocaleDateString('es-ES', { year: 'numeric', month: 'long', day: 'numeric' })
		} catch (error) { return 'N/A' }
	}

	// Loading state
	if (isLoadingData) { return (<QPLoader />) }

	return (
		<QPKeyboardView
			actions={
				<QPButton
					title="Actualizar datos"
					onPress={handleSubmit}
					disabled={!name || !lastname || isLoading}
					textStyle={{ color: theme.colors.almostWhite }}
					loading={isLoading}
				/>
			}
		>

			<Text style={textStyles.h1}>Datos personales</Text>
			<Text style={[textStyles.h3, { color: theme.colors.secondaryText }]}>Edita tu información de perfil</Text>

			{/* Account section */}
			<View style={{ marginTop: 20 }}>
				<SectionHeader icon="user-tag" title="Cuenta" theme={theme} textStyles={textStyles} />
				<QPInput
					placeholder="Nombre de usuario"
					value={username}
					onChangeText={setUsername}
					editable={false}
					prefixIconName="user"
					style={{ opacity: 0.6 }}
					suffixIconName={userStatus.kyc ? 'circle-check' : ''}
				/>
				<QPInput
					placeholder="Correo electrónico"
					value={email}
					onChangeText={setEmail}
					keyboardType="email-address"
					autoCapitalize="none"
					editable={false}
					style={{ opacity: 0.6 }}
					prefixIconName="envelope"
				/>
			</View>

			{/* Personal info section */}
			<View style={{ marginTop: 10 }}>
				<SectionHeader icon="id-card" title="Información personal" theme={theme} textStyles={textStyles} />
				<QPInput
					placeholder="Nombre"
					value={name}
					onChangeText={setName}
					prefixIconName="user"
					autoCapitalize="words"
				/>
				<QPInput
					placeholder="Apellido"
					value={lastname}
					onChangeText={setLastname}
					prefixIconName="user"
					autoCapitalize="words"
				/>
				<QPInput
					placeholder="Biografía o descripción"
					value={bio}
					onChangeText={setBio}
					multiline
					numberOfLines={4}
					prefixIconName="user-pen"
					style={{ textAlignVertical: 'top', paddingTop: 15 }}
				/>
			</View>

			{/* Contact section */}
			<View style={{ marginTop: 10 }}>
				<SectionHeader icon="address-book" title="Contacto y redes" theme={theme} textStyles={textStyles} />
				<QPInput
					placeholder="Teléfono"
					value={phone}
					onChangeText={setPhone}
					keyboardType="phone-pad"
					prefixIconName="phone-volume"
					suffixIconName={userStatus.phone_verified ? 'circle-check' : ''}
					editable={false}
					style={{ opacity: 0.6 }}
				/>
				<QPInput
					placeholder="@usuario_telegram"
					value={telegram}
					onChangeText={setTelegram}
					autoCapitalize="none"
					prefixIconName="telegram"
					iconStyle="brand"
					suffixIconName={userStatus.telegram_id ? 'circle-check' : ''}
				/>
				<QPInput
					placeholder="@usuario_twitter"
					value={twitter}
					onChangeText={setTwitter}
					autoCapitalize="none"
					prefixIconName="x-twitter"
					iconStyle="brand"
				/>
			</View>

			{/* Location section */}
			<View style={{ marginTop: 10 }}>
				<SectionHeader icon="location-dot" title="Ubicación" theme={theme} textStyles={textStyles} />
				<QPInput
					placeholder="Dirección"
					value={address}
					onChangeText={setAddress}
					autoCapitalize="words"
					prefixIconName="location-dot"
				/>
				<QPInput
					placeholder="País (ej: US, ES, MX)"
					value={country}
					onChangeText={setCountry}
					autoCapitalize="characters"
					maxLength={2}
					prefixIconName="globe"
				/>
			</View>

			{/* Info card */}
			<View style={[containerStyles.card, { marginTop: 10 }]}>
				<View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
					<FontAwesome6 name="circle-info" size={16} color={theme.colors.primary} iconStyle="solid" />
					<Text style={[textStyles.body, { color: theme.colors.secondaryText, marginLeft: 12, flex: 1 }]}>
						El nombre de usuario, email y teléfono se gestionan desde sus respectivas secciones de ajustes.
					</Text>
				</View>
			</View>

			<Text style={[textStyles.caption, { color: theme.colors.secondaryText, textAlign: 'center', marginBottom: 40 }]}>
				Miembro desde: <Text style={{ color: theme.colors.primary, fontWeight: 'bold' }}>{formatDate(userStatus.createdAt)}</Text>
			</Text>

		</QPKeyboardView>
	)
}

// Section header component
const SectionHeader = ({ icon, title, theme, textStyles }) => (
	<View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
		<FontAwesome6 name={icon} size={14} color={theme.colors.primary} iconStyle="solid" />
		<Text style={[textStyles.h5, { color: theme.colors.secondaryText, marginLeft: 8, marginBottom: 0 }]}>{title}</Text>
	</View>
)

export default Userdata
