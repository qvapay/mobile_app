import { useState, useLayoutEffect } from 'react'
import { View, Text, StyleSheet, Alert, Platform } from 'react-native'
import FastImage from '@d11/react-native-fast-image'

// Helpers
import { tinyfiNumber } from '../../helpers'

// Liquid glass requires iOS 26+ (same check as MainStack)
const supportsLiquidGlass = Platform.OS === 'ios' && parseInt(String(Platform.Version), 10) >= 26

// Theme Context
import { useTheme } from '../../theme/ThemeContext'
import { createContainerStyles, createTextStyles } from '../../theme/themeUtils'

// UI Particles
import QPButton from '../../ui/particles/QPButton'
import QPKeyboardView from '../../ui/QPKeyboardView'

// Phone Input
import PhoneInput, { isValidPhoneNumber } from 'react-native-international-phone-number'

// User Context
import { useAuth } from '../../auth/AuthContext'

// API
import { storeApi } from '../../api/storeApi'

// Toast
import { toast } from 'sonner-native'

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
	const [selectedCountry, setSelectedCountry] = useState(null)
	const [isPurchasing, setIsPurchasing] = useState(false)

	// Build full phone number with country calling code (idd.root = "+53", etc.)
	const fullPhoneNumber = selectedCountry?.idd?.root ? `${selectedCountry.idd.root}${phoneNumber.replace(/\D/g, '')}` : phoneNumber

	// Validate using libphonenumber-js via the package
	const isPhoneValid = selectedCountry && phoneNumber.trim().length > 0 && isValidPhoneNumber(phoneNumber, selectedCountry)

	// Check if purchase button should be enabled
	const isPurchaseEnabled = () => isPhoneValid && !isPurchasing

	// Show balance in the top-right of the native header (plain text, no bubble)
	useLayoutEffect(() => {
		const raw = parseFloat(user?.balance || 0)
		if (Number.isNaN(raw)) { return }
		const label = `$${tinyfiNumber(raw)}`

		const balanceNode = (
			<Text style={[textStyles.h5, { color: theme.colors.primaryText }]}>
				{label}
			</Text>
		)

		navigation.setOptions({
			// Android / older iOS fallback
			headerRight: () => (
				<View style={{ marginRight: 16 }}>{balanceNode}</View>
			),
			// iOS 26+ liquid glass — render as plain text without the pill background
			...(supportsLiquidGlass && {
				unstable_headerRightItems: () => [{
					type: 'custom',
					element: balanceNode,
					hidesSharedBackground: true,
				}],
			}),
		})
	}, [navigation, user?.balance, theme])

	// Handle purchase
	const handlePurchase = async () => {

		if (!packageItem || !packageItem.id) {
			toast.error('Error', { description: 'Paquete no válido' })
			return
		}

		if (!isPhoneValid) {
			toast.error('Error', { description: 'Por favor ingresa un número de teléfono válido' })
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
								toast.success('¡Compra exitosa!', { description: 'La recarga se ha procesado correctamente' })
								// Navigate back after a short delay
								setTimeout(() => {
									navigation.goBack()
								}, 1500)
							}
							else { toast.error('Error', { description: response.error || 'No se pudo realizar la compra' }) }
						} catch (error) {
		toast.error('Error', { description: error.message || 'Ha ocurrido un error al procesar la compra' })
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
		<QPKeyboardView
			actions={
				<QPButton
					title={isPurchasing ? 'Procesando...' : `Comprar por $${packageItem.price || '0.00'}`}
					onPress={handlePurchase}
					disabled={!isPurchaseEnabled()}
					loading={isPurchasing}
					textStyle={{ color: theme.colors.buttonText }}
				/>
			}
	
		>
			{/* Package Summary (compact) */}
			<View style={[styles.summaryCard, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
				<View style={[styles.summaryThumb, { backgroundColor: theme.colors.elevationLight }]}>
					{(packageItem.logo || packageItem.image) ? (
						<FastImage
							source={{
								uri: (packageItem.logo || packageItem.image).startsWith('http')
									? (packageItem.logo || packageItem.image)
									: `https://media.qvapay.com/${packageItem.logo || packageItem.image}`,
								priority: FastImage.priority.normal,
								cache: FastImage.cacheControl.immutable,
							}}
							style={styles.summaryThumbImage}
							resizeMode={FastImage.resizeMode.cover}
						/>
					) : null}
				</View>
				<View style={styles.summaryContent}>
					<Text style={[textStyles.h6, { color: theme.colors.secondaryText }]} numberOfLines={1}>
						{packageItem.operator || 'Operador'}
					</Text>
					<Text style={[textStyles.h5, { color: theme.colors.primaryText, fontWeight: '600' }]} numberOfLines={1}>
						{packageItem.name || 'Recarga telefónica'}
					</Text>
				</View>
				<Text style={[textStyles.h4, { color: theme.colors.primary, fontWeight: '700' }]}>
					${Number(packageItem.price || 0).toFixed(2)}
				</Text>
			</View>

			{/* Hero: Phone Number Input */}
			<View style={styles.inputSection}>
				<Text style={[textStyles.h3, { color: theme.colors.primaryText, fontWeight: '700', marginBottom: 6 }]}>
					¿A qué número?
				</Text>
				<Text style={[textStyles.h6, { color: theme.colors.secondaryText, marginBottom: 20 }]}>
					Selecciona el país y escribe el número del destinatario.
				</Text>

				<PhoneInput
					value={phoneNumber}
					onChangePhoneNumber={setPhoneNumber}
					selectedCountry={selectedCountry}
					onChangeSelectedCountry={setSelectedCountry}
					defaultCountry="CU"
					placeholder="000 000 000"
					language="spa"
					theme={theme.mode === 'light' ? 'light' : 'dark'}
					phoneInputStyles={{
						container: {
							backgroundColor: theme.colors.surface,
							borderColor: isPhoneValid ? theme.colors.primary : theme.colors.border,
							borderWidth: 1.5,
							borderRadius: 16,
							height: 68,
							paddingHorizontal: 4,
						},
						flagContainer: {
							backgroundColor: theme.colors.elevation,
							borderTopLeftRadius: 12,
							borderBottomLeftRadius: 12,
							paddingHorizontal: 12,
							marginVertical: 6,
							marginLeft: 2,
						},
						flag: { fontSize: 26 },
						callingCode: { width: 0, marginLeft: 0, fontSize: 0, color: 'transparent' },
						caret: { color: theme.colors.primary, fontSize: 14, marginLeft: 4 },
						divider: { backgroundColor: theme.colors.border },
						input: {
							color: theme.colors.primaryText,
							fontSize: theme.typography.fontSize.xxl || 22,
							fontFamily: theme.typography.fontFamily.medium || theme.typography.fontFamily.regular,
							fontWeight: '600',
							letterSpacing: 0.5,
							paddingLeft: 12,
						},
					}}
					showModalAlphabetFilter={false}
					popularCountries={['CU', 'US', 'ES', 'MX', 'CO', 'VE', 'AR', 'DO']}
					modalPopularCountriesTitle="Populares"
					modalAllCountriesTitle="Todos los países"
					modalNotFoundCountryMessage="No se encontró ningún país"
					modalSearchInputPlaceholder="Buscar país..."
					modalSearchInputPlaceholderTextColor={theme.colors.placeholder}
					modalStyles={{
						content: { backgroundColor: theme.colors.surface },
						dragHandleIndicator: { backgroundColor: theme.colors.border },
						searchInput: {
							backgroundColor: theme.colors.background,
							color: theme.colors.primaryText,
							borderColor: 'transparent',
							borderWidth: 0,
						},
						sectionTitle: {
							color: theme.colors.tertiaryText,
							fontSize: theme.typography.fontSize.sm,
							fontWeight: '600',
							textTransform: 'uppercase',
							letterSpacing: 0.8,
						},
						countryItem: {
							backgroundColor: theme.colors.background,
							borderColor: 'transparent',
							borderWidth: 0,
						},
						flag: { color: theme.colors.primaryText },
						countryName: {
							color: theme.colors.primaryText,
							fontFamily: theme.typography.fontFamily.medium || theme.typography.fontFamily.regular,
							fontWeight: '600',
						},
						callingCode: { color: theme.colors.secondaryText },
						closeButton: {
							backgroundColor: theme.colors.background,
							borderColor: 'transparent',
							borderWidth: 0,
						},
						closeButtonText: { color: theme.colors.primaryText },
						countryNotFoundMessage: { color: theme.colors.secondaryText },
					}}
				/>

				{phoneNumber.trim().length > 0 && !isPhoneValid ? (
					<View style={styles.hintRow}>
						<FontAwesome6 name="circle-exclamation" size={12} color={theme.colors.danger} iconStyle="solid" />
						<Text style={[textStyles.caption, { color: theme.colors.danger, marginLeft: 6 }]}>
							Número no válido para el país seleccionado
						</Text>
					</View>
				) : isPhoneValid ? (
					<View style={styles.hintRow}>
						<FontAwesome6 name="circle-check" size={12} color={theme.colors.success} iconStyle="solid" />
						<Text style={[textStyles.caption, { color: theme.colors.success, marginLeft: 6 }]}>
							Enviaremos la recarga a {fullPhoneNumber}
						</Text>
					</View>
				) : (
					<View style={styles.hintRow}>
						<FontAwesome6 name="circle-info" size={12} color={theme.colors.tertiaryText} iconStyle="solid" />
						<Text style={[textStyles.caption, { color: theme.colors.tertiaryText, marginLeft: 6 }]}>
							Toca la bandera para cambiar de país
						</Text>
					</View>
				)}
			</View>

		</QPKeyboardView>
	)
}

const styles = StyleSheet.create({
	errorContainer: {
		justifyContent: 'center',
		alignItems: 'center',
		padding: 20,
	},
	summaryCard: {
		flexDirection: 'row',
		alignItems: 'center',
		padding: 10,
		borderRadius: 14,
		borderWidth: 0.5,
		marginBottom: 28,
	},
	summaryThumb: {
		width: 52,
		height: 52,
		borderRadius: 10,
		overflow: 'hidden',
	},
	summaryThumbImage: {
		width: '100%',
		height: '100%',
	},
	summaryContent: {
		flex: 1,
		paddingHorizontal: 12,
	},
	inputSection: {
		marginBottom: 24,
	},
	hintRow: {
		flexDirection: 'row',
		alignItems: 'center',
		marginTop: 10,
		paddingHorizontal: 4,
	},
})

export default PhoneTopupPurchase

