import { useState, useEffect, useMemo, useLayoutEffect, useCallback, useReducer } from 'react'
import { View, Text, StyleSheet, ScrollView, Pressable, TextInput, Platform } from 'react-native'
import useContentPadding from '../../hooks/useContentPadding'

// Toast
import { toast } from 'sonner-native'
import { useTranslation } from 'react-i18next'
import i18n from '../../i18n'

const supportsLiquidGlass = Platform.OS === 'ios' && parseInt(String(Platform.Version), 10) >= 26

import { useTheme } from '../../theme/ThemeContext'
import { createContainerStyles, createTextStyles } from '../../theme/themeUtils'

import QPButton from '../../ui/particles/QPButton'
import QPLoader from '../../ui/particles/QPLoader'
import OperatorAvatar from '../../ui/store/OperatorAvatar'
import SatsDiscountRow from '../../ui/store/SatsDiscountRow'
import FontAwesome6 from '@react-native-vector-icons/fontawesome6'

import { useAuth } from '../../auth/AuthContext'
import { storeApi } from '../../api/storeApi'
import { useVoucherBrandDetailQuery } from './storeQueries'
import { tinyfiNumber } from '../../helpers'
import { sanitizeAmountInput } from '../../helpers/amountInput'
import useSatsDiscount from './useSatsDiscount'

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

	const { t } = useTranslation()
	const received = getReceivedValue(offer)
	const sendStr = formatSendValue(offer.send)
	const secondary = sendStr && received !== sendStr ? t('store.giftCardBrand.valueLabel', { value: sendStr }) : null

	let priceMain
	let priceSub = null
	if (offer.price_type === 'FIXED') {
		priceMain = `$${Number(offer.price).toFixed(2)}`
	} else {
		priceMain = `$${offer.price_min} – $${offer.price_max}`
		priceSub = t('store.common.variableAmount')
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
				<Text style={[textStyles.caption, { color: theme.colors.tertiaryText, textTransform: 'uppercase', fontSize: 10 }]}>{t('store.summary.youPay')}</Text>
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
		<Text style={[textStyles.caption, { color: highlight ? theme.colors.successText : theme.colors.tertiaryText, fontWeight: highlight ? '700' : '500' }]}>{label}</Text>
		<Text style={[textStyles.h6, { color: theme.colors.primaryText, fontWeight: bold ? '700' : '500', flexShrink: 1, textAlign: 'right' }]} numberOfLines={2}>
			{value}
		</Text>
	</View>
)

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

/**
 * Gift-card purchase wizard for one brand: pick a denomination, then confirm.
 * Route params: `countryCode`, `brandSlug` and optionally the `country` object.
 * Offers load from `GET /store/voucher-catalog?country&brand`; the purchase posts to
 * `POST /store/voucher/purchase` (RANGE offers add a user-typed `amount` + service fee).
 * The user's balance renders in the header — iOS 26 liquid-glass via
 * `unstable_headerRightItems`, with a `headerRight` fallback for Android.
 */
const GiftCardBrand = ({ navigation, route }) => {

	const { country: initCountry, countryCode, brandSlug } = route.params || {}

	const { t } = useTranslation()
	const { user } = useAuth()
	const { theme } = useTheme()
	const containerStyles = createContainerStyles(theme)
	const textStyles = createTextStyles(theme)
	const contentPadding = useContentPadding()

	// Detalle de la marca en React Query (clave país+marca): volver a una
	// tarjeta ya vista pinta al instante desde caché
	const detailQuery = useVoucherBrandDetailQuery(countryCode, brandSlug)
	const offers = detailQuery.data?.offers || []
	const brand = detailQuery.data?.brand || brandSlug
	const brandLogo = detailQuery.data?.brand_logo_url || null
	// Only fall back to the fetched country when the route didn't supply one
	const country = initCountry || detailQuery.data?.country || null
	const [purchase, dispatchPurchase] = useReducer(purchaseReducer, { selectedOffer: null, rangeAmount: '', step: 1 })
	const { selectedOffer, rangeAmount, step } = purchase
	const loading = detailQuery.isPending
	const [submitting, setSubmitting] = useState(false)

	// El toast solo cuando no hay NADA que pintar
	useEffect(() => {
		if (detailQuery.isError && !detailQuery.data) {
			toast.error(i18n.t('store.toasts.card'), { description: detailQuery.error?.message || i18n.t('store.giftCardBrand.toasts.loadError') })
		}
	}, [detailQuery.isError, detailQuery.data, detailQuery.error])

	useLayoutEffect(() => {
		const raw = parseFloat(user?.balance || 0)
		if (Number.isNaN(raw)) return
		const sats = Number(user?.satoshis || 0)

		// Balance USD + sats de cashback (mismo pill bolt que PhoneTopupBrand)
		const balanceNode = (
			<View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginRight: 12 }}>
				{sats > 0 && (
					<View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
						<FontAwesome6 name="bolt" size={11} color="#F7931A" iconStyle="solid" />
						<Text style={[textStyles.h6, { color: theme.colors.secondaryText }]}>{sats.toLocaleString()}</Text>
					</View>
				)}
				<Text style={[textStyles.h5, { color: theme.colors.primaryText }]}>
					${tinyfiNumber(raw)}
				</Text>
			</View>
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
	}, [navigation, user?.balance, user?.satoshis, theme, textStyles.h5, textStyles.h6, brand])

	const offerPrice = useMemo(() => {
		if (!selectedOffer) return 0
		if (selectedOffer.price_type === 'FIXED') return Number(selectedOffer.price)
		const baseUsd = parseFloat(rangeAmount) || 0
		const fee = Number(selectedOffer.service_fee_pct || 0)
		return baseUsd + (baseUsd * fee) / 100
	}, [selectedOffer, rangeAmount])

	// Descuento en sats: estimado client-side, el server recalcula fresh en la compra.
	// cashDue == offerPrice cuando el toggle está apagado.
	const satsDiscount = useSatsDiscount(offerPrice)
	const hasBalance = user?.balance != null ? Number(user.balance) >= satsDiscount.cashDue : false

	const handleContinue = useCallback(() => {
		if (!selectedOffer) { toast.error(i18n.t('store.giftCardBrand.selectDenomination')); return }
		if (selectedOffer.price_type === 'RANGE') {
			const min = Number(selectedOffer.price_min || 0)
			const max = Number(selectedOffer.price_max || 0)
			const amt = parseFloat(rangeAmount)
			if (!amt || amt < min || amt > max) { toast.error(i18n.t('store.toasts.amountBetween', { min: `$${min}`, max: `$${max}` })); return }
		}
		dispatchPurchase({ type: 'set', field: 'step', value: 2 })
	}, [selectedOffer, rangeAmount])

	const handleConfirm = useCallback(async () => {
		if (!selectedOffer) return
		if (!hasBalance) { toast.error(i18n.t('store.toasts.insufficientBalance')); return }
		setSubmitting(true)
		const body = {
			offer_id: selectedOffer.offer_id,
			country: countryCode,
			brand,
		}
		if (selectedOffer.price_type === 'RANGE') body.amount = parseFloat(rangeAmount)
		if (satsDiscount.enabled) body.use_satoshis = true
		const res = await storeApi.purchaseVoucher(body)
		setSubmitting(false)
		if (res.success) {
			// Reflejar el gasto real (cash_paid) y los sats restantes sin refetch
			satsDiscount.applyPurchaseResult(res.data, offerPrice)
			toast.success(i18n.t('store.giftCardBrand.toasts.purchased'), { description: i18n.t('store.giftCardBrand.toasts.purchasedDescription') })
			navigation.goBack()
		} else {
			toast.error(i18n.t('store.toasts.error'), { description: res.error })
		}
	}, [selectedOffer, hasBalance, countryCode, brand, rangeAmount, satsDiscount, offerPrice, navigation])

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
					{t('store.giftCardBrand.noActiveDenominations')}
				</Text>
			</View>
		)
	}

	return (
		<View style={containerStyles.subContainer}>
			<ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={contentPadding}>

				<View style={styles.header}>
					<OperatorAvatar brand={brand} logoUrl={brandLogo} size="lg" />
					<View style={{ flex: 1, marginLeft: 12 }}>
						<Text style={[textStyles.h3, { color: theme.colors.primaryText, fontWeight: '600' }]} numberOfLines={1}>{brand}</Text>
						<Text style={[textStyles.caption, { color: theme.colors.tertiaryText }]}>
							{country?.flag} {country?.name} · {t('store.giftCardBrand.denominationCount', { count: offers.length })}
						</Text>
					</View>
				</View>

				{step === 1 && (
					<View style={styles.section}>
						<Text style={[textStyles.h6, { color: theme.colors.primaryText, fontWeight: '600', marginBottom: 10 }]}>
							{t('store.giftCardBrand.selectDenomination')}
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
									{t('store.common.amountUsdBetween', { min: `$${selectedOffer.price_min}`, max: `$${selectedOffer.price_max}` })}
								</Text>
								<TextInput
									value={rangeAmount}
									onChangeText={(v) => dispatchPurchase({ type: 'set', field: 'rangeAmount', value: sanitizeAmountInput(v) })}
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
								{t('store.giftCardBrand.confirmTitle')}
							</Text>
							<SummaryRow theme={theme} textStyles={textStyles} label={t('store.summary.brand')} value={`${brand} (${country?.name})`} />
							<SummaryRow theme={theme} textStyles={textStyles} label={t('store.summary.youReceive')} value={getReceivedValue(selectedOffer) || t('store.giftCardBrand.asBrandIndicates')} highlight />
							{(() => {
								const sendStr = formatSendValue(selectedOffer.send)
								const received = getReceivedValue(selectedOffer)
								return sendStr && received !== sendStr
									? <SummaryRow theme={theme} textStyles={textStyles} label={t('store.summary.referenceValue')} value={sendStr} />
									: null
							})()}
							<SummaryRow theme={theme} textStyles={textStyles} label={t('store.summary.total')} value={`$${offerPrice.toFixed(2)} USD`} bold={!satsDiscount.enabled} />
							{satsDiscount.available && (
								<SatsDiscountRow
									enabled={satsDiscount.enabled}
									onToggle={satsDiscount.setEnabled}
									sats={satsDiscount.sats}
									satsUsd={satsDiscount.satsUsd}
									theme={theme}
									textStyles={textStyles}
								/>
							)}
							{satsDiscount.enabled && (
								<>
									<SummaryRow theme={theme} textStyles={textStyles} label={t('store.summary.satsDiscount')} value={`≈ −$${satsDiscount.discountUsd.toFixed(2)}`} highlight />
									<SummaryRow theme={theme} textStyles={textStyles} label={t('store.summary.youPay')} value={`≈ $${satsDiscount.cashDue.toFixed(2)} USD`} bold />
								</>
							)}
							<SummaryRow theme={theme} textStyles={textStyles} label={t('store.summary.yourBalance')} value={`$${Number(user?.balance ?? 0).toFixed(2)} USD`} />
						</View>
						{!hasBalance && (
							<Text style={[textStyles.caption, { color: theme.colors.danger, marginTop: 8 }]}>
								{t('store.common.insufficientBalanceNote')}
							</Text>
						)}
					</View>
				)}

				<View style={{ marginTop: 18, gap: 12 }}>
					{step === 1 ? (
						<QPButton
							title={selectedOffer ? t('store.common.continueWithAmount', { amount: `$${offerPrice.toFixed(2)}` }) : t('store.giftCardBrand.selectDenomination')}
							onPress={handleContinue}
							disabled={!selectedOffer || (selectedOffer?.price_type === 'RANGE' && !rangeAmount)}
						/>
					) : (
						<View style={{ flexDirection: 'row', gap: 10 }}>
							<View style={{ flex: 1 }}>
								<QPButton title={t('store.common.back')} onPress={() => dispatchPurchase({ type: 'set', field: 'step', value: 1 })} disabled={submitting} />
							</View>
							<View style={{ flex: 2 }}>
								<QPButton
									title={submitting ? t('store.common.processing') : t('common.actions.confirm')}
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
