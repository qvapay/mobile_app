import { useState, useEffect } from 'react'
import { View, Text, StyleSheet, ScrollView, Pressable, Alert } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import FastImage from '@d11/react-native-fast-image'

// Theme Context
import { useTheme } from '../../theme/ThemeContext'
import { createContainerStyles, createTextStyles } from '../../theme/themeUtils'

// UI Particles
import QPInput from '../../ui/particles/QPInput'
import QPButton from '../../ui/particles/QPButton'

// User Context
import { useAuth } from '../../auth/AuthContext'

// API
import { storeApi } from '../../api/storeApi'

// Toast
import Toast from 'react-native-toast-message'

// Icons
import FontAwesome6 from '@react-native-vector-icons/fontawesome6'

// GiftCardDetail component
const GiftCardDetail = ({ navigation, route }) => {

	// Contexts
	const { user } = useAuth()
	const { theme } = useTheme()
	const containerStyles = createContainerStyles(theme)
	const textStyles = createTextStyles(theme)
	const insets = useSafeAreaInsets()

	// Get uuid from route params
	const { uuid } = route.params || {}

	// States
	const [card, setCard] = useState(null)
	const [isLoading, setIsLoading] = useState(true)
	const [isPurchasing, setIsPurchasing] = useState(false)
	const [selectedOption, setSelectedOption] = useState(null)
	const [rangeAmount, setRangeAmount] = useState('')

	// Fetch gift card detail
	useEffect(() => {
		const fetchDetail = async () => {
			setIsLoading(true)
			try {
				const response = await storeApi.getGiftCardDetail(uuid)
				if (response.success) {
					setCard(response.data)
					navigation.setOptions({ headerTitle: response.data.name || '' })
				} else {
					Toast.show({ type: 'error', text1: 'Error', text2: response.error || 'No se pudo cargar la tarjeta de regalo' })
				}
			} catch (error) {
		Toast.show({ type: 'error', text1: 'Error', text2: 'Ha ocurrido un error al cargar el detalle' })
			} finally {
				setIsLoading(false)
			}
		}
		if (uuid) { fetchDetail() }
	}, [uuid, navigation])

	// Get base price for the selected option
	// Backend already returns prices in dollars (converted from cents)
	const getBasePrice = () => {
		if (!selectedOption) return 0
		if (selectedOption.priceType === 'FIXED') {
			return selectedOption.price?.fixed || 0
		}
		// RANGE: use the amount entered by user (already in dollars)
		const amount = parseFloat(rangeAmount)
		return isNaN(amount) ? 0 : amount
	}

	// Calculate tax amount
	const getTax = () => {
		if (!card) return 0
		const taxRate = user?.golden_check ? (card.tax_gold ?? card.tax) : card.tax
		return getBasePrice() * (taxRate || 0) / 100
	}

	// Calculate total
	const getTotal = () => getBasePrice() + getTax()

	// Validate range amount
	// Backend already returns prices in dollars (converted from cents)
	const isRangeValid = () => {
		if (!selectedOption || selectedOption.priceType !== 'RANGE') return true
		const amount = parseFloat(rangeAmount)
		if (isNaN(amount) || amount <= 0) return false
		const min = selectedOption.price?.min || 0
		const max = selectedOption.price?.max || Infinity
		return amount >= min && amount <= max
	}

	// Check if purchase is enabled
	const isPurchaseEnabled = () => {
		if (!selectedOption || isPurchasing) return false
		if (selectedOption.priceType === 'RANGE' && !isRangeValid()) return false
		return getTotal() > 0
	}

	// Handle purchase
	const handlePurchase = () => {
		const total = getTotal()

		Alert.alert(
			'Confirmar compra',
			`¿Comprar ${card.name} por $${total.toFixed(2)}?`,
			[
				{ text: 'Cancelar', style: 'cancel' },
				{
					text: 'Confirmar',
					onPress: async () => {
						setIsPurchasing(true)
						try {
							const body = { code: selectedOption.code }
							if (selectedOption.priceType === 'RANGE') {
								body.amount = parseFloat(rangeAmount)
							}

							const response = await storeApi.purchaseGiftCard(uuid, body)

							if (response.success) {
								Toast.show({ type: 'success', text1: '¡Compra exitosa!', text2: 'Tu tarjeta de regalo se está procesando' })
								setTimeout(() => { navigation.goBack() }, 1500)
							} else {
								Toast.show({ type: 'error', text1: 'Error', text2: response.error || 'No se pudo realizar la compra' })
							}
						} catch (error) {
		Toast.show({ type: 'error', text1: 'Error', text2: error.message || 'Ha ocurrido un error al procesar la compra' })
						} finally {
							setIsPurchasing(false)
						}
					},
				},
			]
		)
	}

	// Loading state — global loading bar handles the indicator
	if (isLoading) { return <View style={containerStyles.subContainer} /> }

	// Error state
	if (!card) {
		return (
			<View style={[containerStyles.subContainer, styles.errorContainer]}>
				<FontAwesome6 name="triangle-exclamation" size={48} color={theme.colors.danger} iconStyle="solid" />
				<Text style={[textStyles.h5, { color: theme.colors.danger, marginTop: 16, textAlign: 'center' }]}>
					Tarjeta de regalo no encontrada
				</Text>
				<QPButton title="Volver" onPress={() => navigation.goBack()} style={{ marginTop: 20 }} />
			</View>
		)
	}

	const logoUrl = card.logo ? (card.logo.startsWith('http') ? card.logo : `https://media.qvapay.com/${card.logo}`) : ''
	const hasOptions = card.options && card.options.length > 0
	const taxRate = user?.golden_check ? (card.tax_gold ?? card.tax) : card.tax

	return (
		<View style={[containerStyles.subContainer, { justifyContent: 'space-between' }]}>
			<ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>

				{/* Header: Logo + Name */}
				<View style={styles.headerSection}>
					{logoUrl ? (
						<View style={[styles.logoContainer, { backgroundColor: card.color || theme.colors.elevationLight }]}>
							<FastImage source={{ uri: logoUrl, priority: FastImage.priority.normal }} style={styles.logo} resizeMode={FastImage.resizeMode.contain} />
						</View>
					) : null}
					<Text style={[textStyles.h3, { textAlign: 'center', marginTop: 16 }]}>{card.name}</Text>
					{card.lead ? (
						<Text style={[textStyles.h6, { color: theme.colors.secondaryText, textAlign: 'center', marginTop: 4 }]}>{card.lead}</Text>
					) : null}
				</View>

				{/* Options (pricing) */}
				{hasOptions ? (
					<View style={styles.optionsSection}>
						<Text style={[textStyles.h5, { color: theme.colors.primaryText, marginBottom: 12 }]}>
							Selecciona una opción
						</Text>

						{/* Fixed-price options as compact chips */}
						{card.options.some(o => o.priceType === 'FIXED') && (
							<View style={styles.chipsGrid}>
								{card.options.filter(o => o.priceType === 'FIXED').map((option) => {
									const isSelected = selectedOption?.code === option.code
									return (
										<Pressable
											key={option.code}
											style={[
												styles.chip,
												{
													backgroundColor: isSelected ? theme.colors.primary : theme.colors.surface,
													borderColor: isSelected ? theme.colors.primary : theme.colors.border,
												}
											]}
											onPress={() => {
												setSelectedOption(option)
												setRangeAmount('')
											}}
										>
											<Text style={[textStyles.h6, { color: isSelected ? theme.colors.almostWhite : theme.colors.primaryText, fontWeight: '600' }]}>
												${(option.price?.fixed || 0).toFixed(2)}
											</Text>
										</Pressable>
									)
								})}
							</View>
						)}

						{/* Range options keep full card layout */}
						{card.options.filter(o => o.priceType === 'RANGE').map((option) => {
							const isSelected = selectedOption?.code === option.code
							const displayPrice = `$${(option.price?.min || 0).toFixed(2)} - $${(option.price?.max || 0).toFixed(2)}`
							return (
								<Pressable
									key={option.code}
									style={[
										styles.optionCard,
										{
											backgroundColor: isSelected ? theme.colors.primary + '15' : theme.colors.surface,
											borderColor: isSelected ? theme.colors.primary : theme.colors.border,
										}
									]}
									onPress={() => {
										setSelectedOption(option)
										setRangeAmount('')
									}}
								>
									<View style={styles.optionRow}>
										<View style={[styles.radio, { borderColor: isSelected ? theme.colors.primary : theme.colors.border }]}>
											{isSelected && <View style={[styles.radioInner, { backgroundColor: theme.colors.primary }]} />}
										</View>
										<View style={styles.optionInfo}>
											<Text style={[textStyles.h6, { color: theme.colors.primaryText }]}>
												{option.brand} · {option.country}
											</Text>
											<Text style={[textStyles.caption, { color: theme.colors.secondaryText, marginTop: 2 }]}>
												Monto variable · {displayPrice}
											</Text>
										</View>
										<Text style={[textStyles.h5, { color: isSelected ? theme.colors.primary : theme.colors.primaryText }]}>
											{displayPrice}
										</Text>
									</View>
								</Pressable>
							)
						})}
					</View>
				) : null}

				{/* Range amount input */}
				{selectedOption?.priceType === 'RANGE' ? (
					<View style={styles.rangeSection}>
						<Text style={[textStyles.h5, { color: theme.colors.primaryText, marginBottom: 12 }]}>
							Ingresa el monto (USD)
						</Text>
						<QPInput
							value={rangeAmount}
							onChangeText={setRangeAmount}
							placeholder={`Min $${(selectedOption.price?.min || 0).toFixed(2)} - Max $${(selectedOption.price?.max || 0).toFixed(2)}`}
							prefixIconName="dollar-sign"
							keyboardType="decimal-pad"
							style={styles.amountInput}
						/>
						{rangeAmount && !isRangeValid() && (
							<Text style={[textStyles.caption, { color: theme.colors.danger, marginTop: 8 }]}>
								El monto debe estar entre ${(selectedOption.price?.min || 0).toFixed(2)} y ${(selectedOption.price?.max || 0).toFixed(2)}
							</Text>
						)}
					</View>
				) : null}

				{/* Summary */}
				{selectedOption && getBasePrice() > 0 ? (
					<View style={[styles.summarySection, { backgroundColor: theme.colors.elevation }]}>
						<View style={styles.summaryRow}>
							<Text style={[textStyles.h6, { color: theme.colors.secondaryText }]}>Subtotal</Text>
							<Text style={[textStyles.h6, { color: theme.colors.primaryText }]}>${getBasePrice().toFixed(2)}</Text>
						</View>
						<View style={styles.summaryRow}>
							<Text style={[textStyles.h6, { color: theme.colors.secondaryText }]}>Comisión ({taxRate}%)</Text>
							<Text style={[textStyles.h6, { color: theme.colors.primaryText }]}>${getTax().toFixed(2)}</Text>
						</View>
						<View style={[styles.summaryRow, styles.totalRow, { borderTopColor: theme.colors.border }]}>
							<Text style={[textStyles.h5, { color: theme.colors.primaryText }]}>Total</Text>
							<Text style={[textStyles.h5, { color: theme.colors.primary, fontWeight: '600' }]}>${getTotal().toFixed(2)}</Text>
						</View>
					</View>
				) : null}

				{/* Balance Info */}
				{user?.balance ? (
					<View style={[styles.balanceInfo, { backgroundColor: theme.colors.elevation }]}>
						<Text style={[textStyles.h6, { color: theme.colors.secondaryText }]}>Balance disponible:</Text>
						<Text style={[textStyles.h5, { color: theme.colors.primary, fontWeight: '600' }]}>
							${parseFloat(user.balance).toFixed(2)} QUSD
						</Text>
					</View>
				) : null}

				{/* Description */}
				{card.desc ? (
					<View style={styles.descSection}>
						<Text style={[textStyles.caption, { color: theme.colors.tertiaryText, lineHeight: 20 }]}>{card.desc}</Text>
					</View>
				) : null}
			</ScrollView>

			{/* Purchase Button */}
			{hasOptions ? (
				<View style={[containerStyles.bottomButtonContainer, { paddingBottom: insets.bottom + 16 }]}>
					<QPButton
						title={isPurchasing ? 'Procesando...' : `Comprar por $${getTotal().toFixed(2)}`}
						onPress={handlePurchase}
						disabled={!isPurchaseEnabled()}
						loading={isPurchasing}
						textStyle={{ color: theme.colors.buttonText }}
					/>
				</View>
			) : null}
		</View>
	)
}

const styles = StyleSheet.create({
	scrollView: {
		flex: 1,
	},
	loadingContainer: {
		justifyContent: 'center',
		alignItems: 'center',
	},
	errorContainer: {
		justifyContent: 'center',
		alignItems: 'center',
		padding: 20,
	},
	headerSection: {
		alignItems: 'center',
		marginBottom: 24,
	},
	logoContainer: {
		width: 120,
		height: 120,
		borderRadius: 20,
		overflow: 'hidden',
		justifyContent: 'center',
		alignItems: 'center',
	},
	logo: {
		width: '80%',
		height: '80%',
	},
	optionsSection: {
		marginBottom: 24,
	},
	descSection: {
		marginBottom: 24,
	},
	chipsGrid: {
		flexDirection: 'row',
		flexWrap: 'wrap',
		gap: 8,
		marginBottom: 12,
	},
	chip: {
		width: '23%',
		borderRadius: 10,
		borderWidth: 1.5,
		paddingVertical: 10,
		alignItems: 'center',
	},
	optionCard: {
		borderRadius: 12,
		borderWidth: 1.5,
		padding: 16,
		marginBottom: 10,
	},
	optionRow: {
		flexDirection: 'row',
		alignItems: 'center',
	},
	radio: {
		width: 20,
		height: 20,
		borderRadius: 10,
		borderWidth: 2,
		justifyContent: 'center',
		alignItems: 'center',
		marginRight: 12,
	},
	radioInner: {
		width: 10,
		height: 10,
		borderRadius: 5,
	},
	optionInfo: {
		flex: 1,
		marginRight: 12,
	},
	rangeSection: {
		marginBottom: 24,
	},
	amountInput: {
		fontSize: 16,
	},
	summarySection: {
		borderRadius: 12,
		padding: 16,
		marginBottom: 16,
	},
	summaryRow: {
		flexDirection: 'row',
		justifyContent: 'space-between',
		alignItems: 'center',
		paddingVertical: 6,
	},
	totalRow: {
		borderTopWidth: 1,
		marginTop: 8,
		paddingTop: 12,
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

export default GiftCardDetail
