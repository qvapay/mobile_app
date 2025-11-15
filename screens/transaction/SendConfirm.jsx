import { useState, useEffect } from 'react'
import { View, Text, ScrollView, TouchableOpacity, Alert } from 'react-native'

// Context and Theme
import { useAuth } from '../../auth/AuthContext'
import { useTheme } from '../../theme/ThemeContext'
import { createTextStyles, createContainerStyles } from '../../theme/themeUtils'

// UI Particles
import QPButton from '../../ui/particles/QPButton'
import QPLoader from '../../ui/particles/QPLoader'
import ProfileContainerHorizontal from '../../ui/ProfileContainerHorizontal'

// API
import { userApi } from '../../api/userApi'
import { transferApi } from '../../api/transferApi'

// Routes
import { ROUTES } from '../../routes'

// Toast
import Toast from 'react-native-toast-message'

// Icons
import FontAwesome6 from '@react-native-vector-icons/fontawesome6'

// Confirm Screen for Send instructions
// Shows transaction details and allows user to confirm before sending
const SendConfirm = ({ navigation, route }) => {

	// Contexts
	const { user } = useAuth()
	const { theme } = useTheme()
	const textStyles = createTextStyles(theme)
	const containerStyles = createContainerStyles(theme)

	// Params from route
	const { send_amount, user_uuid, description = '' } = route.params || {}

	// States
	const [recipientUser, setRecipientUser] = useState(null)
	const [isLoading, setIsLoading] = useState(false)
	const [isLoadingUser, setIsLoadingUser] = useState(true)

	// Fetch recipient user data

	// TODO: Some day, you will have a DeepLink and this will be useful
	useEffect(() => {

		const fetchRecipientUser = async () => {
			if (!user_uuid) {
				setIsLoadingUser(false)
				return
			}
			try {
				setIsLoadingUser(true)
				const result = await userApi.searchUser(user_uuid)
				if (result.success && result.data.length > 0) {
					setRecipientUser(result.data[0])
				} else {
					Toast.show({ type: 'error', text1: 'Error', text2: 'No se pudo encontrar el usuario destinatario' })
					navigation.goBack()
				}
			} catch (error) {
				Toast.show({ type: 'error', text1: 'Error', text2: 'Error al cargar los datos del destinatario' })
				navigation.goBack()
			} finally { setIsLoadingUser(false) }
		}
		fetchRecipientUser()
	}, [user_uuid, navigation])

	// Execute the actual transaction
	const executeTransaction = async () => {

		try {
			setIsLoading(true)
			const result = await transferApi.transferMoney({
				amount: send_amount,
				description: description,
				to: recipientUser.uuid,
				pin: user.pin
			})

			if (result.success) {
				navigation.navigate(ROUTES.SEND_SUCCESS, { amount: send_amount, recipient: recipientUser, description: description })
			} else {
				Toast.show({ type: 'error', text1: 'Error en la transacción', text2: result.error || 'No se pudo completar la transacción' })
			}
		} catch (error) {
			Toast.show({ type: 'error', text1: 'Error', text2: error.message || 'Error inesperado al procesar la transacción' })
		} finally { setIsLoading(false) }
	}

	// Show loading while fetching user data
	if (isLoadingUser) {
		return (
			<View style={[containerStyles.subContainer, { justifyContent: 'center', alignItems: 'center' }]}>
				<QPLoader />
			</View>
		)
	}

	// Show error if no recipient user found
	if (!recipientUser) {
		return (
			<View style={[containerStyles.subContainer, { justifyContent: 'center', alignItems: 'center' }]}>
				<FontAwesome6 name="user-slash" size={64} color={theme.colors.tertiaryText} iconStyle="solid" />
				<Text style={[textStyles.h4, { color: theme.colors.primaryText, marginTop: 20, textAlign: 'center' }]}>
					Usuario no encontrado
				</Text>
				<Text style={[textStyles.h6, { color: theme.colors.secondaryText, marginTop: 10, textAlign: 'center' }]}>
					No se pudo encontrar el usuario destinatario
				</Text>
				<QPButton
					title="Volver"
					onPress={() => navigation.goBack()}
					style={{ marginTop: 30, width: '80%' }}
					textStyle={{ color: theme.colors.buttonText }}
				/>
			</View>
		)
	}

	return (
		<View style={[containerStyles.subContainer, { justifyContent: 'space-between' }]}>

			<ScrollView style={{ flex: 1, gap: 10, paddingTop: 10 }} showsVerticalScrollIndicator={false}>

				{/* Amount Card */}
				<View style={containerStyles.card}>
					<View style={{ alignItems: 'center' }}>
						<Text style={[textStyles.h6, { color: theme.colors.secondaryText, marginBottom: 8 }]}>
							Monto a enviar
						</Text>
						<Text style={textStyles.amount}>
							${send_amount}
						</Text>
						<Text style={[textStyles.h6, { color: theme.colors.primary, marginTop: 4 }]}>
							QUSD
						</Text>
					</View>
				</View>

				{/* Recipient Card */}
				<View style={containerStyles.card}>
					<Text style={[textStyles.h6, { color: theme.colors.secondaryText, marginBottom: 15 }]}>
						Destinatario
					</Text>

					<View style={{ flexDirection: 'row', alignItems: 'center', gap: 15 }}>
						<ProfileContainerHorizontal user={recipientUser} />
					</View>
				</View>

				{/* Message Card */}
				{description && (
					<View style={containerStyles.card}>
						<Text style={[textStyles.h6, { color: theme.colors.secondaryText, marginBottom: 10 }]}>
							Mensaje
						</Text>
						<Text style={[textStyles.h6, { color: theme.colors.primaryText, lineHeight: 20 }]}>
							"{description}"
						</Text>
					</View>
				)}

				{/* Transaction Details */}
				<View style={containerStyles.card}>
					<Text style={[textStyles.h6, { color: theme.colors.secondaryText, marginBottom: 15 }]}>
						Detalles de la transacción
					</Text>

					<View style={{ gap: 12 }}>
						<View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
							<Text style={[textStyles.h6, { color: theme.colors.secondaryText }]}>
								Comisión
							</Text>
							<Text style={[textStyles.h6, { color: theme.colors.primaryText }]}>
								$0.00 QUSD
							</Text>
						</View>

						<View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
							<Text style={[textStyles.h6, { color: theme.colors.secondaryText }]}>
								Total a enviar
							</Text>
							<Text style={[textStyles.h5, { color: theme.colors.primaryText, fontWeight: '600' }]}>
								${send_amount} QUSD
							</Text>
						</View>
					</View>
				</View>

				{/* Security Notice */}
				<View style={{
					backgroundColor: theme.colors.elevation,
					borderRadius: 12,
					padding: 16,
					marginTop: 10,
					borderLeftWidth: 4,
					borderLeftColor: theme.colors.primary
				}}>
					<View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
						<FontAwesome6 name="shield-halved" size={20} color={theme.colors.primary} iconStyle="solid" />
						<Text style={[textStyles.h6, { color: theme.colors.primaryText, flex: 1 }]}>
							Esta transacción es segura y será procesada inmediatamente
						</Text>
					</View>
				</View>

				{/* Action Buttons */}
				<View style={[containerStyles.bottomButtonContainer, { marginTop: 10 }]}>
					<QPButton
						title="Confirmar Envío"
						onPress={executeTransaction}
						loading={isLoading}
						disabled={isLoading}
						textStyle={{ color: theme.colors.buttonText }}
					/>

					<QPButton
						title="Cancelar"
						onPress={() => navigation.goBack()}
						disabled={isLoading}
						style={{ backgroundColor: theme.colors.danger }}
						textStyle={{ color: theme.colors.primaryText }}
					/>
				</View>

			</ScrollView>

		</View>
	)
}

export default SendConfirm