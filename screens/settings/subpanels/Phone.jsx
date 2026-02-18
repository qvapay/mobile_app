import { useState, useEffect } from 'react'
import { StyleSheet, Text, View, ScrollView, TouchableOpacity, Modal, KeyboardAvoidingView, Platform, Keyboard, TouchableWithoutFeedback, Alert } from 'react-native'

// Theme
import { useTheme } from '../../../theme/ThemeContext'
import { createTextStyles, createContainerStyles } from '../../../theme/themeUtils'

// UI Particles
import QPInput from '../../../ui/particles/QPInput'
import QPButton from '../../../ui/particles/QPButton'
import QPLoader from '../../../ui/particles/QPLoader'

// API
import { userApi } from '../../../api/userApi'

// User AuthContext
import { useAuth } from '../../../auth/AuthContext'

// Notifications
import Toast from 'react-native-toast-message'

// FontAwesome6
import FontAwesome6 from '@react-native-vector-icons/fontawesome6'

// Common country codes with dial codes
import { countries } from '../../../labels/countries'

// Phone Component
const Phone = () => {

	// Contexts
	const { updateUser } = useAuth()

	// Theme variables, dark and light modes with memoized styles
	const { theme } = useTheme()
	const textStyles = createTextStyles(theme)
	const containerStyles = createContainerStyles(theme)

	// States
	const [phone, setPhone] = useState('')
	const [country, setCountry] = useState('US')
	const [pin, setPin] = useState('')
	const [isVerifying, setIsVerifying] = useState(false)
	const [showPinInput, setShowPinInput] = useState(false)
	const [userPhoneVerified, setUserPhoneVerified] = useState(false)
	const [userPhone, setUserPhone] = useState('')
	const [showCountryPicker, setShowCountryPicker] = useState(false)
	const [countrySearch, setCountrySearch] = useState('')

	// Loading States
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
								Toast.show({ type: 'success', text1: 'Número de teléfono eliminado correctamente' })
							} else {
								Toast.show({ type: 'error', text1: result.error || 'Error al eliminar el número de teléfono' })
							}
						} catch (error) {
							Toast.show({ type: 'error', text1: 'Error al eliminar el número de teléfono' })
						} finally { setIsLoading(false) }
					}
				}
			]
		)
	}

	// Send code to phone
	const handleSendCode = async () => {
		if (!phone.trim()) {
			Toast.show({ type: 'error', text1: 'Por favor ingresa un número de teléfono' })
			return
		}
		if (phone.trim().length < 7) {
			Toast.show({ type: 'error', text1: 'El número debe tener al menos 7 dígitos' })
			return
		}

		setIsLoading(true)
		try {
			const result = await userApi.verifyPhone({ phone: phone.trim(), country, verify: false })
			if (result.success) {
				setShowPinInput(true)
				Toast.show({ type: 'success', text1: 'PIN de verificación enviado' })
			} else {
				const errorMsg = result.error?.error || result.error?.message || result.error || 'Error al enviar el código'
				Toast.show({ type: 'error', text1: String(errorMsg) })
			}
		} catch (error) {
			Toast.show({ type: 'error', text1: 'Error al enviar el código' })
		} finally { setIsLoading(false) }
	}

	// Verify phone
	const handleVerifyPhone = async () => {
		if (!pin.trim() || pin.trim().length !== 6) {
			Toast.show({ type: 'error', text1: 'Ingresa un PIN válido de 6 dígitos' })
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
				Toast.show({ type: 'success', text1: 'Teléfono verificado correctamente' })
			} else {
				const errorMsg = result.error?.error || result.error?.message || result.error || 'Error al verificar el teléfono'
				Toast.show({ type: 'error', text1: String(errorMsg) })
			}
		} catch (error) {
			Toast.show({ type: 'error', text1: 'Error al verificar el teléfono' })
		} finally { setIsVerifying(false) }
	}

	// Loading state
	if (isLoadingData) { return (<QPLoader />) }

	// Verified state
	if (userPhoneVerified) {
		return (
			<View style={containerStyles.subContainer}>
				<ScrollView contentContainerStyle={containerStyles.scrollContainer} showsVerticalScrollIndicator={false}>

					<Text style={textStyles.h1}>Teléfono</Text>
					<Text style={[textStyles.h3, { color: theme.colors.secondaryText }]}>
						Tu número está verificado
					</Text>

					{/* Status icon */}
					<View style={{ alignItems: 'center', paddingVertical: 30 }}>
						<View style={{
							width: 100,
							height: 100,
							borderRadius: 50,
							alignItems: 'center',
							justifyContent: 'center',
							backgroundColor: theme.colors.success + '20',
						}}>
							<FontAwesome6 name="phone" size={48} color={theme.colors.success} iconStyle="solid" />
						</View>
						<Text style={[textStyles.h2, { color: theme.colors.primaryText, marginTop: 16 }]}>
							{userPhone}
						</Text>
					</View>

					{/* Info card */}
					<View style={containerStyles.card}>
						<View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
							<FontAwesome6 name="circle-check" size={16} color={theme.colors.success} iconStyle="solid" />
							<Text style={[textStyles.body, { color: theme.colors.secondaryText, marginLeft: 12, flex: 1 }]}>
								Tu número verificado te permite recibir códigos de seguridad por SMS y recuperar acceso a tu cuenta.
							</Text>
						</View>
					</View>

					<View style={containerStyles.bottomButtonContainer}>
						<QPButton
							title="Eliminar número"
							onPress={handleRemovePhone}
							loading={isLoading}
							disabled={isLoading}
							style={{ backgroundColor: theme.colors.danger }}
							textStyle={{ color: theme.colors.almostWhite }}
						/>
					</View>

				</ScrollView>
			</View>
		)
	}

	// Unverified state - form
	return (
		<KeyboardAvoidingView style={containerStyles.subContainer} behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}>
			<TouchableWithoutFeedback onPress={Keyboard.dismiss}>
				<ScrollView contentContainerStyle={containerStyles.scrollContainer} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

					<Text style={textStyles.h1}>Verificar Teléfono</Text>
					<Text style={[textStyles.h3, { color: theme.colors.secondaryText }]}>Ingresa tu número para recibir un código de verificación</Text>

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
						<TouchableOpacity
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
						</TouchableOpacity>

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
								Verificar tu teléfono te permite recibir notificaciones SMS y añade una capa extra de seguridad a tu cuenta.
							</Text>
						</View>
					</View>

					<View style={containerStyles.bottomButtonContainer}>
						{!showPinInput ? (
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
						)}
					</View>

					{/* Country Picker Modal */}
					<Modal
						visible={showCountryPicker}
						transparent={true}
						animationType="slide"
						onRequestClose={() => { setShowCountryPicker(false); setCountrySearch('') }}
					>
						<View style={styles.modalOverlay}>
							<View style={[styles.modalContent, { backgroundColor: theme.colors.surface }]}>
								<View style={styles.modalHeader}>
									<Text style={[textStyles.h4, { color: theme.colors.primaryText }]}>Seleccionar país</Text>
									<TouchableOpacity onPress={() => { setShowCountryPicker(false); setCountrySearch('') }}>
										<FontAwesome6 name="circle-xmark" size={24} color={theme.colors.secondaryText} />
									</TouchableOpacity>
								</View>
								<QPInput
									value={countrySearch}
									onChangeText={setCountrySearch}
									placeholder="Buscar país..."
									prefixIconName="magnifying-glass"
									style={{ marginVertical: 0 }}
								/>
								<ScrollView style={{ maxHeight: 400 }}>
									{countries.filter(c => c.name.toLowerCase().includes(countrySearch.toLowerCase()) || c.code.toLowerCase().includes(countrySearch.toLowerCase())).map((c) => (
										<TouchableOpacity
											key={`${c.code}-${c.dial_code}`}
											style={[styles.countryItem, { backgroundColor: country === c.code ? theme.colors.primary : theme.colors.background }]}
											onPress={() => { setCountry(c.code); setShowCountryPicker(false); setCountrySearch('') }}
										>
											<Text style={[styles.countryItemText, { color: country === c.code ? theme.colors.buttonText : theme.colors.primaryText }]}>
												{c.name} ({c.dial_code})
											</Text>
										</TouchableOpacity>
									))}
								</ScrollView>
							</View>
						</View>
					</Modal>

				</ScrollView>
			</TouchableWithoutFeedback>
		</KeyboardAvoidingView>
	)
}

const styles = StyleSheet.create({
	modalOverlay: {
		flex: 1,
		backgroundColor: 'rgba(0, 0, 0, 0.5)',
		justifyContent: 'center',
		alignItems: 'center',
	},
	modalContent: {
		width: '90%',
		maxHeight: '80%',
		borderRadius: 16,
		padding: 20,
	},
	modalHeader: {
		flexDirection: 'row',
		justifyContent: 'space-between',
		alignItems: 'center',
		marginBottom: 10,
	},
	countryItem: {
		paddingVertical: 15,
		paddingHorizontal: 20,
		borderRadius: 10,
		marginBottom: 8,
	},
	countryItemText: {
		fontSize: 16,
		fontFamily: 'Rubik-Regular',
	},
})

export default Phone
