import { useState, useEffect } from 'react'
import { View, Text, Alert, ScrollView, Pressable, Linking, Platform, ActionSheetIOS } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

// Auth Context
import { useAuth } from '../../auth/AuthContext'

// Settings Context
import { useSettings } from '../../settings/SettingsContext'

// Theme
import { useTheme } from '../../theme/ThemeContext'
import { createTextStyles, createContainerStyles } from '../../theme/themeUtils'

// UI Components
import QPButton from '../../ui/particles/QPButton'
import SettingsSection from '../../ui/SettingsSection'
import ProfileContainer from '../../ui/ProfileContainer'

// Biometric utilities
import { hasBiometricCredentials, removeBiometricCredentials } from '../../api/client'

// API
import { userApi } from '../../api/userApi'

// Image Picker
import { launchCamera, launchImageLibrary } from 'react-native-image-picker'

// Import settings
import settings from './settings'

// Push prompt
import usePushPrompt from '../../hooks/usePushPrompt'

// Routes
import { ROUTES } from '../../routes'

// Icons
import FontAwesome6 from '@react-native-vector-icons/fontawesome6'

// Toast
import Toast from 'react-native-toast-message'

// Constants
import DeviceInfo from 'react-native-device-info'
const version = DeviceInfo.getVersion()
const buildNumber = DeviceInfo.getBuildNumber()

// Settings Menu
const SettingsMenu = ({ navigation }) => {

	// Contexts
	const { user, logout, updateUser } = useAuth()
	const { updateSettings } = useSettings()
	const { theme } = useTheme()
	const textStyles = createTextStyles(theme)
	const containerStyles = createContainerStyles(theme)
	const insets = useSafeAreaInsets()

	// Push prompt
	const { shouldShowRedDot } = usePushPrompt()

	// Biometric state for logout flow
	const [biometricsActive, setBiometricsActive] = useState(false)

	useEffect(() => {
		const checkBiometrics = async () => {
			const has = await hasBiometricCredentials()
			setBiometricsActive(has)
		}
		checkBiometrics()
	}, [])

	// Image picker options
	const avatarPickerOptions = { mediaType: 'photo', maxWidth: 512, maxHeight: 512, quality: 0.8, includeBase64: false }
	const coverPickerOptions = { mediaType: 'photo', maxWidth: 1088, maxHeight: 256, quality: 0.9, includeBase64: false }

	// Generic image upload handler
	const processImageUpload = async (response, uploadType) => {

		if (response.didCancel || response.errorCode) return
		const asset = response.assets?.[0]
		if (!asset) return

		const label = uploadType === 'cover' ? 'portada' : 'foto'
		Toast.show({ type: 'info', text1: `Subiendo ${label}...`, autoHide: false })
		const result = await userApi.uploadAvatar({
			file: { uri: asset.uri, type: asset.type || 'image/jpeg', name: asset.fileName || `${uploadType}.jpg` },
			uploadType
		})
		Toast.hide()

		if (result.success) {
			const updateField = uploadType === 'cover'
				? { cover_photo_url: result.data?.data?.url }
				: { image: result.data?.data?.path }
			updateUser(updateField)
			Toast.show({ type: 'success', text1: `${label.charAt(0).toUpperCase() + label.slice(1)} actualizada` })
		} else { Toast.show({ type: 'error', text1: 'Error', text2: result.error || `No se pudo subir la ${label}` }) }
	}

	// Show action sheet for image selection
	const showImagePicker = (pickerOptions, uploadType, title) => {
		const options = ['Tomar foto', 'Elegir de galería', 'Cancelar']
		const cancelButtonIndex = 2
		const handler = (response) => processImageUpload(response, uploadType)

		if (Platform.OS === 'ios') {
			ActionSheetIOS.showActionSheetWithOptions(
				{ options, cancelButtonIndex },
				(buttonIndex) => {
					if (buttonIndex === 0) launchCamera(pickerOptions, handler)
					else if (buttonIndex === 1) launchImageLibrary(pickerOptions, handler)
				}
			)
		} else {
			Alert.alert(title, null, [
				{ text: 'Tomar foto', onPress: () => launchCamera(pickerOptions, handler) },
				{ text: 'Elegir de galería', onPress: () => launchImageLibrary(pickerOptions, handler) },
				{ text: 'Cancelar', style: 'cancel' },
			])
		}
	}

	// Edit avatar handler
	const handleEditAvatar = () => showImagePicker(avatarPickerOptions, 'avatar', 'Cambiar foto de perfil')

	// Edit cover handler
	const handleEditCover = () => showImagePicker(coverPickerOptions, 'cover', 'Cambiar foto de portada')

	// Logout function
	const handleLogout = async () => {
		if (biometricsActive) {
			Alert.alert(
				'Cerrar sesión',
				'¿Deseas mantener el acceso biométrico para la próxima vez?',
				[
					{ text: 'Cancelar', style: 'cancel' },
					{
						text: 'Mantener biometría',
						onPress: async () => {
							const result = await logout()
							navigation.reset({ index: 0, routes: [{ name: ROUTES.WELCOME_SCREEN }] })
							if (!result.success) { Alert.alert('Error', 'No se pudo cerrar sesión.') }
						}
					},
					{
						text: 'Eliminar todo',
						style: 'destructive',
						onPress: async () => {
							await removeBiometricCredentials()
							await updateSettings('security', { biometricsEnabled: false })
							const result = await logout()
							navigation.reset({ index: 0, routes: [{ name: ROUTES.WELCOME_SCREEN }] })
							if (!result.success) { Alert.alert('Error', 'No se pudo cerrar sesión.') }
						}
					}
				]
			)
		} else {
			Alert.alert(
				'Cerrar sesión',
				'¿Estás seguro de querer cerrar sesión?',
				[
					{ text: 'Cancelar', style: 'cancel' },
					{
						text: 'Salir',
						style: 'destructive',
						onPress: async () => {
							const result = await logout()
							navigation.reset({ index: 0, routes: [{ name: ROUTES.WELCOME_SCREEN }] })
							if (!result.success) { Alert.alert('Error', 'No se pudo cerrar sesión. Por favor, inténtalo de nuevo.') }
						}
					}
				]
			)
		}
	}

	return (
		<View style={containerStyles.container}>
			<ScrollView style={{ paddingHorizontal: theme.spacing.md }} contentInsetAdjustmentBehavior="never">

				<ProfileContainer user={user} onEditAvatar={handleEditAvatar} onEditCover={handleEditCover} />

				{Object.entries(settings).map(([categoryKey, category]) => {
					const items = categoryKey === 'notifications' && shouldShowRedDot
						? category.options.map(opt => ({ ...opt, showBadge: true }))
						: category.options
					return <SettingsSection key={categoryKey} title={category.title} items={items} navigation={navigation} />
				})}

				<QPButton title="Cerrar sesión" onPress={handleLogout} style={{ backgroundColor: theme.colors.danger, marginTop: 20 }} textStyle={{ color: theme.colors.almostWhite }} />

				{/* Github, Twitter and Instagram accounts */}
				<View style={{ flexDirection: 'row', justifyContent: 'space-evenly', marginVertical: 20 }}>
					<Pressable onPress={() => Linking.openURL('https://support.qvapay.com')}>
						<FontAwesome6 name="headset" size={24} style={{ color: theme.colors.contrast }} iconStyle="solid" />
					</Pressable>
					<Pressable onPress={() => Linking.openURL('https://t.me/qvapay')}>
						<FontAwesome6 name="telegram" size={24} style={{ color: theme.colors.contrast }} iconStyle="brand" />
					</Pressable>
					<Pressable onPress={() => Linking.openURL('https://github.com/qvapay')}>
						<FontAwesome6 name="github" size={24} style={{ color: theme.colors.contrast }} iconStyle="brand" />
					</Pressable>
					<Pressable onPress={() => Linking.openURL('https://twitter.com/qvapay')}>
						<FontAwesome6 name="x-twitter" size={24} style={{ color: theme.colors.contrast }} iconStyle="brand" />
					</Pressable>
					<Pressable onPress={() => Linking.openURL('https://instagram.com/qvapay')}>
						<FontAwesome6 name="instagram" size={24} style={{ color: theme.colors.contrast }} iconStyle="brand" />
					</Pressable>
					<Pressable onPress={() => Linking.openURL('https://youtube.com/@qvapay')}>
						<FontAwesome6 name="youtube" size={24} style={{ color: theme.colors.contrast }} iconStyle="brand" />
					</Pressable>
				</View>

				<Text style={[textStyles.h6, { color: theme.colors.secondaryText, textAlign: 'center', marginTop: 20, marginBottom: insets.bottom }]}>
					{`QvaPay © ${new Date().getFullYear()} \n`}
					{`v ${version} build ${buildNumber}\n`}
					{`Todos los derechos reservados`}
				</Text>

			</ScrollView>

			{/* Floating header buttons */}
			<Pressable
				onPress={() => navigation.goBack()}
				hitSlop={10}
				style={{ position: 'absolute', top: insets.top + 8, left: 16, width: 40, height: 40, borderRadius: 20, backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border, justifyContent: 'center', alignItems: 'center' }}
			>
				<FontAwesome6 name="xmark" size={18} color={theme.colors.primaryText} iconStyle="solid" />
			</Pressable>
			<Pressable
				onPress={() => navigation.navigate(ROUTES.SCAN_SCREEN, { view: 'show' })}
				hitSlop={10}
				style={{ position: 'absolute', top: insets.top + 8, right: 16, width: 40, height: 40, borderRadius: 20, backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border, justifyContent: 'center', alignItems: 'center' }}
			>
				<FontAwesome6 name="qrcode" size={18} color={theme.colors.primaryText} iconStyle="solid" />
			</Pressable>
		</View>
	)
}

export default SettingsMenu