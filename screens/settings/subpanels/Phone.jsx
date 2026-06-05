import { useState, useEffect, useReducer } from 'react'
import { Text, View, Alert } from 'react-native'

// Theme
import { useTheme } from '../../../theme/ThemeContext'
import { createTextStyles, createContainerStyles } from '../../../theme/themeUtils'

// UI Particles
import QPInput from '../../../ui/particles/QPInput'
import QPButton from '../../../ui/particles/QPButton'
import QPLoader from '../../../ui/particles/QPLoader'
import QPKeyboardView from '../../../ui/QPKeyboardView'
import QPPressable from '../../../ui/particles/QPPressable'

// Components
import CountryPickerModal from './CountryPickerModal'
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

// Generic field setter — used for the three related-state slices below
function setFieldReducer(state, action) {
	switch (action.type) {
		case 'set':
			return { ...state, [action.field]: action.value }
		default:
			return state
	}
}

// Phone Component
const Phone = () => {

	// Contexts
	const { updateUser } = useAuth()

	// Theme variables, dark and light modes with memoized styles
	const { theme } = useTheme()
	const textStyles = createTextStyles(theme)
	const containerStyles = createContainerStyles(theme)

	// Verification form state (same-named setters keep every call site unchanged)
	const [form, dispatchForm] = useReducer(setFieldReducer, { phone: '', country: 'US', pin: '', showPinInput: false })
	const { phone, country, pin, showPinInput } = form
	const setPhone = (value) => dispatchForm({ type: 'set', field: 'phone', value })
	const setCountry = (value) => dispatchForm({ type: 'set', field: 'country', value })
	const setPin = (value) => dispatchForm({ type: 'set', field: 'pin', value })
	const setShowPinInput = (value) => dispatchForm({ type: 'set', field: 'showPinInput', value })

	// Saved-phone status
	const [status, dispatchStatus] = useReducer(setFieldReducer, { userPhoneVerified: false, userPhone: '' })
	const { userPhoneVerified, userPhone } = status
	const setUserPhoneVerified = (value) => dispatchStatus({ type: 'set', field: 'userPhoneVerified', value })
	const setUserPhone = (value) => dispatchStatus({ type: 'set', field: 'userPhone', value })

	// Country picker modal
	const [picker, dispatchPicker] = useReducer(setFieldReducer, { showCountryPicker: false, countrySearch: '' })
	const { showCountryPicker, countrySearch } = picker
	const setShowCountryPicker = (value) => dispatchPicker({ type: 'set', field: 'showCountryPicker', value })
	const setCountrySearch = (value) => dispatchPicker({ type: 'set', field: 'countrySearch', value })

	// Loading States
	const [isVerifying, setIsVerifying] = useState(false)
	const [isLoading, setIsLoading] = useState(false)
	const [isLoadingData, setIsLoadingData] = useState(true)

	// Load user data on mount
	useEffect(() => {
		loadUserData()
	}, [])

	// Load user data from API
	const loadUserData = async () => {
		try {
			setIsLoadingData(true)
			const result = await userApi.getUserProfile()
			if (result.success && result.data) {
				setUserPhoneVerified(result.data.phone_verified || false)
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

	// Remove phone number
	const handleRemovePhone = async () => {
		Alert.alert(
			'Eliminar Teléfono',
			'¿Estás seguro de que quieres eliminar tu número de teléfono?',
			[
				{ text: 'Cancelar', style: 'cancel' },
				{
					text: 'Eliminar',
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
								toast.success('Número de teléfono eliminado correctamente')
							} else {
								toast.error(result.error || 'Error al eliminar el número de teléfono')
							}
						} catch (error) {
							toast.error('Error al eliminar el número de teléfono')
						} finally { setIsLoading(false) }
					}
				}
			]
		)
	}

	// Send code to phone
	const handleSendCode = async () => {
		if (!phone.trim()) {
			toast.error('Por favor ingresa un número de teléfono')
			return
		}
		if (phone.trim().length < 7) {
			toast.error('El número debe tener al menos 7 dígitos')
			return
		}

		setIsLoading(true)
		try {
			const result = await userApi.verifyPhone({ phone: phone.trim(), country, verify: false })
			if (result.success) {
				setShowPinInput(true)
				toast.success('PIN enviado a tu Telegram')
			} else {
				const errorMsg = result.error?.error || result.error?.message || result.error || 'Error al enviar el código'
				toast.error(String(errorMsg))
			}
		} catch (error) {
			toast.error('Error al enviar el código')
		} finally { setIsLoading(false) }
	}

	// Verify phone
	const handleVerifyPhone = async () => {
		if (!pin.trim() || pin.trim().length !== 6) {
			toast.error('Ingresa un PIN válido de 6 dígitos')
			return
		}

		setIsVerifying(true)
		try {
			const countryData = countries.find(c => c.code === country)
			const phoneNumber = `${countryData.dial_code}${phone.trim()}`
			const result = await userApi.verifyPhone({ phone: phone.trim(), country, code: pin.trim(), verify: true })
			if (result.success) {
				setUserPhoneVerified(true)
				setUserPhone(phoneNumber)
				setShowPinInput(false)
				setPin('')
				setPhone('')
				toast.success('Teléfono verificado correctamente')
			} else {
				const errorMsg = result.error?.error || result.error?.message || result.error || 'Error al verificar el teléfono'
				toast.error(String(errorMsg))
			}
		} catch (error) {
			toast.error('Error al verificar el teléfono')
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
							title="Enviar código"
							onPress={handleSendCode}
							loading={isLoading}
							disabled={isLoading || !phone.trim()}
							textStyle={{ color: theme.colors.buttonText }}
						/>
					) : (
						<>
							<QPButton
								title="Verificar teléfono"
								onPress={handleVerifyPhone}
								loading={isVerifying}
								disabled={isVerifying || !pin.trim() || pin.trim().length !== 6}
								textStyle={{ color: theme.colors.buttonText }}
							/>
							<QPButton
								title="Reenviar código"
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

				<Text style={textStyles.h1}>Verificar Teléfono</Text>
				<Text style={[textStyles.h3, { color: theme.colors.secondaryText }]}>Ingresa tu número para verificarlo vía Telegram</Text>

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
					{/* Country Selection */}
					<QPPressable
						style={{
							flexDirection: 'row',
							alignItems: 'center',
							justifyContent: 'space-between',
							backgroundColor: theme.colors.surface,
							borderRadius: 12,
							padding: 16,
							marginBottom: 12,
						}}
						onPress={() => setShowCountryPicker(true)}
					>
						<View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
							<FontAwesome6 name="globe" size={18} color={theme.colors.primary} iconStyle="solid" />
							<Text style={[textStyles.body, { color: theme.colors.primaryText, marginLeft: 12 }]}>
								{countries.find(c => c.code === country)?.name} ({countries.find(c => c.code === country)?.dial_code})
							</Text>
						</View>
						<FontAwesome6 name="chevron-down" size={14} color={theme.colors.secondaryText} iconStyle="solid" />
					</QPPressable>

					{/* Phone Input */}
					<QPInput
						value={phone}
						onChangeText={setPhone}
						placeholder="Número de teléfono"
						keyboardType="phone-pad"
						prefixIconName="phone-volume"
					/>

					{showPinInput && (
						<QPInput
							value={pin}
							onChangeText={setPin}
							placeholder="Código de 6 dígitos"
							keyboardType="numeric"
							maxLength={6}
							prefixIconName="key"
						/>
					)}
				</View>

				{/* Info card */}
				<View style={[containerStyles.card, { marginTop: 10, marginBottom: 20 }]}>
					<View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
						<FontAwesome6 name="circle-info" size={16} color={theme.colors.primary} iconStyle="solid" />
						<Text style={[textStyles.body, { color: theme.colors.secondaryText, marginLeft: 12, flex: 1 }]}>
							El código de verificación se enviará a tu cuenta de Telegram asociada a este número. Revisa tus mensajes de Telegram para obtener el PIN.
						</Text>
					</View>
				</View>

			</QPKeyboardView>

			{/* Country Picker Modal */}
			<CountryPickerModal
				visible={showCountryPicker}
				country={country}
				countrySearch={countrySearch}
				onChangeSearch={setCountrySearch}
				onSelect={(code) => { setCountry(code); setShowCountryPicker(false); setCountrySearch('') }}
				onClose={() => { setShowCountryPicker(false); setCountrySearch('') }}
				theme={theme}
				textStyles={textStyles}
			/>
		</>
	)
}

export default Phone
