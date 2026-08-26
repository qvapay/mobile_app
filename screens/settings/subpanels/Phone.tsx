import { useState, useEffect, useReducer } from 'react'
import { Text, View, Alert } from 'react-native'
import { useTranslation } from 'react-i18next'

// Theme
import { useTheme } from '../../../theme/ThemeContext'
import { createTextStyles, createContainerStyles } from '../../../theme/themeUtils'

// UI Particles
import QPInput from '../../../ui/particles/QPInput'
import QPButton from '../../../ui/particles/QPButton'
import QPLoader from '../../../ui/particles/QPLoader'
import QPKeyboardView from '../../../ui/QPKeyboardView'
import QPPhoneInput from '../../../ui/QPPhoneInput'

// Components
import PhoneVerifiedView from './PhoneVerifiedView'

// API
import { userApi } from '../../../api/userApi'

// User AuthContext
import { useAuth } from '../../../auth/AuthContext'

// Notifications
import { toast } from 'sonner-native'

// FontAwesome6
import FontAwesome6 from '@react-native-vector-icons/fontawesome6'

// Common country codes with dial codes
import { countries } from '../../../labels/countries'

// Tipos
/** Acción genérica de "setear un campo", compartida por los dos slices. */
type SetFieldAction = { type: 'set', field: string, value: unknown }

/** Formulario de verificación. */
type PhoneForm = { phone: string, country: string, pin: string, showPinInput: boolean }

/** Estado del teléfono ya guardado en el perfil. */
type PhoneStatus = { userPhoneVerified: boolean, userPhone: string }

// Generic field setter — used for the three related-state slices below
function setFieldReducer<S extends object>(state: S, action: SetFieldAction): S {
	switch (action.type) {
		case 'set':
			// La clave computada añade una firma de índice al spread: el cast la reduce a S.
			return { ...state, [action.field]: action.value } as S
		default:
			return state
	}
}

// Phone Component
const Phone = () => {

	// Contexts
	const { t } = useTranslation()
	const { updateUser } = useAuth()

	// Theme variables, dark and light modes with memoized styles
	const { theme } = useTheme()
	const textStyles = createTextStyles(theme)
	const containerStyles = createContainerStyles(theme)

	// Verification form state (same-named setters keep every call site unchanged)
	const [form, dispatchForm] = useReducer(setFieldReducer<PhoneForm>, { phone: '', country: 'US', pin: '', showPinInput: false })
	const { phone, country, pin, showPinInput } = form
	const setPhone = (value: string) => dispatchForm({ type: 'set', field: 'phone', value })
	const setCountry = (value: string) => dispatchForm({ type: 'set', field: 'country', value })
	const setPin = (value: string) => dispatchForm({ type: 'set', field: 'pin', value })
	const setShowPinInput = (value: boolean) => dispatchForm({ type: 'set', field: 'showPinInput', value })

	// Saved-phone status
	const [status, dispatchStatus] = useReducer(setFieldReducer<PhoneStatus>, { userPhoneVerified: false, userPhone: '' })
	const { userPhoneVerified, userPhone } = status
	const setUserPhoneVerified = (value: boolean) => dispatchStatus({ type: 'set', field: 'userPhoneVerified', value })
	const setUserPhone = (value: string) => dispatchStatus({ type: 'set', field: 'userPhone', value })

	// Loading States
	const [isVerifying, setIsVerifying] = useState(false)
	const [isLoading, setIsLoading] = useState(false)
	const [isLoadingData, setIsLoadingData] = useState(true)

	// Load user data on mount
	useEffect(() => {
		const loadUserData = async () => {
			try {
				setIsLoadingData(true)
				const result = await userApi.getUserProfile()
				if (result.success && result.data) {
					// `phone_verified` viaja como boolean O como 0/1 de MySQL (BoolInt): se guarda tal cual.
					setUserPhoneVerified((result.data.phone_verified as boolean) || false)
					setUserPhone(result.data.phone || '')
					if (result.data.phone) {
						// Extract country code from phone
						const phoneWithCode = result.data.phone
						const countryData = countries.find(c => phoneWithCode.startsWith(c.dial_code))
						if (countryData) {
							setCountry(countryData.code)
							setPhone(phoneWithCode.replace(countryData.dial_code, ''))
						}
					}
				}
			} catch (error) { /* error loading user data */ }
			finally { setIsLoadingData(false) }
		}
		loadUserData()
	}, [])

	// Remove phone number
	const handleRemovePhone = async () => {
		Alert.alert(
			t('settings.phone.alerts.removeTitle'),
			t('settings.phone.alerts.removeBody'),
			[
				{ text: t('common.actions.cancel'), style: 'cancel' },
				{
					text: t('common.actions.delete'),
					style: 'destructive',
					onPress: async () => {
						try {
							setIsLoading(true)
							const result = await userApi.removePhone()
							if (result.success) {
								setUserPhoneVerified(false)
								setUserPhone('')
								setPhone('')
								setPin('')
								setShowPinInput(false)
								if (updateUser) { updateUser({ phone: null, phone_verified: false }) }
								toast.success(t('settings.phone.toasts.removed'))
							} else {
								toast.error(result.error || t('settings.phone.toasts.removeFailed'))
							}
						} catch (error) {
							toast.error(t('settings.phone.toasts.removeFailed'))
						} finally { setIsLoading(false) }
					}
				}
			]
		)
	}

	// Send code to phone
	const handleSendCode = async () => {
		if (!phone.trim()) {
			toast.error(t('settings.phone.toasts.enterNumber'))
			return
		}
		if (phone.trim().length < 7) {
			toast.error(t('settings.phone.toasts.minDigits'))
			return
		}

		setIsLoading(true)
		try {
			const result = await userApi.verifyPhone({ phone: phone.trim(), country, verify: false })
			if (result.success) {
				setShowPinInput(true)
				toast.success(t('settings.phone.toasts.pinSent'))
			} else {
				// OJO (pre-existente): `ApiFailure.error` ya es un STRING — `.error`/`.message`
				// sobre él son siempre undefined y el fallback efectivo es `result.error`.
				const errorMsg = (result.error as unknown as { error?: string, message?: string })?.error || (result.error as unknown as { message?: string })?.message || result.error || t('settings.phone.toasts.sendFailed')
				toast.error(String(errorMsg))
			}
		} catch (error) {
			toast.error(t('settings.phone.toasts.sendFailed'))
		} finally { setIsLoading(false) }
	}

	// Verify phone
	const handleVerifyPhone = async () => {
		if (!pin.trim() || pin.trim().length !== 6) {
			toast.error(t('settings.phone.toasts.invalidPin'))
			return
		}

		setIsVerifying(true)
		try {
			const countryData = countries.find(c => c.code === country)
			// `country` sale siempre del picker (código válido del catálogo).
			const phoneNumber = `${countryData!.dial_code}${phone.trim()}`
			const result = await userApi.verifyPhone({ phone: phone.trim(), country, code: pin.trim(), verify: true })
			if (result.success) {
				setUserPhoneVerified(true)
				setUserPhone(phoneNumber)
				setShowPinInput(false)
				setPin('')
				setPhone('')
				toast.success(t('settings.phone.toasts.verified'))
			} else {
				// OJO (pre-existente): `ApiFailure.error` ya es un STRING — `.error`/`.message`
				// sobre él son siempre undefined y el fallback efectivo es `result.error`.
				const errorMsg = (result.error as unknown as { error?: string, message?: string })?.error || (result.error as unknown as { message?: string })?.message || result.error || t('settings.phone.toasts.verifyFailed')
				toast.error(String(errorMsg))
			}
		} catch (error) {
			toast.error(t('settings.phone.toasts.verifyFailed'))
		} finally { setIsVerifying(false) }
	}

	// Loading state
	if (isLoadingData) { return (<QPLoader />) }

	// Verified state
	if (userPhoneVerified) {
		return (
			<PhoneVerifiedView
				userPhone={userPhone}
				onRemove={handleRemovePhone}
				isLoading={isLoading}
				theme={theme}
				textStyles={textStyles}
				containerStyles={containerStyles}
			/>
		)
	}

	// Unverified state - form
	return (
		<>
			<QPKeyboardView
				actions={
					!showPinInput ? (
						<QPButton
							title={t('settings.phone.sendCodeButton')}
							onPress={handleSendCode}
							loading={isLoading}
							disabled={isLoading || !phone.trim()}
							textStyle={{ color: theme.colors.buttonText }}
						/>
					) : (
						<>
							<QPButton
								title={t('settings.phone.verifyButton')}
								onPress={handleVerifyPhone}
								loading={isVerifying}
								disabled={isVerifying || !pin.trim() || pin.trim().length !== 6}
								textStyle={{ color: theme.colors.buttonText }}
							/>
							<QPButton
								title={t('settings.phone.resendButton')}
								onPress={handleSendCode}
								loading={isLoading}
								disabled={isLoading}
								style={{ backgroundColor: theme.colors.surface, marginTop: 10 }}
								textStyle={{ color: theme.colors.primaryText }}
							/>
						</>
					)
				}
			>

				<Text style={textStyles.h1}>{t('settings.phone.title')}</Text>
				<Text style={[textStyles.h3, { color: theme.colors.secondaryText }]}>{t('settings.phone.subtitle')}</Text>

				{/* Status icon */}
				<View style={{ alignItems: 'center', paddingVertical: 24 }}>
					<View style={{
						width: 80,
						height: 80,
						borderRadius: 40,
						alignItems: 'center',
						justifyContent: 'center',
						backgroundColor: theme.colors.warning + '20',
					}}>
						<FontAwesome6 name="phone" size={36} color={theme.colors.warning} iconStyle="solid" />
					</View>
				</View>

				<View style={{ flex: 1 }}>
					{/* Country + Phone Input */}
					<QPPhoneInput
						country={country}
						onChangeCountry={setCountry}
						value={phone}
						onChangeText={setPhone}
					/>

					{showPinInput && (
						<QPInput
							value={pin}
							onChangeText={setPin}
							placeholder={t('settings.phone.codePlaceholder')}
							keyboardType="numeric"
							maxLength={6}
							prefixIconName="key"
							style={{ marginTop: 12 }}
						/>
					)}
				</View>

				{/* Info card */}
				<View style={[containerStyles.card, { marginTop: 10, marginBottom: 20 }]}>
					<View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
						<FontAwesome6 name="circle-info" size={16} color={theme.colors.primary} iconStyle="solid" />
						<Text style={[textStyles.body, { color: theme.colors.secondaryText, marginLeft: 12, flex: 1 }]}>
							{t('settings.phone.info')}
						</Text>
					</View>
				</View>

			</QPKeyboardView>
		</>
	)
}

export default Phone
