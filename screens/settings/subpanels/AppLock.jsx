import { useState, useEffect, useRef } from 'react'
import { View, Text, ScrollView, TextInput, Alert, Pressable, StyleSheet } from 'react-native'
import LottieView from 'lottie-react-native'
import FontAwesome6 from '@react-native-vector-icons/fontawesome6'
import Toast from 'react-native-toast-message'

import { useTheme } from '../../../theme/ThemeContext'
import { createTextStyles, createContainerStyles } from '../../../theme/themeUtils'
import { useSettings } from '../../../settings/SettingsContext'
import { useAppLock } from '../../../lock/AppLockContext'
import { getSupportedBiometryType, hasBiometricCredentials } from '../../../api/client'
import QPButton from '../../../ui/particles/QPButton'
import FaceIDIcon from '../../../ui/particles/FaceIDIcon'

const TIMEOUT_OPTIONS = [
	{ label: '1 min', value: 1 },
	{ label: '2 min', value: 2 },
	{ label: '5 min', value: 5 },
	{ label: '10 min', value: 10 },
	{ label: '15 min', value: 15 },
	{ label: '30 min', value: 30 },
]

const AppLock = () => {

	const { theme } = useTheme()
	const textStyles = createTextStyles(theme)
	const containerStyles = createContainerStyles(theme)
	const { security } = useSettings()
	const { appLockEnabled, enableAppLock, disableAppLock, changeAppLockPin, updateAutoLockTimeout } = useAppLock()

	// Setup flow states
	const [mode, setMode] = useState('info') // info | setup | confirm | changePin
	const [pin, setPin] = useState('')
	const [confirmPin, setConfirmPin] = useState('')
	const [oldPin, setOldPin] = useState('')
	const [isLoading, setIsLoading] = useState(false)
	const [focusedField, setFocusedField] = useState(null)
	const [focusedIndex, setFocusedIndex] = useState(null)
	const [biometryType, setBiometryType] = useState(null)
	const [biometricsAvailable, setBiometricsAvailable] = useState(false)

	const pinRefs = useRef([])
	const confirmPinRefs = useRef([])
	const oldPinRefs = useRef([])

	useEffect(() => {
		const checkBiometrics = async () => {
			const type = await getSupportedBiometryType()
			const hasCredentials = await hasBiometricCredentials()
			setBiometryType(type)
			setBiometricsAvailable(!!type && hasCredentials)
		}
		checkBiometrics()
	}, [])

	const resetForm = () => {
		setPin('')
		setConfirmPin('')
		setOldPin('')
		setMode('info')
		setFocusedField(null)
		setFocusedIndex(null)
	}

	// Handle enable app lock
	const handleEnable = async () => {
		if (pin.length !== 4) {
			Toast.show({ type: 'error', text1: 'Ingresa un PIN de 4 d\u00edgitos' })
			return
		}
		if (mode === 'setup') {
			setMode('confirm')
			setTimeout(() => confirmPinRefs.current[0]?.focus(), 100)
			return
		}
		if (pin !== confirmPin) {
			Toast.show({ type: 'error', text1: 'Los PIN no coinciden' })
			setConfirmPin('')
			setTimeout(() => confirmPinRefs.current[0]?.focus(), 100)
			return
		}
		setIsLoading(true)
		const result = await enableAppLock(pin)
		setIsLoading(false)
		if (result.success) {
			Toast.show({ type: 'success', text1: 'Bloqueo activado', text2: 'Tu app está protegida' })
			resetForm()
		} else {
			Toast.show({ type: 'error', text1: result.error })
		}
	}

	// Handle disable
	const handleDisable = () => {
		Alert.alert(
			'Desactivar bloqueo',
			'Tu app ya no se bloqueará automáticamente. ¿Continuar?',
			[
				{ text: 'Cancelar', style: 'cancel' },
				{
					text: 'Desactivar',
					style: 'destructive',
					onPress: async () => {
						await disableAppLock()
						Toast.show({ type: 'success', text1: 'Bloqueo desactivado' })
						resetForm()
					}
				}
			]
		)
	}

	// Handle change PIN
	const handleChangePin = async () => {
		if (oldPin.length !== 4 || pin.length !== 4 || confirmPin.length !== 4) {
			Toast.show({ type: 'error', text1: 'Completa todos los campos' })
			return
		}
		if (pin !== confirmPin) {
			Toast.show({ type: 'error', text1: 'Los PIN nuevos no coinciden' })
			setConfirmPin('')
			setTimeout(() => confirmPinRefs.current[0]?.focus(), 100)
			return
		}
		setIsLoading(true)
		const result = await changeAppLockPin(oldPin, pin)
		setIsLoading(false)
		if (result.success) {
			Toast.show({ type: 'success', text1: 'PIN actualizado' })
			resetForm()
		} else {
			Toast.show({ type: 'error', text1: result.error })
		}
	}

	// Generic PIN input handler
	const handlePinInput = (text, index, currentPin, setPinFn, refs, nextRefs) => {
		const numericText = text.replace(/[^0-9]/g, '')
		const newPin = currentPin.split('')
		newPin[index] = numericText
		setPinFn(newPin.join(''))
		if (numericText && index < 3) {
			refs.current[index + 1]?.focus()
		} else if (numericText && index === 3 && nextRefs) {
			setTimeout(() => nextRefs.current[0]?.focus(), 100)
		}
	}

	const handlePinKeyPress = (e, index, currentPin, setPinFn, refs) => {
		if (e.nativeEvent.key === 'Backspace') {
			if (currentPin[index]) {
				const newPin = currentPin.split('')
				newPin[index] = ''
				setPinFn(newPin.join(''))
			} else if (index > 0) {
				const newPin = currentPin.split('')
				newPin[index - 1] = ''
				setPinFn(newPin.join(''))
				refs.current[index - 1]?.focus()
			}
		}
	}

	// Render PIN input row
	const renderPinRow = (label, value, setValue, refs, fieldName, nextRefs) => (
		<View style={{ marginTop: 16 }}>
			<Text style={[textStyles.h5, { color: theme.colors.secondaryText, marginBottom: 8 }]}>
				{label}
			</Text>
			<View style={styles.pinRow}>
				{[0, 1, 2, 3].map((index) => (
					<TextInput
						key={`${fieldName}-${index}`}
						ref={(ref) => refs.current[index] = ref}
						style={[styles.pinInput, {
							backgroundColor: theme.colors.surface,
							color: theme.colors.primaryText,
							borderColor: focusedField === fieldName && focusedIndex === index
								? theme.colors.primary : theme.colors.surface,
							borderWidth: 1.5, fontSize: theme.typography.fontSize.xxl, fontFamily: theme.typography.fontFamily.bold,
						}]}
						value={value[index] || ''}
						onChangeText={(text) => handlePinInput(text, index, value, setValue, refs, nextRefs)}
						onKeyPress={(e) => handlePinKeyPress(e, index, value, setValue, refs)}
						onFocus={() => { setFocusedField(fieldName); setFocusedIndex(index) }}
						onBlur={() => { setFocusedField(null); setFocusedIndex(null) }}
						keyboardType="numeric"
						maxLength={1}
						secureTextEntry
						textAlign="center"
						selectTextOnFocus
						placeholder={focusedField === fieldName && focusedIndex === index ? '' : '0'}
						placeholderTextColor={theme.colors.tertiaryText}
					/>
				))}
			</View>
		</View>
	)

	// Enabled view - show settings
	if (appLockEnabled && mode === 'info') {
		return (
			<View style={containerStyles.subContainer}>
				<ScrollView contentContainerStyle={containerStyles.scrollContainer} showsVerticalScrollIndicator={false}>

					<Text style={textStyles.h1}>Bloqueo de app</Text>
					<Text style={[textStyles.h3, { color: theme.colors.secondaryText }]}>
						Tu app está protegida
					</Text>

					{/* Status icon */}
					<View style={{ alignItems: 'center', paddingVertical: 30 }}>
						<View style={{ width: 100, height: 100, borderRadius: 50, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.success + '20' }}>
							<FontAwesome6 name="lock" size={40} color={theme.colors.success} iconStyle="solid" />
						</View>
						<Text style={[textStyles.h2, { color: theme.colors.success, marginTop: 20 }]}>Activo</Text>
					</View>

					{/* Auto-lock timeout */}
					<View style={[containerStyles.card, { marginBottom: 16 }]}>
						<Text style={[textStyles.h4, { marginBottom: 12 }]}>Tiempo de bloqueo</Text>
						<Text style={[textStyles.body, { color: theme.colors.secondaryText, marginBottom: 16 }]}>
							La app se bloqueará después de este tiempo en segundo plano
						</Text>
						<View style={styles.timeoutGrid}>
							{TIMEOUT_OPTIONS.map((option) => (
								<Pressable
									key={option.value}
									style={[styles.timeoutChip, {
										backgroundColor: security.autoLockTimeout === option.value
											? theme.colors.primary : theme.colors.surface,
										borderColor: security.autoLockTimeout === option.value
											? theme.colors.primary : theme.colors.border,
									}]}
									onPress={() => updateAutoLockTimeout(option.value)}
								>
									<Text style={[textStyles.h6, {
										color: security.autoLockTimeout === option.value
											? '#FFFFFF' : theme.colors.secondaryText,
									}]}>
										{option.label}
									</Text>
								</Pressable>
							))}
						</View>
					</View>

					{/* Biometric unlock info */}
					{biometricsAvailable && (
						<View style={[containerStyles.card, { marginBottom: 16 }]}>
							<View style={{ flexDirection: 'row', alignItems: 'center' }}>
								{biometryType === 'FaceID' ? (
									<View style={{ marginRight: 12 }}><FaceIDIcon size={20} color={theme.colors.primary} /></View>
								) : (
									<FontAwesome6 name="fingerprint" size={18} style={{ color: theme.colors.primary, marginRight: 12 }} iconStyle="solid" />
								)}
								<Text style={[textStyles.h4, { flex: 1, marginBottom: 0 }]}>
									{biometryType === 'FaceID' ? 'Face ID' : biometryType === 'TouchID' ? 'Touch ID' : 'Huella Digital'} activado
								</Text>
								<FontAwesome6 name="circle-check" size={20} color={theme.colors.success} iconStyle="solid" />
							</View>
							<Text style={[textStyles.body, { color: theme.colors.secondaryText, marginTop: 8 }]}>
								Puedes desbloquear con biometría o PIN
							</Text>
						</View>
					)}

					{/* Actions */}
					<QPButton
						title="Cambiar PIN de bloqueo"
						onPress={() => {
							setMode('changePin')
							setTimeout(() => oldPinRefs.current[0]?.focus(), 100)
						}}
						style={{ marginTop: 8 }}
					/>
					<QPButton
						title="Desactivar bloqueo"
						onPress={handleDisable}
						style={{ marginTop: 12 }}
						danger
					/>

				</ScrollView>
			</View>
		)
	}

	// Change PIN view
	if (mode === 'changePin') {
		return (
			<View style={containerStyles.subContainer}>
				<ScrollView contentContainerStyle={containerStyles.scrollContainer} showsVerticalScrollIndicator={false}>

					<Text style={textStyles.h1}>Cambiar PIN</Text>
					<Text style={[textStyles.h3, { color: theme.colors.secondaryText }]}>
						Ingresa tu PIN actual y el nuevo
					</Text>

					{renderPinRow('PIN actual', oldPin, setOldPin, oldPinRefs, 'old', pinRefs)}
					{renderPinRow('Nuevo PIN', pin, setPin, pinRefs, 'new', confirmPinRefs)}
					{renderPinRow('Confirmar nuevo PIN', confirmPin, setConfirmPin, confirmPinRefs, 'confirm', null)}

					<View style={{ marginTop: 32 }}>
						<QPButton
							title="Actualizar PIN"
							onPress={handleChangePin}
							loading={isLoading}
							disabled={oldPin.length !== 4 || pin.length !== 4 || confirmPin.length !== 4}
						/>
						<QPButton
							title="Cancelar"
							onPress={resetForm}
							style={{ marginTop: 12 }}
							danger
							outlined
						/>
					</View>

				</ScrollView>
			</View>
		)
	}

	// Setup / Disabled view
	return (
		<View style={containerStyles.subContainer}>
			<ScrollView contentContainerStyle={containerStyles.scrollContainer} showsVerticalScrollIndicator={false}>

				{mode === 'info' && (
					<>
						<Text style={textStyles.h1}>Bloqueo de app</Text>
						<Text style={[textStyles.h3, { color: theme.colors.secondaryText }]}>
							Protege tu app con PIN y biometría
						</Text>

						{/* Status icon */}
						<View style={{ alignItems: 'center', paddingVertical: 30 }}>
							<LottieView
								style={{ width: 120, height: 120 }}
								source={require('../../../assets/lotties/security.json')}
								autoPlay
								loop={false}
							/>
						</View>

						{/* Info card */}
						<View style={[containerStyles.card, { marginBottom: 24 }]}>
							<View style={{ flexDirection: 'row', alignItems: 'flex-start', marginBottom: 12 }}>
								<FontAwesome6 name="shield-halved" size={16} color={theme.colors.primary} iconStyle="solid" />
								<Text style={[textStyles.body, { color: theme.colors.secondaryText, marginLeft: 12, flex: 1 }]}>
									Bloquea la app automáticamente después de {security.autoLockTimeout || 5} minutos en segundo plano
								</Text>
							</View>
							<View style={{ flexDirection: 'row', alignItems: 'flex-start', marginBottom: 12 }}>
								<FontAwesome6 name="fingerprint" size={16} color={theme.colors.primary} iconStyle="solid" />
								<Text style={[textStyles.body, { color: theme.colors.secondaryText, marginLeft: 12, flex: 1 }]}>
									Desbloquea con Face ID, Touch ID o Huella Digital o tu PIN de 4 dígitos
								</Text>
							</View>
							<View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
								<FontAwesome6 name="lock" size={16} color={theme.colors.primary} iconStyle="solid" />
								<Text style={[textStyles.body, { color: theme.colors.secondaryText, marginLeft: 12, flex: 1 }]}>
									Toda la verificación es local, no se envían datos al servidor
								</Text>
							</View>
						</View>

						<QPButton
							title="Activar bloqueo"
							onPress={() => {
								setMode('setup')
								setTimeout(() => pinRefs.current[0]?.focus(), 100)
							}}
						/>
					</>
				)}

				{mode === 'setup' && (
					<>
						<Text style={textStyles.h1}>Crear PIN</Text>
						<Text style={[textStyles.h3, { color: theme.colors.secondaryText }]}>
							Elige un PIN de 4 dígitos para bloquear tu app
						</Text>

						{renderPinRow('Nuevo PIN', pin, setPin, pinRefs, 'new', null)}

						<View style={{ marginTop: 32 }}>
							<QPButton
								title="Continuar"
								onPress={handleEnable}
								disabled={pin.length !== 4}
							/>
							<QPButton
								title="Cancelar"
								onPress={resetForm}
								style={{ marginTop: 12 }}
								danger
								outlined
							/>
						</View>
					</>
				)}

				{mode === 'confirm' && (
					<>
						<Text style={textStyles.h1}>Confirmar PIN</Text>
						<Text style={[textStyles.h3, { color: theme.colors.secondaryText }]}>
							Ingresa el PIN nuevamente para confirmar
						</Text>

						{renderPinRow('Confirmar PIN', confirmPin, setConfirmPin, confirmPinRefs, 'confirm', null)}

						<View style={{ marginTop: 32 }}>
							<QPButton
								title="Activar bloqueo"
								textStyle={{ color: theme.colors.buttonText }}
								onPress={handleEnable}
								loading={isLoading}
								disabled={confirmPin.length !== 4}
							/>
							<QPButton
								title="Cancelar"
								onPress={resetForm}
								style={{ marginTop: 12 }}
								danger
								outlined
							/>
						</View>
					</>
				)}

			</ScrollView>
		</View>
	)
}

const styles = StyleSheet.create({
	pinRow: {
		flexDirection: 'row',
		gap: 12,
	},
	pinInput: {
		flex: 1,
		height: 60,
		borderRadius: 12,
		textAlign: 'center',
	},
	timeoutGrid: {
		flexDirection: 'row',
		flexWrap: 'wrap',
		gap: 8,
	},
	timeoutChip: {
		paddingHorizontal: 16,
		paddingVertical: 10,
		borderRadius: 20,
		borderWidth: 1,
	},
})

export default AppLock
