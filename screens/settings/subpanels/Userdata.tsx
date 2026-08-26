import { useState, useEffect, useReducer } from 'react'
import { Text, View } from 'react-native'
import { Trans, useTranslation } from 'react-i18next'

// i18n (call-time para el helper de módulo + locale de fechas)
import i18n, { getDateLocale } from '../../../i18n'

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
import { toast } from 'sonner-native'

// User AuthContext
import { useAuth } from '../../../auth/AuthContext'

// Icons
import FontAwesome6 from '@react-native-vector-icons/fontawesome6'

// Tipos
import type { FontAwesome6SolidIconName } from '@react-native-vector-icons/fontawesome6'
import type { Theme } from '../../../theme/ThemeContext'
import type { TextStyles } from '../../../theme/themeUtils'
import type { User } from '../../../types/domain'

/** Campos editables del perfil, como una unidad. */
type ProfileForm = {
	username: string
	name: string
	lastname: string
	email: string
	phone: string
	telegram: string
	twitter: string
	address: string
	country: string
	bio: string
}

type ProfileFormAction =
	| { type: 'set', field: keyof ProfileForm, value: string }
	| { type: 'loaded', data: User & { KYC?: { country?: string } } }

/** Banderas del perfil que la pantalla pinta como estado (no editables). */
type UserStatus = {
	/** MySQL manda boolean O 0/1 (BoolInt): se guarda tal cual. */
	kyc: boolean | number
	phone_verified: boolean | number
	telegram_id: string | number
	createdAt: string
}

// The editable profile fields are one logical form
const initialForm: ProfileForm = { username: '', name: '', lastname: '', email: '', phone: '', telegram: '', twitter: '', address: '', country: '', bio: '' }

function formReducer(state: ProfileForm, action: ProfileFormAction): ProfileForm {
	switch (action.type) {
		case 'set':
			return { ...state, [action.field]: action.value }
		case 'loaded':
			return {
				username: action.data.username || '',
				name: action.data.name || '',
				lastname: action.data.lastname || '',
				email: action.data.email || '',
				phone: action.data.phone || '',
				telegram: (action.data.telegram as string) || '',
				twitter: (action.data.twitter as string) || '',
				address: (action.data.address as string) || '',
				bio: action.data.bio || '',
				country: action.data.KYC?.country || '',
			}
		default:
			return state
	}
}

// Format date for display (fuera de React: i18n.t en call-time)
const formatDate = (dateString?: string | null) => {
	if (!dateString) return i18n.t('settings.userdata.notAvailable')
	try {
		return new Date(dateString).toLocaleDateString(getDateLocale(), { year: 'numeric', month: 'long', day: 'numeric' })
	} catch (error) { return i18n.t('settings.userdata.notAvailable') }
}

// User Data Settings Component
const Userdata = () => {

	// Contexts
	const { t } = useTranslation()
	const { updateUser } = useAuth()
	const { theme } = useTheme()
	const textStyles = createTextStyles(theme)
	const containerStyles = createContainerStyles(theme)

	// States
	const [isLoading, setIsLoading] = useState(false)
	const [isLoadingData, setIsLoadingData] = useState(true)

	// Form fields
	const [form, dispatchForm] = useReducer(formReducer, initialForm)
	const { username, name, lastname, email, phone, telegram, twitter, address, country, bio } = form

	// User status fields
	const [userStatus, setUserStatus] = useState<UserStatus>({
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
				dispatchForm({ type: 'loaded', data: userData })
				setUserStatus({
					kyc: userData.kyc || false,
					phone_verified: userData.phone_verified || false,
					telegram_id: userData.telegram_id || '',
					// `createdAt` (camelCase) llega por el índice unknown de `User`.
					createdAt: (userData.createdAt as string) || ''
				})
			// i18n.t en call-time: mantiene loadUserData estable para exhaustive-deps
			} else { toast.error(i18n.t('settings.userdata.toasts.loadFailed')) }
		} catch (error) {
			toast.error(i18n.t('settings.userdata.toasts.loadFailed'))
		} finally { setIsLoadingData(false) }
	}

	// Handle form submission
	const handleSubmit = async () => {
		if (!name || !lastname) {
			toast.error(t('settings.userdata.toasts.nameRequired'))
			return
		}
		if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
			toast.error(t('settings.userdata.toasts.invalidEmail'))
			return
		}
		if (country && country.length !== 2) {
			toast.error(t('settings.userdata.toasts.invalidCountry'))
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
				toast.success(t('settings.userdata.toasts.updated'))
				// userApi.updateUser declara `ApiResult<unknown>`: forma local del perfil devuelto.
				const userData = result.data as User
				dispatchForm({ type: 'set', field: 'username', value: userData.username || username })
				dispatchForm({ type: 'set', field: 'name', value: userData.name || name })
				dispatchForm({ type: 'set', field: 'lastname', value: userData.lastname || lastname })
				dispatchForm({ type: 'set', field: 'bio', value: userData.bio || bio })
				updateUser({ name: userData.name || name, lastname: userData.lastname || lastname })
				// La guarda de arriba mezcla `success` y `data`: TS no estrecha a ApiFailure.
			} else { toast.error((result as { error?: string }).error || t('settings.userdata.toasts.updateFailed')) }
		} catch (error) {
			toast.error(t('settings.userdata.toasts.updateFailed'))
		} finally { setIsLoading(false) }
	}

	// Loading state
	if (isLoadingData) { return (<QPLoader />) }

	return (
		<QPKeyboardView
			actions={
				<QPButton
					title={t('settings.userdata.submitButton')}
					onPress={handleSubmit}
					disabled={!name || !lastname || isLoading}
					textStyle={{ color: theme.colors.almostWhite }}
					loading={isLoading}
				/>
			}
		>

			<Text style={textStyles.h1}>{t('settings.userdata.title')}</Text>
			<Text style={[textStyles.h3, { color: theme.colors.secondaryText }]}>{t('settings.userdata.subtitle')}</Text>

			{/* Account section */}
			<View style={{ marginTop: 20 }}>
				<SectionHeader icon="user-tag" title={t('settings.userdata.sections.account')} theme={theme} textStyles={textStyles} />
				<QPInput
					placeholder={t('settings.userdata.placeholders.username')}
					value={username}
					onChangeText={(value) => dispatchForm({ type: 'set', field: 'username', value })}
					editable={false}
					prefixIconName="user"
					style={{ opacity: 0.6 }}
					suffixIconName={userStatus.kyc ? 'circle-check' : ''}
				/>
				<QPInput
					placeholder={t('settings.userdata.placeholders.email')}
					value={email}
					onChangeText={(value) => dispatchForm({ type: 'set', field: 'email', value })}
					keyboardType="email-address"
					autoCapitalize="none"
					editable={false}
					style={{ opacity: 0.6 }}
					prefixIconName="envelope"
				/>
			</View>

			{/* Personal info section */}
			<View style={{ marginTop: 10 }}>
				<SectionHeader icon="id-card" title={t('settings.userdata.sections.personal')} theme={theme} textStyles={textStyles} />
				<QPInput
					placeholder={t('settings.userdata.placeholders.name')}
					value={name}
					onChangeText={(value) => dispatchForm({ type: 'set', field: 'name', value })}
					prefixIconName="user"
					autoCapitalize="words"
				/>
				<QPInput
					placeholder={t('settings.userdata.placeholders.lastname')}
					value={lastname}
					onChangeText={(value) => dispatchForm({ type: 'set', field: 'lastname', value })}
					prefixIconName="user"
					autoCapitalize="words"
				/>
				<QPInput
					placeholder={t('settings.userdata.placeholders.bio')}
					value={bio}
					onChangeText={(value) => dispatchForm({ type: 'set', field: 'bio', value })}
					multiline
					numberOfLines={4}
					prefixIconName="user-pen"
					style={{ textAlignVertical: 'top', paddingTop: 15 }}
				/>
			</View>

			{/* Contact section */}
			<View style={{ marginTop: 10 }}>
				<SectionHeader icon="address-book" title={t('settings.userdata.sections.contact')} theme={theme} textStyles={textStyles} />
				<QPInput
					placeholder={t('settings.userdata.placeholders.phone')}
					value={phone}
					onChangeText={(value) => dispatchForm({ type: 'set', field: 'phone', value })}
					keyboardType="phone-pad"
					prefixIconName="phone-volume"
					suffixIconName={userStatus.phone_verified ? 'circle-check' : ''}
					editable={false}
					style={{ opacity: 0.6 }}
				/>
				<QPInput
					placeholder={t('settings.userdata.placeholders.telegram')}
					value={telegram}
					onChangeText={(value) => dispatchForm({ type: 'set', field: 'telegram', value })}
					autoCapitalize="none"
					prefixIconName="telegram"
					iconStyle="brand"
					suffixIconName={userStatus.telegram_id ? 'circle-check' : ''}
				/>
				<QPInput
					placeholder={t('settings.userdata.placeholders.twitter')}
					value={twitter}
					onChangeText={(value) => dispatchForm({ type: 'set', field: 'twitter', value })}
					autoCapitalize="none"
					prefixIconName="x-twitter"
					iconStyle="brand"
				/>
			</View>

			{/* Location section */}
			<View style={{ marginTop: 10 }}>
				<SectionHeader icon="location-dot" title={t('settings.userdata.sections.location')} theme={theme} textStyles={textStyles} />
				<QPInput
					placeholder={t('settings.userdata.placeholders.address')}
					value={address}
					onChangeText={(value) => dispatchForm({ type: 'set', field: 'address', value })}
					autoCapitalize="sentences"
					prefixIconName="location-dot"
				/>
				<QPInput
					placeholder={t('settings.userdata.placeholders.country')}
					value={country}
					onChangeText={(value) => dispatchForm({ type: 'set', field: 'country', value })}
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
						{t('settings.userdata.info')}
					</Text>
				</View>
			</View>

			{/* La frase vive en UNA clave; la fecha estilizada entra como <0> vía Trans */}
			<Text style={[textStyles.caption, { color: theme.colors.secondaryText, textAlign: 'center', marginBottom: 40 }]}>
				<Trans
					i18nKey="settings.userdata.memberSince"
					values={{ date: formatDate(userStatus.createdAt) }}
					components={[<Text style={{ color: theme.colors.primary, fontFamily: theme.typography.fontFamily.medium }} />]}
				/>
			</Text>

		</QPKeyboardView>
	)
}

// Section header component
type SectionHeaderProps = {
	icon: FontAwesome6SolidIconName
	title: string
	theme: Theme
	textStyles: TextStyles
}

const SectionHeader = ({ icon, title, theme, textStyles }: SectionHeaderProps) => (
	<View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
		<FontAwesome6 name={icon} size={14} color={theme.colors.primary} iconStyle="solid" />
		<Text style={[textStyles.h5, { color: theme.colors.secondaryText, marginLeft: 8, marginBottom: 0 }]}>{title}</Text>
	</View>
)

export default Userdata
