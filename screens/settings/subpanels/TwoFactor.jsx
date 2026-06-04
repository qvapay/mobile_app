import { useState, useEffect, useReducer } from 'react'
import { StyleSheet, Text, View, Alert } from 'react-native'

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

// The 2FA setup flow (active + generated secret/url + entered code) is one unit
const initialSetup = { active: false, secret: '', otpauthUrl: '', code: '' }

function setupReducer(state, action) {
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
			toast.error('Error al cargar datos', { description: error.message })
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
				toast.success('Secreto generado', { description: 'Escanea el código QR con tu app de autenticación' })
			} else {
				toast.error('Error', { description: result.error || 'No se pudo generar el código 2FA' })
			}
		} catch (error) {
			toast.error('Error', { description: error.message })
		} finally {
			setIsLoading(false)
		}
	}

	// Activate 2FA
	const handleActivate2FA = async () => {
		if (!verificationCode || verificationCode.length !== 6) {
			toast.error('Error', { description: 'Ingresa un código de 6 dígitos' })
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

				toast.success('2FA Activado', { description: 'Tu cuenta ahora está protegida con autenticación de dos factores' })
			} else {
				toast.error('Código inválido', { description: result.error || 'El código ingresado no es válido' })
			}
		} catch (error) {
			toast.error('Error', { description: error.message })
		} finally {
			setIsLoading(false)
		}
	}

	// Deactivate 2FA
	const handleDeactivate2FA = async () => {
		Alert.alert(
			'Desactivar 2FA',
			'¿Estás seguro de que quieres desactivar la autenticación de dos factores? Tu cuenta será menos segura.',
			[
				{ text: 'Cancelar', style: 'cancel' },
				{
					text: 'Desactivar',
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

								toast.success('2FA Desactivado', { description: 'La autenticación de dos factores ha sido desactivada' })
							} else {
								toast.error('Error', { description: result.error || 'No se pudo desactivar el 2FA' })
							}
						} catch (error) {
							toast.error('Error', { description: error.message })
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
		toast.success('Copiado', { description: 'Secreto copiado al portapapeles' })
	}

	// Loading state
	if (isLoadingData) { return <QPLoader /> }

	// 2FA is enabled - show status
	if (is2FAEnabled && !isSettingUp) {
		return (
			<QPKeyboardView
				actions={
					<QPButton
						title="Desactivar 2FA"
						onPress={handleDeactivate2FA}
						loading={isLoading}
						disabled={isLoading}
						style={{ backgroundColor: theme.colors.danger }}
						textStyle={{ color: theme.colors.almostWhite }}
					/>
				}
			>

				<View style={styles.statusContainer}>
					<View style={[styles.statusIcon, { backgroundColor: theme.colors.success + '20' }]}>
						<FontAwesome6 name="shield-halved" size={48} color={theme.colors.success} iconStyle="solid" />
					</View>

					<Text style={[textStyles.h1, { color: theme.colors.success, marginTop: 20 }]}>
						2FA Activo
					</Text>

					<Text style={[textStyles.h3, { color: theme.colors.secondaryText, textAlign: 'center', marginTop: 10 }]}>
						Tu cuenta está protegida con autenticación de dos factores
					</Text>
				</View>

				<View style={[containerStyles.card, { marginTop: 30 }]}>
					<View style={styles.infoRow}>
						<FontAwesome6 name="circle-check" size={20} color={theme.colors.success} iconStyle="solid" />
						<Text style={[textStyles.body, { color: theme.colors.primaryText, marginLeft: 12, flex: 1 }]}>
							Cada vez que inicies sesión, necesitarás un código de tu app de autenticación
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
				onChangeCode={(text) => dispatchSetup({ type: 'setCode', code: text.replace(/[^0-9]/g, '').slice(0, 6) })}
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
					title="Configurar 2FA"
					onPress={handleGenerate2FA}
					loading={isLoading}
					disabled={isLoading}
					textStyle={{ color: theme.colors.almostWhite }}
				/>
			}
		>

			<Text style={textStyles.h1}>Autenticación de Dos Factores</Text>
			<Text style={[textStyles.h3, { color: theme.colors.secondaryText }]}>
				Añade una capa extra de seguridad a tu cuenta
			</Text>

			<View style={[styles.statusContainer, { marginTop: 30 }]}>
				<View style={[styles.statusIcon, { backgroundColor: theme.colors.warning + '20' }]}>
					<FontAwesome6 name="shield" size={48} color={theme.colors.warning} iconStyle="solid" />
				</View>

				<Text style={[textStyles.h2, { color: theme.colors.warning, marginTop: 20 }]}>
					2FA No Activo
				</Text>
			</View>

			<View style={[containerStyles.card, { marginTop: 30 }]}>
				<Text style={[textStyles.h4, { color: theme.colors.primaryText, marginBottom: 12 }]}>
					Beneficios del 2FA:
				</Text>

				<View style={styles.benefitRow}>
					<FontAwesome6 name="lock" size={16} color={theme.colors.primary} iconStyle="solid" />
					<Text style={[textStyles.body, { color: theme.colors.secondaryText, marginLeft: 12, flex: 1 }]}>
						Protege tu cuenta incluso si alguien conoce tu contraseña
					</Text>
				</View>

				<View style={styles.benefitRow}>
					<FontAwesome6 name="mobile-screen" size={16} color={theme.colors.primary} iconStyle="solid" />
					<Text style={[textStyles.body, { color: theme.colors.secondaryText, marginLeft: 12, flex: 1 }]}>
						Usa apps como Google Authenticator o Authy
					</Text>
				</View>

				<View style={styles.benefitRow}>
					<FontAwesome6 name="clock" size={16} color={theme.colors.primary} iconStyle="solid" />
					<Text style={[textStyles.body, { color: theme.colors.secondaryText, marginLeft: 12, flex: 1 }]}>
						Códigos que cambian cada 30 segundos
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
