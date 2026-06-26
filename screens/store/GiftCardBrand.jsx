import { useState, useEffect, useMemo, useLayoutEffect, useCallback, useReducer } from 'react'
import { View, Text, StyleSheet, ScrollView, Pressable, TextInput, Platform } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

// Toast
import { toast } from 'sonner-native'

const supportsLiquidGlass = Platform.OS === 'ios' && parseInt(String(Platform.Version), 10) >= 26

import { useTheme } from '../../theme/ThemeContext'
import { createContainerStyles, createTextStyles } from '../../theme/themeUtils'

import QPButton from '../../ui/particles/QPButton'
import QPLoader from '../../ui/particles/QPLoader'
import OperatorAvatar from '../../ui/store/OperatorAvatar'

import { useAuth } from '../../auth/AuthContext'
import { storeApi } from '../../api/storeApi'
import { tinyfiNumber } from '../../helpers'

const cleanText = (text) => {
	if (!text) return ''
	return String(text).replace(/[•|·]+/g, ' · ').replace(/\s+/g, ' ').trim()
}
const formatSendValue = (send) => {
	if (!send || send.value == null) return ''
	return `$${Number(send.value).toFixed(2)} ${send.currency || 'USD'}`
}
const getReceivedValue = (offer) => {
	const sb = cleanText(offer?.sent_benefits)
	if (sb) return sb
	const notes = cleanText(offer?.notes)
	if (notes) return notes
	const sendStr = formatSendValue(offer?.send)
	if (sendStr) return sendStr
	return offer?.brand || ''
}

const OfferRow = ({ offer, selected, onSelect, theme, textStyles }) => {

	const received = getReceivedValue(offer)
	const sendStr = formatSendValue(offer.send)
	const secondary = sendStr && received !== sendStr ? `Valor: ${sendStr}` : null

	let priceMain
	let priceSub = null
	if (offer.price_type === 'FIXED') {
		priceMain = `$${Number(offer.price).toFixed(2)}`
	} else {
		priceMain = `$${offer.price_min} – $${offer.price_max}`
		priceSub = 'monto variable'
	}

	return (
		<Pressable
			onPress={onSelect}
			style={[
				styles.offerRow,
				selected
					? { backgroundColor: theme.colors.primary + '12', borderWidth: 1, borderColor: theme.colors.primary }
					: { backgroundColor: theme.colors.surface, ...(theme.mode === 'light' && { borderWidth: 1, borderColor: theme.colors.border }) },
			]}
		>
			<View style={{ flex: 1 }}>
				<View style={{ flexDirection: 'row', alignItems: 'center' }}>
					<Text numberOfLines={1} style={[textStyles.h6, { color: theme.colors.primaryText, fontWeight: '600', flexShrink: 1 }]}>
						{received || offer.brand || '—'}
					</Text>
					{!!offer.sub_type && (
						<Text style={[textStyles.caption, { marginLeft: 8, color: offer.sub_type === 'DIGITAL' ? '#10b981' : '#3b82f6', fontWeight: '600' }]}>
							{offer.sub_type}
						</Text>
					)}
				</View>
				{secondary && (
					<Text style={[textStyles.caption, { color: theme.colors.tertiaryText, marginTop: 2 }]}>{secondary}</Text>
				)}
			</View>
			<View style={{ alignItems: 'flex-end', marginLeft: 10 }}>
				<Text style={[textStyles.caption, { color: theme.colors.tertiaryText, textTransform: 'uppercase', fontSize: 10 }]}>Pagas</Text>
				<Text style={[textStyles.h5, { color: theme.colors.primaryText, fontWeight: '600' }]}>{priceMain}</Text>
				{priceSub && (
					<Text style={[textStyles.caption, { color: theme.colors.tertiaryText }]}>{priceSub}</Text>
				)}
			</View>
		</Pressable>
	)
}

const SummaryRow = ({ label, value, bold, highlight, theme, textStyles }) => (
	<View style={styles.summaryRow}>
		<Text style={[textStyles.caption, { color: highlight ? theme.colors.success : theme.colors.tertiaryText, fontWeight: highlight ? '700' : '500' }]}>{label}</Text>
		<Text style={[textStyles.h6, { color: theme.colors.primaryText, fontWeight: bold ? '700' : '500', flexShrink: 1, textAlign: 'right' }]} numberOfLines={2}>
			{value}
		</Text>
	</View>
)

// Fetched brand data and the purchase-wizard selection are two cohesive units
function dataReducer(state, action) {
	switch (action.type) {
		case 'set':
			return { ...state, [action.field]: action.value }
		default:
			return state
	}
}

function purchaseReducer(state, action) {
	switch (action.type) {
		case 'set':
			return { ...state, [action.field]: action.value }
		case 'selectOffer':
			// Picking a non-range offer clears any typed range amount
			return { ...state, selectedOffer: action.offer, rangeAmount: action.offer.price_type !== 'RANGE' ? '' : state.rangeAmount }
		default:
			return state
	}
}

const GiftCardBrand = ({ navigation, route }) => {

	const { country: initCountry, countryCode, brandSlug } = route.params || {}

	const { user } = useAuth()
	const { theme } = useTheme()
	const containerStyles = createContainerStyles(theme)
	const textStyles = createTextStyles(theme)
	const insets = useSafeAreaInsets()

	const [data, dispatchData] = useReducer(dataReducer, { country: initCountry || null, brand: '', brandLogo: null, offers: [] })
	const { country, brand, brandLogo, offers } = data
	const [purchase, dispatchPurchase] = useReducer(purchaseReducer, { selectedOffer: null, rangeAmount: '', step: 1 })
	const { selectedOffer, rangeAmount, step } = purchase
	const [loading, setLoading] = useState(true)
	const [submitting, setSubmitting] = useState(false)

	useLayoutEffect(() => {
		const raw = parseFloat(user?.balance || 0)
		if (Number.isNaN(raw)) return

		const balanceNode = (
			<Text style={[textStyles.h5, { color: theme.colors.primaryText, marginRight: 12 }]}>
				${tinyfiNumber(raw)}
			</Text>
		)

		navigation.setOptions({
			headerTitle: brand || '',
			headerRight: () => balanceNode,
			...(supportsLiquidGlass && {
				unstable_headerRightItems: () => [{
					type: 'custom',
					element: balanceNode,
					hidesSharedBackground: true,
				}],
			}),
		})
	}, [navigation, user?.balance, theme, textStyles.h5, brand])

	useEffect(() => {
		(async () => {
			setLoading(true)
			const res = await storeApi.getVoucherCatalog({ country: countryCode, brand: brandSlug })
			if (res.success) {
				dispatchData({ type: 'set', field: 'offers', value: res.data?.offers || [] })
				dispatchData({ type: 'set', field: 'brand', value: res.data?.brand || brandSlug })
				dispatchData({ type: 'set', field: 'brandLogo', value: res.data?.brand_logo_url || null })
				// Only fall back to the fetched country when the route didn't supply one
				if (res.data?.country && !initCountry) dispatchData({ type: 'set', field: 'country', value: res.data.country })
			} else { toast.error('Tarjeta', { description: res.error || 'No se pudo cargar la tarjeta' }) }
			setLoading(false)
		})()
	}, [countryCode, brandSlug, initCountry])

	const offerPrice = useMemo(() => {
		if (!selectedOffer) return 0
		if (selectedOffer.price_type === 'FIXED') return Number(selectedOffer.price)
		const baseUsd = parseFloat(rangeAmount) || 0
		const fee = Number(selectedOffer.service_fee_pct || 0)
		return baseUsd + (baseUsd * fee) / 100
	}, [selectedOffer, rangeAmount])

	const hasBalance = user?.balance != null ? Number(user.balance) >= offerPrice : false

	const handleContinue = useCallback(() => {
		if (!selectedOffer) { toast.error('Selecciona una denominación'); return }
		if (selectedOffer.price_type === 'RANGE') {
			const min = Number(selectedOffer.price_min || 0)
			const max = Number(selectedOffer.price_max || 0)
			const amt = parseFloat(rangeAmount)
			if (!amt || amt < min || amt > max) { toast.error(`Monto entre $${min} y $${max}`); return }
		}
		dispatchPurchase({ type: 'set', field: 'step', value: 2 })
	}, [selectedOffer, rangeAmount])

	const handleConfirm = useCallback(async () => {
		if (!selectedOffer) return
		if (!hasBalance) { toast.error('Saldo insuficiente'); return }
		setSubmitting(true)
		const body = {
			offer_id: selectedOffer.offer_id,
			country: countryCode,
			brand,
		}
		if (selectedOffer.price_type === 'RANGE') body.amount = parseFloat(rangeAmount)
		const res = await storeApi.purchaseVoucher(body)
		setSubmitting(false)
		if (res.success) {
			toast.success('¡Compra realizada!', { description: 'Tu tarjeta se está procesando' })
			navigation.goBack()
		} else {
			toast.error('Error', { description: res.error })
		}
	}, [selectedOffer, hasBalance, countryCode, brand, rangeAmount, navigation])

	if (loading) {
		return (
			<View style={[containerStyles.subContainer, { justifyContent: 'center', alignItems: 'center' }]}>
				<QPLoader />
			</View>
		)
	}

	if (offers.length === 0) {
		return (
			<View style={[containerStyles.subContainer, { padding: 24 }]}>
				<Text style={[textStyles.h4, { color: theme.colors.primaryText, fontWeight: '600' }]}>
					{brand} · {country?.name}
				</Text>
				<Text style={[textStyles.h6, { color: theme.colors.tertiaryText, marginTop: 8 }]}>
					No hay denominaciones activas.
				</Text>
			</View>
		)
	}

	return (
		<View style={containerStyles.subContainer}>
			<ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: insets.bottom }}>

				<View style={styles.header}>
					<OperatorAvatar brand={brand} logoUrl={brandLogo} size="lg" />
					<View style={{ flex: 1, marginLeft: 12 }}>
						<Text style={[textStyles.h3, { color: theme.colors.primaryText, fontWeight: '600' }]} numberOfLines={1}>{brand}</Text>
						<Text style={[textStyles.caption, { color: theme.colors.tertiaryText }]}>
							{country?.flag} {country?.name} · {offers.length} {offers.length === 1 ? 'denominación' : 'denominaciones'}
						</Text>
					</View>
				</View>

				{step === 1 && (
					<View style={styles.section}>
						<Text style={[textStyles.h6, { color: theme.colors.primaryText, fontWeight: '600', marginBottom: 10 }]}>
							Selecciona una denominación
						</Text>
						<View style={{ gap: 8 }}>
							{offers.map((offer, idx) => (
								<OfferRow
									key={offer.offer_id || idx}
									offer={offer}
									selected={selectedOffer === offer}
									theme={theme}
									textStyles={textStyles}
									onSelect={() => dispatchPurchase({ type: 'selectOffer', offer })}
								/>
							))}
						</View>

						{selectedOffer?.price_type === 'RANGE' && (
							<View style={[styles.rangeBox, { borderWidth: 1, borderColor: theme.colors.primary + '40', backgroundColor: theme.colors.primary + '08' }]}>
								<Text style={[textStyles.caption, { color: theme.colors.secondaryText, marginBottom: 6 }]}>
									Monto USD (entre ${selectedOffer.price_min} y ${selectedOffer.price_max})
								</Text>
								<TextInput
									value={rangeAmount}
									onChangeText={(v) => dispatchPurchase({ type: 'set', field: 'rangeAmount', value: v })}
									keyboardType="decimal-pad"
									placeholder={`${selectedOffer.price_min}`}
									placeholderTextColor={theme.colors.placeholder}
									style={[styles.rangeInput, { color: theme.colors.primaryText, backgroundColor: theme.colors.surface }, theme.mode === 'light' && { borderWidth: 0.5, borderColor: theme.colors.border }]}
								/>
							</View>
						)}
					</View>
				)}

				{step === 2 && selectedOffer && (
					<View style={styles.section}>
						<View style={[styles.summary, { backgroundColor: theme.colors.surface }, theme.mode === 'light' && { borderWidth: 0.5, borderColor: theme.colors.border }]}>
							<Text style={[textStyles.h5, { color: theme.colors.primaryText, fontWeight: '600', marginBottom: 12 }]}>
								Confirmar compra
							</Text>
							<SummaryRow theme={theme} textStyles={textStyles} label="Marca" value={`${brand} (${country?.name})`} />
							<SummaryRow theme={theme} textStyles={textStyles} label="Recibes" value={getReceivedValue(selectedOffer) || 'Según indica la marca'} highlight />
							{(() => {
								const sendStr = formatSendValue(selectedOffer.send)
								const received = getReceivedValue(selectedOffer)
								return sendStr && received !== sendStr
									? <SummaryRow theme={theme} textStyles={textStyles} label="Valor referencia" value={sendStr} />
									: null
							})()}
							<SummaryRow theme={theme} textStyles={textStyles} label="Total" value={`$${offerPrice.toFixed(2)} USD`} bold />
							<SummaryRow theme={theme} textStyles={textStyles} label="Tu saldo" value={`$${Number(user?.balance ?? 0).toFixed(2)} USD`} />
						</View>
						{!hasBalance && (
							<Text style={[textStyles.caption, { color: theme.colors.danger, marginTop: 8 }]}>
								Saldo insuficiente.
							</Text>
						)}
					</View>
				)}

				<View style={{ marginTop: 18, gap: 12 }}>
					{step === 1 ? (
						<QPButton
							title={selectedOffer ? `Continuar · $${offerPrice.toFixed(2)}` : 'Selecciona una denominación'}
							onPress={handleContinue}
							disabled={!selectedOffer || (selectedOffer?.price_type === 'RANGE' && !rangeAmount)}
						/>
					) : (
						<View style={{ flexDirection: 'row', gap: 10 }}>
							<View style={{ flex: 1 }}>
								<QPButton title="Atrás" onPress={() => dispatchPurchase({ type: 'set', field: 'step', value: 1 })} disabled={submitting} />
							</View>
							<View style={{ flex: 2 }}>
								<QPButton
									title={submitting ? 'Procesando…' : 'Confirmar'}
									onPress={handleConfirm}
									disabled={submitting || !hasBalance}
									loading={submitting}
								/>
							</View>
						</View>
					)}
				</View>
			</ScrollView>
		</View>
	)
}

const styles = StyleSheet.create({
	header: {
		flexDirection: 'row',
		alignItems: 'center',
		paddingVertical: 12,
		marginBottom: 6,
	},
	section: { marginBottom: 18 },
	offerRow: {
		flexDirection: 'row',
		alignItems: 'center',
		padding: 14,
		borderRadius: 12,
	},
	rangeBox: {
		marginTop: 10,
		padding: 12,
		borderRadius: 10,
	},
	rangeInput: {
		padding: 10,
		borderRadius: 8,
		fontSize: 16,
		fontWeight: '600',
	},
	summary: {
		padding: 16,
		borderRadius: 14,
	},
	summaryRow: {
		flexDirection: 'row',
		justifyContent: 'space-between',
		alignItems: 'flex-start',
		paddingVertical: 6,
		gap: 12,
	},
})

export default GiftCardBrand
