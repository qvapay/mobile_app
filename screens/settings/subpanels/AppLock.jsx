import { useState, useEffect, useRef, useReducer } from 'react'
import { View, Text, TextInput, Alert, StyleSheet } from 'react-native'
import { toast } from 'sonner-native'

import { useTheme } from '../../../theme/ThemeContext'
import { createTextStyles, createContainerStyles } from '../../../theme/themeUtils'
import { useSettings } from '../../../settings/SettingsContext'
import { useAppLock } from '../../../lock/AppLockContext'
import { getSupportedBiometryType, hasBiometricCredentials } from '../../../api/client'

// lock subcomponents
import AppLockEnabledView from './applock/AppLockEnabledView'
import AppLockChangePinView from './applock/AppLockChangePinView'
import AppLockSetupView from './applock/AppLockSetupView'

// The three PIN fields form one logical unit
const initialForm = { pin: '', confirmPin: '', oldPin: '' }

function formReducer(state, action) {
	switch (action.type) {
		case 'set':
			return { ...state, [action.field]: action.value }
		case 'reset':
			return initialForm
		default:
			return state
	}
}

// Biometric type + availability are detected together
const initialBiometrics = { type: null, available: false }

function biometricsReducer(state, action) {
	switch (action.type) {
		case 'detected':
			return { type: action.biometryType, available: action.available }
		default:
			return state
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

const AppLock = () => {

	const { theme } = useTheme()
	const textStyles = createTextStyles(theme)
	const containerStyles = createContainerStyles(theme)
	const { security } = useSettings()
	const { appLockEnabled, enableAppLock, disableAppLock, changeAppLockPin, updateAutoLockTimeout } = useAppLock()

	// Setup flow states
	const [mode, setMode] = useState('info') // info | setup | confirm | changePin
	const [form, dispatchForm] = useReducer(formReducer, initialForm)
	const { pin, confirmPin, oldPin } = form
	// Same-named setters keep every call site (renderPinRow, resetForm, handlers) unchanged
	const setPin = (value) => dispatchForm({ type: 'set', field: 'pin', value })
	const setConfirmPin = (value) => dispatchForm({ type: 'set', field: 'confirmPin', value })
	const setOldPin = (value) => dispatchForm({ type: 'set', field: 'oldPin', value })
	const [isLoading, setIsLoading] = useState(false)
	const [focusedField, setFocusedField] = useState(null)
	const [focusedIndex, setFocusedIndex] = useState(null)
	const [biometrics, dispatchBiometrics] = useReducer(biometricsReducer, initialBiometrics)
	const { type: biometryType, available: biometricsAvailable } = biometrics

	const pinRefs = useRef([])
	const confirmPinRefs = useRef([])
	const oldPinRefs = useRef([])

	useEffect(() => {
		const checkBiometrics = async () => {
			const type = await getSupportedBiometryType()
			const hasCredentials = await hasBiometricCredentials()
			dispatchBiometrics({ type: 'detected', biometryType: type, available: !!type && hasCredentials })
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
			toast.error('Ingresa un PIN de 4 dígitos')
			return
		}
		if (mode === 'setup') {
			setMode('confirm')
			setTimeout(() => confirmPinRefs.current[0]?.focus(), 100)
			return
		}
		if (pin !== confirmPin) {
			toast.error('Los PIN no coinciden')
			setConfirmPin('')
			setTimeout(() => confirmPinRefs.current[0]?.focus(), 100)
			return
		}
		setIsLoading(true)
		const result = await enableAppLock(pin)
		setIsLoading(false)
		if (result.success) {
			toast.success('Bloqueo activado', { description: 'Tu app está protegida' })
			resetForm()
		} else {
			toast.error(result.error)
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
						toast.success('Bloqueo desactivado')
						resetForm()
					}
				}
			]
		)
	}

	// Handle change PIN
	const handleChangePin = async () => {
		if (oldPin.length !== 4 || pin.length !== 4 || confirmPin.length !== 4) {
			toast.error('Completa todos los campos')
			return
		}
		if (pin !== confirmPin) {
			toast.error('Los PIN nuevos no coinciden')
			setConfirmPin('')
			setTimeout(() => confirmPinRefs.current[0]?.focus(), 100)
			return
		}
		setIsLoading(true)
		const result = await changeAppLockPin(oldPin, pin)
		setIsLoading(false)
		if (result.success) {
			toast.success('PIN actualizado')
			resetForm()
		} else {
			toast.error(result.error)
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
						ref={(ref) => { refs.current[index] = ref }}
						style={[styles.pinInput, {
							backgroundColor: theme.colors.surface,
							color: theme.colors.primaryText,
							borderColor: focusedField === fieldName && focusedIndex === index
								? theme.colors.primary : theme.colors.surface,
							borderWidth: 1.5, fontSize: theme.typography.fontSize.xxl, fontFamily: theme.typography.fontFamily.semiBold,
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
			<AppLockEnabledView
				security={security}
				biometricsAvailable={biometricsAvailable}
				biometryType={biometryType}
				onTimeoutSelect={updateAutoLockTimeout}
				onChangePin={() => {
					setMode('changePin')
					setTimeout(() => oldPinRefs.current[0]?.focus(), 100)
				}}
				onDisable={handleDisable}
				theme={theme}
				textStyles={textStyles}
				containerStyles={containerStyles}
			/>
		)
	}

	// Change PIN view
	if (mode === 'changePin') {
		return (
			<AppLockChangePinView
				oldPinRow={renderPinRow('PIN actual', oldPin, setOldPin, oldPinRefs, 'old', pinRefs)}
				newPinRow={renderPinRow('Nuevo PIN', pin, setPin, pinRefs, 'new', confirmPinRefs)}
				confirmRow={renderPinRow('Confirmar nuevo PIN', confirmPin, setConfirmPin, confirmPinRefs, 'confirm', null)}
				onSubmit={handleChangePin}
				onCancel={resetForm}
				isLoading={isLoading}
				disabled={oldPin.length !== 4 || pin.length !== 4 || confirmPin.length !== 4}
				theme={theme}
				textStyles={textStyles}
				containerStyles={containerStyles}
			/>
		)
	}

	// Setup / Disabled view (info | setup | confirm)
	return (
		<AppLockSetupView
			mode={mode}
			security={security}
			setupRow={renderPinRow('Nuevo PIN', pin, setPin, pinRefs, 'new', null)}
			confirmRow={renderPinRow('Confirmar PIN', confirmPin, setConfirmPin, confirmPinRefs, 'confirm', null)}
			onActivate={() => {
				setMode('setup')
				setTimeout(() => pinRefs.current[0]?.focus(), 100)
			}}
			onSubmit={handleEnable}
			onCancel={resetForm}
			isLoading={isLoading}
			pinComplete={pin.length === 4}
			confirmComplete={confirmPin.length === 4}
			theme={theme}
			textStyles={textStyles}
			containerStyles={containerStyles}
		/>
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
})

export default AppLock
