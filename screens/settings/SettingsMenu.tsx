import { useEffect, useRef, useState } from 'react'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { View, Text, TextInput, Alert, ScrollView, Pressable, Linking, Platform, ActionSheetIOS } from 'react-native'
import { useTranslation } from 'react-i18next'

// Auth Context
import { useAuth } from '../../auth/AuthContext'

// Settings Context
import { useSettings } from '../../settings/SettingsContext'

// Theme
import { useTheme } from '../../theme/ThemeContext'
import { createTextStyles, createContainerStyles } from '../../theme/themeUtils'

// UI Components
import AlertDrawer from '../../ui/AlertDrawer'
import SettingsSection from '../../ui/SettingsSection'
import ProfileContainer from '../../ui/ProfileContainer'

// Biometric utilities
import { hasBiometricCredentials, removeBiometricCredentials } from '../../api/client'

// API
import { userApi } from '../../api/userApi'

// Image Picker
import { launchCamera, launchImageLibrary } from 'react-native-image-picker'
import type { CameraOptions, ImageLibraryOptions, ImagePickerResponse } from 'react-native-image-picker'

// Import settings
import settings from './settings'
import { filterSettings } from './settingsSearch'

// Push prompt
import usePushPrompt from '../../hooks/usePushPrompt'

// In-app review
import { requestReview } from '../../helpers/inAppReview'

// Routes
import { ROUTES } from '../../routes'

// Icons
import FontAwesome6 from '@react-native-vector-icons/fontawesome6'

// Toast
import { toast } from 'sonner-native'

// Constants
import DeviceInfo from 'react-native-device-info'
const version = DeviceInfo.getVersion()
const buildNumber = DeviceInfo.getBuildNumber()

// Tipos
import type { ComponentProps } from 'react'
import type { CompositeScreenProps } from '@react-navigation/native'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import type { RootStackParamList, SettingsStackParamList } from '../../types/navigation'
import type { SettingsMenuOption } from './settings'

/** Composite: el menú navega dentro de Ajustes Y al root (Scan, Welcome tras logout). */
type SettingsMenuProps = CompositeScreenProps<
	NativeStackScreenProps<SettingsStackParamList, 'SettingsMenu'>,
	NativeStackScreenProps<RootStackParamList>
>

/** Opciones del picker compartidas por cámara y galería. */
type PickerOptions = CameraOptions & ImageLibraryOptions

/** Slot de imagen que se sustituye (`type` del multipart). */
type UploadType = 'avatar' | 'cover'

/** Accesorios de la fila resueltos contra el user (check verde / pill GOLD). */
type ItemStatus = { verified?: boolean, pill?: string }

// Settings Menu
const SettingsMenu = ({ navigation }: SettingsMenuProps) => {

	// Contexts
	const { user, logout, updateUser } = useAuth()
	const { updateSettings } = useSettings()
	const { t } = useTranslation()
	const { theme } = useTheme()
	const textStyles = createTextStyles(theme)
	const containerStyles = createContainerStyles(theme)
	const insets = useSafeAreaInsets()

	// Push prompt
	const { shouldShowRedDot } = usePushPrompt()

	// Buscador del menú: filtra título RESUELTO (los title del catálogo son
	// claves de i18n) + keywords bilingües sin acentos (settingsSearch.js).
	// Mientras hay búsqueda activa solo se muestran los resultados — el perfil,
	// el logout y el pie quedan fuera para no ensuciar la lista.
	const [query, setQuery] = useState('')
	const visibleSettings = filterSettings(settings, query, t)
	const searching = query.trim().length > 0
	const noResults = searching && Object.keys(visibleSettings).length === 0

	// Biometric availability for the logout flow — read only when the logout
	// drawer expands, so a ref avoids re-rendering the whole menu when it resolves.
	const biometricsActiveRef = useRef(false)

	// Snapshot of the ref taken as the drawer expands; picks the drawer copy/actions.
	const [logoutKeepsBiometrics, setLogoutKeepsBiometrics] = useState(false)

	useEffect(() => {
		const checkBiometrics = async () => { biometricsActiveRef.current = await hasBiometricCredentials() }
		checkBiometrics()
	}, [])

	// Image picker options
	const avatarPickerOptions: PickerOptions = { mediaType: 'photo', maxWidth: 512, maxHeight: 512, quality: 0.8, includeBase64: false }
	const coverPickerOptions: PickerOptions = { mediaType: 'photo', maxWidth: 1088, maxHeight: 256, quality: 0.9, includeBase64: false }

	// Generic image upload handler
	const processImageUpload = async (response: ImagePickerResponse, uploadType: UploadType) => {

		if (response.didCancel || response.errorCode) return
		const asset = response.assets?.[0]
		if (!asset) return

		const isCover = uploadType === 'cover'
		const toastId = toast.info(t(isCover ? 'settings.menu.avatar.uploadingCover' : 'settings.menu.avatar.uploadingPhoto'), { duration: Infinity })
		const result = await userApi.uploadAvatar({
			// `asset.uri` es opcional en el tipo del picker pero siempre viene en un
			// asset seleccionado; el cast evita ensuciar el guard de arriba.
			file: { uri: asset.uri as string, type: asset.type || 'image/jpeg', name: asset.fileName || `${uploadType}.jpg` },
			uploadType
		})
		toast.dismiss(toastId)

		if (result.success) {
			// userApi.uploadAvatar declara `ApiResult<unknown>`: forma local del envelope.
			const uploaded = result.data as { data?: { url?: string, path?: string } } | undefined
			const updateField = isCover
				? { cover_photo_url: uploaded?.data?.url }
				: { image: uploaded?.data?.path }
			updateUser(updateField)
			toast.success(t(isCover ? 'settings.menu.avatar.coverUpdated' : 'settings.menu.avatar.photoUpdated'))
		} else { toast.error(t('settings.menu.avatar.errorTitle'), { description: result.error || t(isCover ? 'settings.menu.avatar.uploadFailedCover' : 'settings.menu.avatar.uploadFailedPhoto') }) }
	}

	// Show action sheet for image selection
	const showImagePicker = (pickerOptions: PickerOptions, uploadType: UploadType, title: string) => {

		const options = [t('settings.menu.avatar.takePhoto'), t('settings.menu.avatar.chooseFromGallery'), t('common.actions.cancel')]
		const cancelButtonIndex = 2
		const handler = (response: ImagePickerResponse) => processImageUpload(response, uploadType)

		if (Platform.OS === 'ios') {
			ActionSheetIOS.showActionSheetWithOptions(
				{ options, cancelButtonIndex },
				(buttonIndex) => {
					if (buttonIndex === 0) launchCamera(pickerOptions, handler)
					else if (buttonIndex === 1) launchImageLibrary(pickerOptions, handler)
				}
			)
		} else {
			// Alert.alert declara `message?: string`; el runtime acepta null (mensaje vacío).
			Alert.alert(title, null as unknown as undefined, [
				{ text: t('settings.menu.avatar.takePhoto'), onPress: () => launchCamera(pickerOptions, handler) },
				{ text: t('settings.menu.avatar.chooseFromGallery'), onPress: () => launchImageLibrary(pickerOptions, handler) },
				{ text: t('common.actions.cancel'), style: 'cancel' },
			])
		}
	}

	// Estado por item del catálogo: check verde en verificaciones completadas
	// (celular, Telegram, KYC) y pill "Activo" en la suscripción GOLD vigente
	const itemStatus = (option: SettingsMenuOption): ItemStatus => {
		switch (option.verifiedKey) {
			case 'phone': return { verified: !!user?.phone_verified }
			case 'telegram': return { verified: !!user?.telegram_id }
			case 'kyc': return { verified: !!user?.kyc }
			case 'gold': return user?.golden_check ? { pill: t('settings.menu.status.active') } : {}
			default: return {}
		}
	}

	// Edit avatar handler
	const handleEditAvatar = () => showImagePicker(avatarPickerOptions, 'avatar', t('settings.menu.avatar.changeProfilePhoto'))

	// Edit cover handler
	const handleEditCover = () => showImagePicker(coverPickerOptions, 'cover', t('settings.menu.avatar.changeCoverPhoto'))

	// Logout function — optionally wipes the biometric credentials first
	const performLogout = async ({ removeBiometrics = false } = {}) => {
		if (removeBiometrics) {
			await removeBiometricCredentials()
			await updateSettings('security', { biometricsEnabled: false })
		}
		const result = await logout()
		// OJO (pre-existente): `reset` actúa sobre el navegador PROPIETARIO — aquí
		// SettingsStack, que no registra 'Welcome'. Se mantiene tal cual (el cambio
		// de árbol lo hace de todos modos AppNavigator al caer isAuthenticated).
		navigation.reset({ index: 0, routes: [{ name: ROUTES.WELCOME_SCREEN }] } as unknown as Parameters<typeof navigation.reset>[0])
		if (!result.success) { Alert.alert(t('settings.menu.avatar.errorTitle'), t('settings.menu.logout.failed')) }
	}

	return (
		<View style={containerStyles.container}>
			<ScrollView style={{ paddingHorizontal: theme.spacing.md }} contentInsetAdjustmentBehavior="never" keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">

				{/* `useAuth().user` es `User | null` y ProfileContainer declara `user?: ProfileUser`
				    (null se comporta igual dentro, pero no es asignable a undefined). */}
				{!searching && <ProfileContainer user={user as ComponentProps<typeof ProfileContainer>['user']} onEditAvatar={handleEditAvatar} onEditCover={handleEditCover} />}

				{/* Buscador */}
				<View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: theme.colors.elevation, borderRadius: 12, borderCurve: 'continuous', paddingHorizontal: 14, height: 42, marginTop: searching ? insets.top + 56 : 6 }}>
					<FontAwesome6 name="magnifying-glass" size={14} color={theme.colors.secondaryText} iconStyle="solid" />
					<TextInput
						value={query}
						onChangeText={setQuery}
						placeholder={t('settings.menu.searchPlaceholder')}
						placeholderTextColor={theme.colors.secondaryText}
						style={{ flex: 1, paddingVertical: 0, color: theme.colors.primaryText, fontFamily: theme.typography.fontFamily.regular, fontSize: theme.typography.fontSize.md }}
						autoCorrect={false}
						autoCapitalize="none"
						returnKeyType="search"
						clearButtonMode="while-editing"
					/>
					{searching && Platform.OS !== 'ios' && (
						<Pressable onPress={() => setQuery('')} hitSlop={8}>
							<FontAwesome6 name="circle-xmark" size={15} color={theme.colors.secondaryText} iconStyle="solid" />
						</Pressable>
					)}
				</View>

				{noResults && (
					<View style={{ alignItems: 'center', paddingVertical: 40, gap: 10 }}>
						<FontAwesome6 name="magnifying-glass" size={28} color={theme.colors.secondaryText} iconStyle="solid" />
						<Text style={[textStyles.h5, { color: theme.colors.secondaryText, textAlign: 'center' }]}>
							{t('settings.menu.noResults', { query: query.trim() })}
						</Text>
					</View>
				)}

				{Object.entries(visibleSettings).map(([categoryKey, category]) => {
					// Los title del catálogo son claves de i18n: se resuelven AQUÍ para
					// que SettingsSection/SettingsItem (ui/) sigan recibiendo strings
					const items = category.options.map(option => ({
						...option,
						title: t(option.title),
						...itemStatus(option),
						...(categoryKey === 'notifications' && shouldShowRedDot ? { showBadge: true } : {}),
					}))
					return <SettingsSection key={categoryKey} title={t(category.title)} items={items} navigation={navigation} />
				})}

				{!searching && <AlertDrawer
					buttonLabel={t('settings.menu.logout.button')}
					title={t('settings.menu.logout.button')}
					icon="right-from-bracket"
					description={logoutKeepsBiometrics
						? t('settings.menu.logout.keepBiometricsQuestion')
						: t('settings.menu.logout.confirmQuestion')}
					confirmLabel={logoutKeepsBiometrics ? t('settings.menu.logout.deleteAll') : undefined}
					onConfirm={() => performLogout({ removeBiometrics: logoutKeepsBiometrics })}
					cancelLabel={logoutKeepsBiometrics ? t('settings.menu.logout.keepBiometrics') : t('common.actions.cancel')}
					onCancel={logoutKeepsBiometrics ? () => performLogout() : undefined}
					onBeforeExpand={() => setLogoutKeepsBiometrics(biometricsActiveRef.current)}
					style={{ marginTop: 20 }}
				/>}

				{/* Github, Twitter and Instagram accounts */}
				{!searching && <View style={{ flexDirection: 'row', justifyContent: 'space-evenly', marginVertical: 20 }}>
					<Pressable onPress={() => Linking.openURL('https://support.qvapay.com')}>
						<FontAwesome6 name="headset" size={24} style={{ color: theme.colors.contrast }} iconStyle="solid" />
					</Pressable>
					<Pressable onPress={async () => {
						const result = await requestReview()
						if (!result.shown) toast.info(t('settings.menu.reviewUnavailable'))
					}}>
						<FontAwesome6 name="star" size={24} style={{ color: theme.colors.contrast }} iconStyle="solid" />
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
				</View>}

				{!searching && <Text style={[textStyles.h6, { color: theme.colors.secondaryText, textAlign: 'center', marginTop: 20, marginBottom: insets.bottom }]}>
					{`QvaPay © ${new Date().getFullYear()} \n`}
					{`v ${version} build ${buildNumber}\n`}
					{t('settings.menu.allRightsReserved')}
				</Text>}

			</ScrollView>

			{/* Floating header buttons */}
			<Pressable onPress={() => navigation.goBack()} hitSlop={10} style={{ position: 'absolute', top: insets.top + 8, left: 16, width: 40, height: 40, borderRadius: 12, borderCurve: 'continuous', backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border, justifyContent: 'center', alignItems: 'center' }}>
				<FontAwesome6 name="xmark" size={18} color={theme.colors.primaryText} iconStyle="solid" />
			</Pressable>
			<Pressable onPress={() => navigation.navigate(ROUTES.SCAN_SCREEN, { view: 'show' })} hitSlop={10} style={{ position: 'absolute', top: insets.top + 8, right: 16, width: 40, height: 40, borderRadius: 12, borderCurve: 'continuous', backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border, justifyContent: 'center', alignItems: 'center' }}>
				<FontAwesome6 name="qrcode" size={18} color={theme.colors.primaryText} iconStyle="solid" />
			</Pressable>

		</View>
	)
}

export default SettingsMenu