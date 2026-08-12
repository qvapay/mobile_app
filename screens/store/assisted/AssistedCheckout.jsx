import { useState, useEffect, useMemo } from 'react'
import { View, Text, StyleSheet, ScrollView, Pressable, Modal } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import FontAwesome6 from '@react-native-vector-icons/fontawesome6'

// Toast
import { toast } from 'sonner-native'

// Contexts
import { useAuth } from '../../../auth/AuthContext'
import { useTheme } from '../../../theme/ThemeContext'
import { createContainerStyles, createTextStyles } from '../../../theme/themeUtils'

// UI
import QPButton from '../../../ui/particles/QPButton'
import AddressPicker, { formatAddress } from '../../../ui/store/AddressPicker'
import NewAddressForm, { EMPTY_US_ADDRESS, validateUsAddress, buildAddressBody } from '../../../ui/store/NewAddressForm'

// Routes & API
import { ROUTES } from '../../../routes'
import { shopApi } from '../../../api/shopApi'

// Constants
import { money } from './assistedConstants'

// Subtotal + tax + total card (server-side quote)
const QuoteSummary = ({ quote, insufficient, balance, total, theme, textStyles }) => (
	<View style={[styles.summaryCard, { backgroundColor: theme.colors.surface }, theme.mode === 'light' && { borderWidth: 1, borderColor: theme.colors.elevationLight }]}>
		<Text style={[textStyles.h6, { fontWeight: '600', marginBottom: 10 }]}>Resumen</Text>
		{quote ? (
			<>
				<View style={styles.summaryRow}>
					<Text style={[textStyles.caption, { color: theme.colors.secondaryText }]}>Subtotal ({quote.item_count} producto{quote.item_count === 1 ? '' : 's'})</Text>
					<Text style={[textStyles.h6, { fontWeight: '500' }]}>{money(quote.subtotal)}</Text>
				</View>
				<View style={styles.summaryRow}>
					<Text style={[textStyles.caption, { color: theme.colors.secondaryText }]}>
						Tax {quote.state} ({(quote.tax_rate * 100).toFixed(2)}%)
					</Text>
					<Text style={[textStyles.h6, { fontWeight: '500' }]}>{money(quote.tax)}</Text>
				</View>
				<View style={[styles.summaryRow, styles.totalRow, { borderTopColor: `${theme.colors.secondaryText}33` }]}>
					<Text style={[textStyles.h6, { fontWeight: '600' }]}>Total</Text>
					<Text style={[textStyles.h5, { fontWeight: '600', color: theme.colors.primary }]}>{money(quote.total)}</Text>
				</View>
				{insufficient && (
					<Text style={[textStyles.caption, { color: theme.colors.danger, marginTop: 8 }]}>
						Saldo insuficiente — tienes {money(balance)} y necesitas {money(total)}.
					</Text>
				)}
			</>
		) : (
			<Text style={[textStyles.caption, { color: theme.colors.secondaryText }]}>
				Selecciona el estado de destino para calcular el tax.
			</Text>
		)}
	</View>
)

// Purchase confirmation — centered card modal
const ConfirmPurchaseModal = ({ visible, paying, total, addressSummary, onPay, onClose, theme, textStyles }) => {

	const containerStyles = createContainerStyles(theme)

	return (
	<Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={() => !paying && onClose()}>
		<Pressable style={containerStyles.modalOverlay} onPress={() => !paying && onClose()}>
			<Pressable style={containerStyles.modalCard} onPress={() => { }}>
				<View style={[styles.confirmIcon, { backgroundColor: `${theme.colors.primary}1A` }]}>
					<FontAwesome6 name="basket-shopping" size={22} color={theme.colors.primary} iconStyle="solid" />
				</View>
				<Text style={[textStyles.h4, { fontWeight: '600', textAlign: 'center', marginTop: 12 }]}>Confirmar compra</Text>
				<Text style={[textStyles.caption, { color: theme.colors.secondaryText, textAlign: 'center', marginTop: 8, lineHeight: 18 }]}>
					Se descontarán {money(total)} de tu balance. Enviaremos a:
				</Text>
				<Text style={[textStyles.caption, { color: theme.colors.primaryText, textAlign: 'center', marginTop: 6, lineHeight: 18 }]} numberOfLines={3}>
					{addressSummary}
				</Text>
				<QPButton title={`Pagar ${money(total)}`} onPress={onPay} loading={paying} style={{ marginTop: 18 }} />
				<Pressable style={{ marginTop: 12, alignSelf: 'center' }} onPress={() => !paying && onClose()}>
					<Text style={[textStyles.caption, { color: theme.colors.secondaryText }]}>Cancelar</Text>
				</Pressable>
			</Pressable>
		</Pressable>
	</Modal>
	)
}

/**
 * Assisted-shopping checkout: pick a saved US shipping address or create a
 * new one, get the server-side tax quote for the destination state, and pay
 * the open cart with QvaPay balance. Confirmation happens in a centered
 * modal before hitting `POST /shop/assisted-shopping/checkout`.
 */
const AssistedCheckout = ({ navigation }) => {

	const { user } = useAuth()
	const { theme } = useTheme()
	const containerStyles = createContainerStyles(theme)
	const textStyles = createTextStyles(theme)
	const insets = useSafeAreaInsets()

	const [addresses, setAddresses] = useState([])
	const [loading, setLoading] = useState(true)
	const [selectedUuid, setSelectedUuid] = useState(null)
	const [useNewAddress, setUseNewAddress] = useState(false)
	const [form, setForm] = useState(EMPTY_US_ADDRESS)
	const [quote, setQuote] = useState(null)
	const [confirmVisible, setConfirmVisible] = useState(false)
	const [paying, setPaying] = useState(false)

	// Load saved addresses; preselect the default (or first) one.
	useEffect(() => {
		const load = async () => {
			const res = await shopApi.getShippingAddresses()
			if (res.success) {
				const list = res.data?.addresses || []
				setAddresses(list)
				if (list.length > 0) {
					setSelectedUuid((list.find(a => a.is_default) || list[0]).uuid)
				} else {
					setUseNewAddress(true)
				}
			} else {
				toast.error('Direcciones', { description: res.error })
				setUseNewAddress(true)
			}
			setLoading(false)
		}
		load()
	}, [])

	// The state that drives the tax quote: saved address or the form's state.
	const quoteState = useMemo(() => {
		if (!useNewAddress && selectedUuid) {
			return addresses.find(a => a.uuid === selectedUuid)?.state || null
		}
		return form.state || null
	}, [useNewAddress, selectedUuid, addresses, form.state])

	// Server-side quote — tax rates only live in the backend.
	useEffect(() => {
		if (!quoteState) { setQuote(null); return }
		let cancelled = false
		const fetchQuote = async () => {
			const res = await shopApi.getQuote({ state: quoteState })
			if (cancelled) return
			if (res.success) setQuote(res.data?.quote || null)
			else {
				setQuote(null)
				toast.error('Checkout', { description: res.error })
			}
		}
		fetchQuote()
		return () => { cancelled = true }
	}, [quoteState])

	const formError = useMemo(() => (useNewAddress ? validateUsAddress(form) : null), [useNewAddress, form])

	const selectedAddress = addresses.find(a => a.uuid === selectedUuid)
	const balance = Number(user?.balance || 0)
	const total = Number(quote?.total || 0)
	const insufficient = quote ? balance < total : false
	const canPay = !!quote && quote.meets_minimum && !insufficient && (useNewAddress ? !formError : !!selectedAddress)

	const handleConfirm = () => {
		if (useNewAddress && formError) {
			toast.error('Dirección', { description: formError })
			return
		}
		setConfirmVisible(true)
	}

	const handlePay = async () => {
		setPaying(true)
		const body = useNewAddress
			? { new_address: buildAddressBody(form) }
			: { shipping_address_id: selectedUuid }
		const res = await shopApi.checkout(body)
		setPaying(false)
		setConfirmVisible(false)
		if (res.success && res.data?.ok) {
			toast.success('Compra realizada', { description: `Pedido #${res.data.cart_id} confirmado por ${money(res.data.total)}` })
			navigation.replace(ROUTES.ASSISTED_ORDER_DETAIL, { id: res.data.cart_id })
		} else {
			toast.error('Checkout', { description: res.error })
		}
	}

	if (loading) { return <View style={containerStyles.subContainer} /> }

	const addressSummary = useNewAddress
		? formatAddress(form)
		: selectedAddress
			? formatAddress(selectedAddress)
			: ''

	return (
		<View style={containerStyles.subContainer}>
			<ScrollView
				contentContainerStyle={{ paddingBottom: insets.bottom + 30, paddingTop: 8 }}
				showsVerticalScrollIndicator={false}
				keyboardShouldPersistTaps="handled"
			>

				{/* Address selector */}
				<Text style={[textStyles.h5, { fontWeight: '600' }]}>Dirección de envío</Text>
				<Text style={[textStyles.caption, { color: theme.colors.secondaryText, marginTop: 4 }]}>
					Por ahora solo enviamos dentro de Estados Unidos.
				</Text>

				{addresses.length > 0 && (
					<AddressPicker
						addresses={addresses}
						useNewAddress={useNewAddress}
						selectedUuid={selectedUuid}
						onSelectAddress={(uuid) => { setUseNewAddress(false); setSelectedUuid(uuid) }}
						onNewAddress={() => setUseNewAddress(true)}
						theme={theme}
						textStyles={textStyles}
					/>
				)}

				{/* New address form */}
				{useNewAddress && <NewAddressForm form={form} onChange={setForm} />}

				{/* Quote */}
				<QuoteSummary quote={quote} insufficient={insufficient} balance={balance} total={total} theme={theme} textStyles={textStyles} />

				<QPButton
					title={quote ? `Pagar ${money(quote.total)}` : 'Pagar'}
					icon="lock"
					onPress={handleConfirm}
					disabled={!canPay}
					style={{ marginTop: 16 }}
				/>

			</ScrollView>

			{/* Purchase confirmation */}
			<ConfirmPurchaseModal
				visible={confirmVisible}
				paying={paying}
				total={total}
				addressSummary={addressSummary}
				onPay={handlePay}
				onClose={() => setConfirmVisible(false)}
				theme={theme}
				textStyles={textStyles}
			/>
		</View>
	)
}

const styles = StyleSheet.create({
	summaryCard: {
		padding: 14,
		borderRadius: 14,
		marginTop: 20,
	},
	summaryRow: {
		flexDirection: 'row',
		alignItems: 'center',
		justifyContent: 'space-between',
		marginBottom: 6,
	},
	totalRow: {
		borderTopWidth: 1,
		paddingTop: 8,
		marginTop: 4,
		marginBottom: 0,
	},
	confirmIcon: {
		width: 52,
		height: 52,
		borderRadius: 14,
		alignItems: 'center',
		justifyContent: 'center',
		alignSelf: 'center',
	},
})

export default AssistedCheckout
