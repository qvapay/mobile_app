import { useState, useEffect } from 'react'
import { View, Text, StyleSheet, ScrollView, Alert } from 'react-native'

// Theme Context
import { useTheme } from '../../theme/ThemeContext'
import { createContainerStyles, createTextStyles } from '../../theme/themeUtils'

// UI Particles
import QPInput from '../../ui/particles/QPInput'
import QPButton from '../../ui/particles/QPButton'
import QPLoader from '../../ui/particles/QPLoader'
import QPProduct from '../../ui/particles/QPProduct'

// User Context
import { useAuth } from '../../auth/AuthContext'

// API
import { storeApi } from '../../api/storeApi'

// Toast
import Toast from 'react-native-toast-message'

// Icons
import FontAwesome6 from '@react-native-vector-icons/fontawesome6'

// PhoneTopupPurchase component
const PhoneTopupPurchase = ({ navigation, route }) => {

	// Contexts
	const { user } = useAuth()
	const { theme } = useTheme()
	const containerStyles = createContainerStyles(theme)
	const textStyles = createTextStyles(theme)

	// Get package from route params
	const { package: packageItem } = route.params || {}

	// States
	const [phoneNumber, setPhoneNumber] = useState('')
	const [isLoading, setIsLoading] = useState(false)
	const [isPurchasing, setIsPurchasing] = useState(false)

	// Validate phone number format
	const validatePhoneNumber = (number) => {
		// Remove any non-digit characters for validation
		const cleaned = number.replace(/\D/g, '')
		// Basic validation: should have at least 7 digits
		return cleaned.length >= 7 && cleaned.length <= 15
	}

	// Check if purchase button should be enabled
	const isPurchaseEnabled = () => { return phoneNumber.trim().length > 0 && validatePhoneNumber(phoneNumber) && !isPurchasing }

	// Handle purchase
	const handlePurchase = async () => {

		if (!packageItem || !packageItem.id) {
			Toast.show({ type: 'error', text1: 'Error', text2: 'Paquete no válido' })
			return
		}

		if (!validatePhoneNumber(phoneNumber)) {
			Toast.show({ type: 'error', text1: 'Error', text2: 'Por favor ingresa un número de teléfono válido' })
			return
		}

		// Confirm purchase
		Alert.alert(
			'Confirmar compra',
			`¿Estás seguro de que deseas comprar ${packageItem.name} por $${packageItem.price} para el número ${phoneNumber}?`,
			[
				{
					text: 'Cancelar',
					style: 'cancel',
				},
				{
					text: 'Confirmar',
					onPress: async () => {
						setIsPurchasing(true)
						try {
							const response = await storeApi.purchasePhonePackage({
								phone_package_id: packageItem.id,
								phone_number: phoneNumber.trim(),
							})

							if (response.success) {
								Toast.show({ type: 'success', text1: '¡Compra exitosa!', text2: 'La recarga se ha procesado correctamente' })
								// Navigate back after a short delay
								setTimeout(() => {
									navigation.goBack()
								}, 1500)
							}
							else { Toast.show({ type: 'error', text1: 'Error', text2: response.error || 'No se pudo realizar la compra' }) }
						} catch (error) {
							console.error('Error purchasing phone package:', error)
							Toast.show({ type: 'error', text1: 'Error', text2: error.message || 'Ha ocurrido un error al procesar la compra' })
						} finally { setIsPurchasing(false) }
					},
				},
			]
		)
	}

	// If no package, show error
	if (!packageItem) {
		return (
			<View style={[containerStyles.subContainer, styles.errorContainer]}>
				<FontAwesome6 name="triangle-exclamation" size={48} color={theme.colors.danger} iconStyle="solid" />
				<Text style={[textStyles.h5, { color: theme.colors.danger, marginTop: 16, textAlign: 'center' }]}>
					Paquete no encontrado
				</Text>
				<QPButton title="Volver" onPress={() => navigation.goBack()} style={{ marginTop: 20 }} />
			</View>
		)
	}

	return (
		<View style={[containerStyles.subContainer, { justifyContent: 'space-between' }]}>
			<ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
				{/* Package Details Card */}
				<View style={styles.packageContainer}>
					<QPProduct
						name={packageItem.name || 'Recarga telefónica'}
						price={packageItem.price}
						details={packageItem.details || [
							packageItem.operator,
							packageItem.country,
							packageItem.amount ? `${packageItem.amount} ${packageItem.currency || 'QUSD'}` : null,
						].filter(Boolean)}
						logo={packageItem.logo}
						image={packageItem.image}
						onPress={() => { }} // Disabled in purchase screen
						style={styles.packageCard}
					/>
				</View>

				{/* Phone Number Input */}
				<View style={styles.inputSection}>
					<Text style={[textStyles.h5, { color: theme.colors.primaryText, marginBottom: 12 }]}>
						Número de teléfono
					</Text>
					<QPInput
						value={phoneNumber}
						onChangeText={setPhoneNumber}
						placeholder="Ingresa el número de teléfono"
						prefixIconName="phone"
						keyboardType="phone-pad"
						autoFocus={true}
						style={styles.phoneInput}
					/>
					{phoneNumber.trim().length > 0 && !validatePhoneNumber(phoneNumber) && (
						<Text style={[textStyles.caption, { color: theme.colors.danger, marginTop: 8 }]}>
							Por favor ingresa un número de teléfono válido
						</Text>
					)}
				</View>

				{/* Balance Info */}
				{user?.balance && (
					<View style={[styles.balanceInfo, { backgroundColor: theme.colors.elevation }]}>
						<Text style={[textStyles.h6, { color: theme.colors.secondaryText }]}>Balance disponible:</Text>
						<Text style={[textStyles.h5, { color: theme.colors.primary, fontWeight: '600' }]}>
							${parseFloat(user.balance).toFixed(2)} QUSD
						</Text>
					</View>
				)}
			</ScrollView>

			{/* Purchase Button */}
			<View style={containerStyles.bottomButtonContainer}>
				<QPButton
					title={isPurchasing ? 'Procesando...' : `Comprar por $${packageItem.price || '0.00'}`}
					onPress={handlePurchase}
					disabled={!isPurchaseEnabled()}
					loading={isPurchasing}
					textStyle={{ color: theme.colors.buttonText }}
				/>
			</View>
		</View>
	)
}

const styles = StyleSheet.create({
	scrollView: {
		flex: 1,
	},
	errorContainer: {
		justifyContent: 'center',
		alignItems: 'center',
		padding: 20,
	},
	packageContainer: {
		alignItems: 'center',
		marginBottom: 24,
	},
	packageCard: {
		width: '100%',
		marginRight: 0,
		imagePlaceholder: {
			height: 160,
		}
	},
	inputSection: {
		marginBottom: 24,
	},
	phoneInput: {
		fontSize: 16,
	},
	balanceInfo: {
		flexDirection: 'row',
		justifyContent: 'space-between',
		alignItems: 'center',
		padding: 16,
		borderRadius: 12,
		marginBottom: 20,
	},
})

export default PhoneTopupPurchase

