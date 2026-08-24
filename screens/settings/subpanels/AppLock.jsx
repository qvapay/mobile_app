import { useState, useEffect, useRef, useReducer } from 'react'
import { View, Text, Alert } from 'react-native'
import { toast } from 'sonner-native'
import { useTranslation } from 'react-i18next'

import QPCodeInput from '../../../ui/particles/QPCodeInput'

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

const AppLock = () => {

	const { t } = useTranslation()
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
	const [biometrics, dispatchBiometrics] = useReducer(biometricsReducer, initialBiometrics)
	const { type: biometryType, available: biometricsAvailable } = biometrics

	// Refs imperativos a cada QPCodeInput ({ focus(index) }) para saltar entre filas
	const pinRef = useRef(null)
	const confirmPinRef = useRef(null)
	const oldPinRef = useRef(null)

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
	}

	// Handle enable app lock
	const handleEnable = async () => {
		if (pin.length !== 4) {
			toast.error(t('settings.appLock.toasts.enterPin4'))
			return
		}
		if (mode === 'setup') {
			setMode('confirm')
			setTimeout(() => confirmPinRef.current?.focus(0), 100)
			return
		}
		if (pin !== confirmPin) {
			toast.error(t('settings.appLock.toasts.pinMismatch'))
			setConfirmPin('')
			setTimeout(() => confirmPinRef.current?.focus(0), 100)
			return
		}
		setIsLoading(true)
		const result = await enableAppLock(pin)
		setIsLoading(false)
		if (result.success) {
			toast.success(t('settings.appLock.toasts.enabled'), { description: t('settings.appLock.protected') })
			resetForm()
		} else {
			toast.error(result.error)
		}
	}

	// Handle disable
	const handleDisable = () => {
		Alert.alert(
			t('settings.appLock.alerts.disableTitle'),
			t('settings.appLock.alerts.disableBody'),
			[
				{ text: t('common.actions.cancel'), style: 'cancel' },
				{
					text: t('settings.appLock.alerts.disableConfirm'),
					style: 'destructive',
					onPress: async () => {
						await disableAppLock()
						toast.success(t('settings.appLock.toasts.disabled'))
						resetForm()
					}
				}
			]
		)
	}

	// Handle change PIN
	const handleChangePin = async () => {
		if (oldPin.length !== 4 || pin.length !== 4 || confirmPin.length !== 4) {
			toast.error(t('settings.appLock.toasts.fillAllFields'))
			return
		}
		if (pin !== confirmPin) {
			toast.error(t('settings.appLock.toasts.newPinMismatch'))
			setConfirmPin('')
			setTimeout(() => confirmPinRef.current?.focus(0), 100)
			return
		}
		setIsLoading(true)
		const result = await changeAppLockPin(oldPin, pin)
		setIsLoading(false)
		if (result.success) {
			toast.success(t('settings.appLock.toasts.pinUpdated'))
			resetForm()
		} else {
			toast.error(result.error)
		}
	}

	// Render PIN input row — QPCodeInput (secure); al llenarse salta a la fila siguiente
	const renderPinRow = (label, value, setValue, ref, nextRef) => (
		<View style={{ marginTop: 16 }}>
			<Text style={[textStyles.h5, { color: theme.colors.secondaryText, marginBottom: 8 }]}>
				{label}
			</Text>
			<QPCodeInput
				ref={ref}
				length={4}
				code={value}
				onChangeCode={setValue}
				secure
				{...(nextRef && { onFilled: () => setTimeout(() => nextRef.current?.focus(0), 100) })}
			/>
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
					setTimeout(() => oldPinRef.current?.focus(0), 100)
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
				oldPinRow={renderPinRow(t('settings.appLock.labels.currentPin'), oldPin, setOldPin, oldPinRef, pinRef)}
				newPinRow={renderPinRow(t('settings.appLock.labels.newPin'), pin, setPin, pinRef, confirmPinRef)}
				confirmRow={renderPinRow(t('settings.appLock.labels.confirmNewPin'), confirmPin, setConfirmPin, confirmPinRef, null)}
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
			setupRow={renderPinRow(t('settings.appLock.labels.newPin'), pin, setPin, pinRef, null)}
			confirmRow={renderPinRow(t('settings.appLock.labels.confirmPin'), confirmPin, setConfirmPin, confirmPinRef, null)}
			onActivate={() => {
				setMode('setup')
				setTimeout(() => pinRef.current?.focus(0), 100)
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

export default AppLock
