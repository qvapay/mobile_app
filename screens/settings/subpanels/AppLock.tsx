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

// Tipos
import type { RefObject, ReactNode } from 'react'
import type { QPCodeInputHandle } from '../../../ui/particles/QPCodeInput'

/** Paso del flujo: información, alta de PIN, confirmación o cambio. */
type AppLockMode = 'info' | 'setup' | 'confirm' | 'changePin'

/** Los tres campos de PIN como una unidad. */
type PinForm = { pin: string, confirmPin: string, oldPin: string }

type PinFormAction =
	| { type: 'set', field: keyof PinForm, value: string }
	| { type: 'reset' }

/** `type` se mantiene como string plano: el enum BIOMETRY_TYPE del keychain se compara contra literales. */
type BiometricsState = { type: string | null, available: boolean }

type BiometricsAction =
	| { type: 'detected', biometryType: string | null, available: boolean }

// The three PIN fields form one logical unit
const initialForm: PinForm = { pin: '', confirmPin: '', oldPin: '' }

function formReducer(state: PinForm, action: PinFormAction): PinForm {
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
const initialBiometrics: BiometricsState = { type: null, available: false }

function biometricsReducer(state: BiometricsState, action: BiometricsAction): BiometricsState {
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
	const [mode, setMode] = useState<AppLockMode>('info') // info | setup | confirm | changePin
	const [form, dispatchForm] = useReducer(formReducer, initialForm)
	const { pin, confirmPin, oldPin } = form
	// Same-named setters keep every call site (renderPinRow, resetForm, handlers) unchanged
	const setPin = (value: string) => dispatchForm({ type: 'set', field: 'pin', value })
	const setConfirmPin = (value: string) => dispatchForm({ type: 'set', field: 'confirmPin', value })
	const setOldPin = (value: string) => dispatchForm({ type: 'set', field: 'oldPin', value })
	const [isLoading, setIsLoading] = useState(false)
	const [biometrics, dispatchBiometrics] = useReducer(biometricsReducer, initialBiometrics)
	const { type: biometryType, available: biometricsAvailable } = biometrics

	// Refs imperativos a cada QPCodeInput ({ focus(index) }) para saltar entre filas
	const pinRef = useRef<QPCodeInputHandle | null>(null)
	const confirmPinRef = useRef<QPCodeInputHandle | null>(null)
	const oldPinRef = useRef<QPCodeInputHandle | null>(null)

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
			// AppLockResult declara `error?: string`; en la rama de fallo siempre viene.
			toast.error(result.error as string)
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
			// AppLockResult declara `error?: string`; en la rama de fallo siempre viene.
			toast.error(result.error as string)
		}
	}

	// Render PIN input row — QPCodeInput (secure); al llenarse salta a la fila siguiente
	const renderPinRow = (
		label: string,
		value: string,
		setValue: (value: string) => void,
		ref: RefObject<QPCodeInputHandle | null>,
		nextRef: RefObject<QPCodeInputHandle | null> | null,
	): ReactNode => (
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
