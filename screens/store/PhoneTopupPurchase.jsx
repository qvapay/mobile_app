import { useState } from 'react'
import { View, Text, StyleSheet, ScrollView, Alert } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

// Theme Context
import { useTheme } from '../../theme/ThemeContext'
import { createContainerStyles, createTextStyles } from '../../theme/themeUtils'

// UI Particles
import QPButton from '../../ui/particles/QPButton'
import QPProduct from '../../ui/particles/QPProduct'

// Phone Input
import PhoneInput, { isValidPhoneNumber } from 'react-native-international-phone-number'

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
	const insets = useSafeAreaInsets()

	// Get package from route params
	const { package: packageItem } = route.params || {}

	// States
	const [phoneNumber, setPhoneNumber] = useState('')
	const [selectedCountry, setSelectedCountry] = useState(null)
	const [isPurchasing, setIsPurchasing] = useState(false)

	// Build full phone number with country calling code
	const fullPhoneNumber = selectedCountry ? `${selectedCountry.callingCode}${phoneNumber.replace(/\D/g, '')}` : phoneNumber

	// Validate using libphonenumber-js via the package
	const isPhoneValid = selectedCountry && phoneNumber.trim().length > 0 && isValidPhoneNumber(phoneNumber, selectedCountry)

	// Check if purchase button should be enabled
	const isPurchaseEnabled = () => isPhoneValid && !isPurchasing

	// Handle purchase
	const handlePurchase = async () => {

		if (!packageItem || !packageItem.id) {
			Toast.show({ type: 'error', text1: 'Error', text2: 'Paquete no válido' })
			return
		}

		if (!isPhoneValid) {
			Toast.show({ type: 'error', text1: 'Error', text2: 'Por favor ingresa un número de teléfono válido' })
			return
		}

		// Confirm purchase
		Alert.alert(
			'Confirmar compra',
			`¿Estás seguro de que deseas comprar ${packageItem.name} por $${packageItem.price} para el número ${fullPhoneNumber}?`,
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
								phone_number: fullPhoneNumber,
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
					<PhoneInput
						value={phoneNumber}
						onChangePhoneNumber={setPhoneNumber}
						selectedCountry={selectedCountry}
						onChangeSelectedCountry={setSelectedCountry}
						defaultCountry="CU"
						placeholder="Número de teléfono"
						language="es"
						theme={theme.mode === 'light' ? 'light' : 'dark'}
						phoneInputStyles={{
							container: { backgroundColor: theme.colors.surface, borderColor: theme.colors.border, borderWidth: 1, borderRadius: 12 },
							input: { color: theme.colors.primaryText, fontSize: 16, fontFamily: 'Rubik-Regular' },
							flagContainer: { backgroundColor: theme.colors.elevation, borderTopLeftRadius: 12, borderBottomLeftRadius: 12 },
							callingCode: { color: theme.colors.primaryText, fontSize: 14 },
							caret: { color: theme.colors.secondaryText },
						}}
						modalStyles={{
							modal: { backgroundColor: theme.colors.background },
							searchInput: { backgroundColor: theme.colors.surface, color: theme.colors.primaryText, borderColor: theme.colors.border },
							countryButton: { backgroundColor: theme.colors.surface, borderColor: theme.colors.border },
							callingCode: { color: theme.colors.primaryText },
							countryName: { color: theme.colors.primaryText },
						}}
						modalSearchInputPlaceholder="Buscar país..."
						modalSearchInputPlaceholderTextColor={theme.colors.placeholder}
					/>
					{phoneNumber.trim().length > 0 && !isPhoneValid && (
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
			<View style={[containerStyles.bottomButtonContainer, { paddingBottom: insets.bottom + 16 }]}>
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

