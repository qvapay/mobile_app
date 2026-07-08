import { useState, useEffect, useCallback, useMemo } from 'react'
import { View, Text, StyleSheet, ScrollView, Pressable, Modal, useWindowDimensions } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import FontAwesome6 from '@react-native-vector-icons/fontawesome6'

// Toast
import { toast } from 'sonner-native'

// Contexts
import { useAuth } from '../../../auth/AuthContext'
import { useTheme } from '../../../theme/ThemeContext'
import { createContainerStyles, createTextStyles } from '../../../theme/themeUtils'

// UI
import QPInput from '../../../ui/particles/QPInput'
import QPButton from '../../../ui/particles/QPButton'

// Routes & API
import { ROUTES } from '../../../routes'
import { shopApi } from '../../../api/shopApi'

// Constants
import { money, US_STATES } from './assistedConstants'
import AddressAutocomplete from './AddressAutocomplete'

const EMPTY_FORM = { recipient_name: '', phone: '', line1: '', line2: '', city: '', state: '', postal_code: '' }
const ZIP_REGEX = /^\d{5}(-\d{4})?$/

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
	const { height: windowHeight } = useWindowDimensions()

	const [addresses, setAddresses] = useState([])
	const [loading, setLoading] = useState(true)
	const [selectedUuid, setSelectedUuid] = useState(null)
	const [useNewAddress, setUseNewAddress] = useState(false)
	const [form, setForm] = useState(EMPTY_FORM)
	const [statePickerVisible, setStatePickerVisible] = useState(false)
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

	const setField = (field) => (value) => setForm(f => ({ ...f, [field]: value }))

	const formError = useMemo(() => {
		if (!useNewAddress) return null
		if (form.recipient_name.trim().length < 2) return 'Escribe el nombre de quien recibe'
		if (form.line1.trim().length < 3) return 'Escribe la dirección (línea 1)'
		if (form.city.trim().length < 2) return 'Escribe la ciudad'
		if (!US_STATES.some(s => s.code === form.state)) return 'Selecciona el estado'
		if (!ZIP_REGEX.test(form.postal_code.trim())) return 'Código postal USA inválido (ej: 33033)'
		return null
	}, [useNewAddress, form])

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
			? {
				new_address: {
					recipient_name: form.recipient_name.trim(),
					phone: form.phone.trim() || null,
					line1: form.line1.trim(),
					line2: form.line2.trim() || null,
					city: form.city.trim(),
					state: form.state,
					postal_code: form.postal_code.trim(),
					country: 'US',
				},
			}
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
		? `${form.recipient_name} — ${form.line1}${form.line2 ? `, ${form.line2}` : ''}, ${form.city}, ${form.state} ${form.postal_code}`
		: selectedAddress
			? `${selectedAddress.recipient_name} — ${selectedAddress.line1}${selectedAddress.line2 ? `, ${selectedAddress.line2}` : ''}, ${selectedAddress.city}, ${selectedAddress.state} ${selectedAddress.postal_code}`
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
					<View style={{ marginTop: 12, gap: 8 }}>
						{addresses.map(address => {
							const selected = !useNewAddress && selectedUuid === address.uuid
							return (
								<Pressable
									key={address.uuid}
									style={[
										styles.addressCard,
										{ backgroundColor: theme.colors.surface },
										theme.mode === 'light' && { borderWidth: 1, borderColor: theme.colors.elevationLight },
										selected && { borderWidth: 1.5, borderColor: theme.colors.primary },
									]}
									onPress={() => { setUseNewAddress(false); setSelectedUuid(address.uuid) }}
								>
									<FontAwesome6
										name={selected ? 'circle-check' : 'circle'}
										size={16}
										color={selected ? theme.colors.primary : theme.colors.secondaryText}
										iconStyle={selected ? 'solid' : 'regular'}
									/>
									<View style={{ flex: 1 }}>
										<Text style={[textStyles.h6, { fontWeight: '600' }]}>
											{address.label || 'Dirección'}{address.is_default ? ' · Predeterminada' : ''}
										</Text>
										<Text style={[textStyles.caption, { color: theme.colors.secondaryText, marginTop: 2 }]} numberOfLines={2}>
											{address.recipient_name} — {address.line1}{address.line2 ? `, ${address.line2}` : ''}, {address.city}, {address.state} {address.postal_code}
										</Text>
									</View>
								</Pressable>
							)
						})}

						<Pressable
							style={[
								styles.addressCard,
								{ backgroundColor: theme.colors.surface },
								theme.mode === 'light' && { borderWidth: 1, borderColor: theme.colors.elevationLight },
								useNewAddress && { borderWidth: 1.5, borderColor: theme.colors.primary },
							]}
							onPress={() => setUseNewAddress(true)}
						>
							<FontAwesome6 name="plus" size={14} color={useNewAddress ? theme.colors.primary : theme.colors.secondaryText} iconStyle="solid" />
							<Text style={[textStyles.h6, { fontWeight: '600', color: useNewAddress ? theme.colors.primary : theme.colors.primaryText }]}>
								Nueva dirección
							</Text>
						</Pressable>
					</View>
				)}

				{/* New address form */}
				{useNewAddress && (
					<View style={{ marginTop: 14, gap: 10 }}>
						<AddressAutocomplete
							onSelect={(address) => setForm(f => ({
								...f,
								line1: address.line1 || f.line1,
								city: address.city || f.city,
								state: US_STATES.some(s => s.code === address.state) ? address.state : f.state,
								postal_code: address.postal_code || f.postal_code,
							}))}
						/>
						<QPInput prelabel="Nombre de quien recibe" placeholder="John Doe" value={form.recipient_name} onChangeText={setField('recipient_name')} autoCapitalize="words" />
						<QPInput prelabel="Teléfono (opcional)" placeholder="+1 305 555 0100" value={form.phone} onChangeText={setField('phone')} keyboardType="phone-pad" />
						<QPInput prelabel="Dirección (línea 1)" placeholder="123 Main St" value={form.line1} onChangeText={setField('line1')} />
						<QPInput prelabel="Apto, suite… (opcional)" placeholder="Apt 4B" value={form.line2} onChangeText={setField('line2')} />
						<QPInput prelabel="Ciudad" placeholder="Miami" value={form.city} onChangeText={setField('city')} autoCapitalize="words" />

						<View style={styles.stateZipRow}>
							<View style={{ flex: 1 }}>
								<Text style={[textStyles.caption, { color: theme.colors.secondaryText, marginBottom: 6 }]}>Estado</Text>
								<Pressable
									style={[styles.statePicker, { backgroundColor: theme.colors.surface }, theme.mode === 'light' && { borderWidth: 1, borderColor: theme.colors.elevationLight }]}
									onPress={() => setStatePickerVisible(true)}
								>
									<Text style={[textStyles.h6, { color: form.state ? theme.colors.primaryText : theme.colors.secondaryText }]}>
										{form.state ? `${form.state} — ${US_STATES.find(s => s.code === form.state)?.name}` : 'Seleccionar'}
									</Text>
									<FontAwesome6 name="chevron-down" size={12} color={theme.colors.secondaryText} iconStyle="solid" />
								</Pressable>
							</View>
							<View style={{ width: 130 }}>
								<QPInput prelabel="Código postal" placeholder="33033" value={form.postal_code} onChangeText={setField('postal_code')} keyboardType="numbers-and-punctuation" maxLength={10} />
							</View>
						</View>
					</View>
				)}

				{/* Quote */}
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

				<QPButton
					title={quote ? `Pagar ${money(quote.total)}` : 'Pagar'}
					icon="lock"
					onPress={handleConfirm}
					disabled={!canPay}
					style={{ marginTop: 16 }}
				/>

			</ScrollView>

			{/* US state picker */}
			<Modal visible={statePickerVisible} transparent animationType="fade" statusBarTranslucent onRequestClose={() => setStatePickerVisible(false)}>
				<Pressable style={styles.modalOverlay} onPress={() => setStatePickerVisible(false)}>
					<Pressable style={[styles.modalCard, { backgroundColor: theme.colors.surface, maxHeight: windowHeight * 0.75 }]} onPress={() => { }}>
						<Text style={[textStyles.h5, { fontWeight: '600', marginBottom: 10 }]}>Estado de destino</Text>
						<ScrollView showsVerticalScrollIndicator={false}>
							{US_STATES.map(state => (
								<Pressable
									key={state.code}
									style={styles.stateRow}
									onPress={() => { setField('state')(state.code); setStatePickerVisible(false) }}
								>
									<Text style={[textStyles.h6, { color: form.state === state.code ? theme.colors.primary : theme.colors.primaryText, fontWeight: form.state === state.code ? '600' : '400' }]}>
										{state.name}
									</Text>
									<Text style={[textStyles.caption, { color: theme.colors.secondaryText }]}>{state.code}</Text>
								</Pressable>
							))}
						</ScrollView>
					</Pressable>
				</Pressable>
			</Modal>

			{/* Purchase confirmation */}
			<Modal visible={confirmVisible} transparent animationType="fade" statusBarTranslucent onRequestClose={() => !paying && setConfirmVisible(false)}>
				<Pressable style={styles.modalOverlay} onPress={() => !paying && setConfirmVisible(false)}>
					<Pressable style={[styles.modalCard, { backgroundColor: theme.colors.surface }]} onPress={() => { }}>
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
						<QPButton title={`Pagar ${money(total)}`} onPress={handlePay} loading={paying} style={{ marginTop: 18 }} />
						<Pressable style={{ marginTop: 12, alignSelf: 'center' }} onPress={() => !paying && setConfirmVisible(false)}>
							<Text style={[textStyles.caption, { color: theme.colors.secondaryText }]}>Cancelar</Text>
						</Pressable>
					</Pressable>
				</Pressable>
			</Modal>
		</View>
	)
}

const styles = StyleSheet.create({
	addressCard: {
		flexDirection: 'row',
		alignItems: 'center',
		gap: 12,
		padding: 14,
		borderRadius: 14,
	},
	stateZipRow: {
		flexDirection: 'row',
		gap: 10,
		alignItems: 'flex-end',
	},
	statePicker: {
		flexDirection: 'row',
		alignItems: 'center',
		justifyContent: 'space-between',
		paddingHorizontal: 14,
		height: 50,
		borderRadius: 12,
	},
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
	modalOverlay: {
		flex: 1,
		backgroundColor: 'rgba(0,0,0,0.6)',
		justifyContent: 'center',
		alignItems: 'center',
		padding: 24,
	},
	modalCard: {
		width: '100%',
		borderRadius: 18,
		padding: 20,
	},
	stateRow: {
		flexDirection: 'row',
		alignItems: 'center',
		justifyContent: 'space-between',
		paddingVertical: 12,
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
