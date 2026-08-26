import { useState, useEffect, useReducer } from 'react'
import { StyleSheet, Text, View, Alert } from 'react-native'
import { useTranslation } from 'react-i18next'
import i18n from '../../../i18n'

// Theme
import { useTheme } from '../../../theme/ThemeContext'
import { createTextStyles, createContainerStyles } from '../../../theme/themeUtils'

// UI Particles
import QPButton from '../../../ui/particles/QPButton'
import QPLoader from '../../../ui/particles/QPLoader'
import QPKeyboardView from '../../../ui/QPKeyboardView'
import TwoFactorSetupView from './TwoFactorSetupView'

// API
import { userApi } from '../../../api/userApi'

// Notifications
import { toast } from 'sonner-native'

// User AuthContext
import { useAuth } from '../../../auth/AuthContext'

// Clipboard
import { copyTextToClipboard } from '../../../helpers'

// Icons
import FontAwesome6 from '@react-native-vector-icons/fontawesome6'

// Tipos
/** Flujo de alta de 2FA: activo + secreto/URL generados + código tecleado. */
type TwoFactorSetup = { active: boolean, secret: string, otpauthUrl: string, code: string }

type TwoFactorSetupAction =
	| { type: 'started', secret: string, otpauthUrl: string }
	| { type: 'setCode', code: string }
	| { type: 'reset' }

// The 2FA setup flow (active + generated secret/url + entered code) is one unit
const initialSetup: TwoFactorSetup = { active: false, secret: '', otpauthUrl: '', code: '' }

function setupReducer(state: TwoFactorSetup, action: TwoFactorSetupAction): TwoFactorSetup {
	switch (action.type) {
		case 'started':
			return { active: true, secret: action.secret, otpauthUrl: action.otpauthUrl, code: '' }
		case 'setCode':
			return { ...state, code: action.code }
		case 'reset':
			return initialSetup
		default:
			return state
	}
}

// Two Factor Component
const TwoFactor = () => {

	// Contexts
	const { t } = useTranslation()
	const { updateUser } = useAuth()
	const { theme } = useTheme()
	const textStyles = createTextStyles(theme)
	const containerStyles = createContainerStyles(theme)
	// States
	const [isLoading, setIsLoading] = useState(false)
	const [isLoadingData, setIsLoadingData] = useState(true)
	const [is2FAEnabled, setIs2FAEnabled] = useState(false)

	// Setup flow state
	const [setup, dispatchSetup] = useReducer(setupReducer, initialSetup)
	const { active: isSettingUp, secret, otpauthUrl, code: verificationCode } = setup

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
				// Check if 2FA is enabled (two_factor_secret is '***' if enabled)
				setIs2FAEnabled(result.data.two_factor_secret === '***')
			}
		} catch (error) {
			// i18n.t en call-time: mantiene loadUserData estable para exhaustive-deps
			// (la t del hook la volvería reactiva y exigiría relanzar el efecto de montaje)
			toast.error(i18n.t('settings.twoFactor.toasts.loadFailed'), { description: (error as Error).message })
		} finally {
			setIsLoadingData(false)
		}
	}

	// Generate 2FA secret
	const handleGenerate2FA = async () => {
		try {
			setIsLoading(true)
			const result = await userApi.generate2FA()

			if (result.success && result.data) {
				dispatchSetup({ type: 'started', secret: result.data.secret, otpauthUrl: result.data.otpauth_url })
				toast.success(t('settings.twoFactor.toasts.secretGenerated'), { description: t('settings.twoFactor.toasts.secretGeneratedDescription') })
			} else {
				// La guarda de arriba mezcla `success` y `data`, así que aquí TS no estrecha a ApiFailure.
				toast.error(t('settings.twoFactor.toasts.errorTitle'), { description: (result as { error?: string }).error || t('settings.twoFactor.toasts.generateFailed') })
			}
		} catch (error) {
			toast.error(t('settings.twoFactor.toasts.errorTitle'), { description: (error as Error).message })
		} finally {
			setIsLoading(false)
		}
	}

	// Activate 2FA
	const handleActivate2FA = async () => {
		if (!verificationCode || verificationCode.length !== 6) {
			toast.error(t('settings.twoFactor.toasts.errorTitle'), { description: t('settings.twoFactor.toasts.enterCode6') })
			return
		}

		try {
			setIsLoading(true)
			const result = await userApi.activate2FA({ code: verificationCode, secret })

			if (result.success) {
				setIs2FAEnabled(true)
				dispatchSetup({ type: 'reset' })

				// Update user context
				if (updateUser) {
					updateUser({ two_factor_secret: '***' })
				}

				toast.success(t('settings.twoFactor.toasts.activated'), { description: t('settings.twoFactor.toasts.activatedDescription') })
			} else {
				toast.error(t('settings.twoFactor.toasts.invalidCode'), { description: result.error || t('settings.twoFactor.toasts.invalidCodeDescription') })
			}
		} catch (error) {
			toast.error(t('settings.twoFactor.toasts.errorTitle'), { description: (error as Error).message })
		} finally {
			setIsLoading(false)
		}
	}

	// Deactivate 2FA
	const handleDeactivate2FA = async () => {
		Alert.alert(
			t('settings.twoFactor.alerts.deactivateTitle'),
			t('settings.twoFactor.alerts.deactivateBody'),
			[
				{ text: t('common.actions.cancel'), style: 'cancel' },
				{
					text: t('settings.twoFactor.alerts.deactivateConfirm'),
					style: 'destructive',
					onPress: async () => {
						try {
							setIsLoading(true)
							const result = await userApi.deactivate2FA()

							if (result.success) {
								setIs2FAEnabled(false)

								// Update user context
								if (updateUser) {
									updateUser({ two_factor_secret: null })
								}

								toast.success(t('settings.twoFactor.toasts.deactivated'), { description: t('settings.twoFactor.toasts.deactivatedDescription') })
							} else {
								toast.error(t('settings.twoFactor.toasts.errorTitle'), { description: result.error || t('settings.twoFactor.toasts.deactivateFailed') })
							}
						} catch (error) {
							toast.error(t('settings.twoFactor.toasts.errorTitle'), { description: (error as Error).message })
						} finally {
							setIsLoading(false)
						}
					}
				}
			]
		)
	}

	// Cancel setup
	const handleCancelSetup = () => { dispatchSetup({ type: 'reset' }) }

	// Copy secret to clipboard
	const handleCopySecret = () => {
		copyTextToClipboard(secret)
		toast.success(t('settings.twoFactor.toasts.copiedTitle'), { description: t('settings.twoFactor.toasts.copiedDescription') })
	}

	// Loading state
	if (isLoadingData) { return <QPLoader /> }

	// 2FA is enabled - show status
	if (is2FAEnabled && !isSettingUp) {
		return (
			<QPKeyboardView
				actions={
					<QPButton
						title={t('settings.twoFactor.deactivateButton')}
						onPress={handleDeactivate2FA}
						loading={isLoading}
						disabled={isLoading}
						style={{ backgroundColor: theme.colors.danger }}
						textStyle={{ color: theme.colors.almostWhite }}
					/>
				}
			>

				<View style={styles.statusContainer}>
					<View style={[styles.statusIcon, { backgroundColor: theme.colors.successFill + '20' }]}>
						<FontAwesome6 name="shield-halved" size={48} color={theme.colors.successText} iconStyle="solid" />
					</View>

					<Text style={[textStyles.h1, { color: theme.colors.successText, marginTop: 20 }]}>
						{t('settings.twoFactor.enabled.title')}
					</Text>

					<Text style={[textStyles.h3, { color: theme.colors.secondaryText, textAlign: 'center', marginTop: 10 }]}>
						{t('settings.twoFactor.enabled.subtitle')}
					</Text>
				</View>

				<View style={[containerStyles.card, { marginTop: 30 }]}>
					<View style={styles.infoRow}>
						<FontAwesome6 name="circle-check" size={20} color={theme.colors.successText} iconStyle="solid" />
						<Text style={[textStyles.body, { color: theme.colors.primaryText, marginLeft: 12, flex: 1 }]}>
							{t('settings.twoFactor.enabled.info')}
						</Text>
					</View>
				</View>

			</QPKeyboardView>
		)
	}

	// Setting up 2FA - show QR code
	if (isSettingUp) {
		return (
			<TwoFactorSetupView
				otpauthUrl={otpauthUrl}
				secret={secret}
				verificationCode={verificationCode}
				onChangeCode={(text: string) => dispatchSetup({ type: 'setCode', code: text.replace(/[^0-9]/g, '').slice(0, 6) })}
				onActivate={handleActivate2FA}
				onCancel={handleCancelSetup}
				onCopySecret={handleCopySecret}
				isLoading={isLoading}
				theme={theme}
				textStyles={textStyles}
				containerStyles={containerStyles}
			/>
		)
	}

	// 2FA not enabled - show setup option
	return (
		<QPKeyboardView
			actions={
				<QPButton
					title={t('settings.twoFactor.setupButton')}
					onPress={handleGenerate2FA}
					loading={isLoading}
					disabled={isLoading}
					textStyle={{ color: theme.colors.almostWhite }}
				/>
			}
		>

			<Text style={textStyles.h1}>{t('settings.twoFactor.title')}</Text>
			<Text style={[textStyles.h3, { color: theme.colors.secondaryText }]}>
				{t('settings.twoFactor.subtitle')}
			</Text>

			<View style={[styles.statusContainer, { marginTop: 30 }]}>
				<View style={[styles.statusIcon, { backgroundColor: theme.colors.warning + '20' }]}>
					<FontAwesome6 name="shield" size={48} color={theme.colors.warning} iconStyle="solid" />
				</View>

				<Text style={[textStyles.h2, { color: theme.colors.warning, marginTop: 20 }]}>
					{t('settings.twoFactor.notEnabled.status')}
				</Text>
			</View>

			<View style={[containerStyles.card, { marginTop: 30 }]}>
				<Text style={[textStyles.h4, { color: theme.colors.primaryText, marginBottom: 12 }]}>
					{t('settings.twoFactor.notEnabled.benefitsTitle')}
				</Text>

				<View style={styles.benefitRow}>
					<FontAwesome6 name="lock" size={16} color={theme.colors.primary} iconStyle="solid" />
					<Text style={[textStyles.body, { color: theme.colors.secondaryText, marginLeft: 12, flex: 1 }]}>
						{t('settings.twoFactor.notEnabled.benefit1')}
					</Text>
				</View>

				<View style={styles.benefitRow}>
					<FontAwesome6 name="mobile-screen" size={16} color={theme.colors.primary} iconStyle="solid" />
					<Text style={[textStyles.body, { color: theme.colors.secondaryText, marginLeft: 12, flex: 1 }]}>
						{t('settings.twoFactor.notEnabled.benefit2')}
					</Text>
				</View>

				<View style={styles.benefitRow}>
					<FontAwesome6 name="clock" size={16} color={theme.colors.primary} iconStyle="solid" />
					<Text style={[textStyles.body, { color: theme.colors.secondaryText, marginLeft: 12, flex: 1 }]}>
						{t('settings.twoFactor.notEnabled.benefit3')}
					</Text>
				</View>
			</View>

		</QPKeyboardView>
	)
}

const styles = StyleSheet.create({
	statusContainer: {
		alignItems: 'center',
		paddingVertical: 30
	},
	statusIcon: {
		width: 100,
		height: 100,
		borderRadius: 50,
		alignItems: 'center',
		justifyContent: 'center'
	},
	infoRow: {
		flexDirection: 'row',
		alignItems: 'center'
	},
	benefitRow: {
		flexDirection: 'row',
		alignItems: 'flex-start',
		marginBottom: 12
	}
})

export default TwoFactor
