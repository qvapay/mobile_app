import { useState, useEffect, useMemo, useLayoutEffect, useCallback, useReducer } from 'react'
import { View, Text, StyleSheet, ScrollView, Platform } from 'react-native'
import useContentPadding from '../../hooks/useContentPadding'
import FontAwesome6 from '@react-native-vector-icons/fontawesome6'
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
import PhoneTopupStep1 from './PhoneTopupStep1'

import { useAuth } from '../../auth/AuthContext'
import { storeApi } from '../../api/storeApi'
import { useTopupBrandDetailQuery } from './storeQueries'
import { tinyfiNumber } from '../../helpers'
import useSatsDiscount from './useSatsDiscount'

// Fetched brand data + the purchase wizard selection are two cohesive units
function setFieldReducer(state, action) {
	switch (action.type) {
		case 'set':
			return { ...state, [action.field]: action.value }
		default:
			return state
	}
}

/**
 * Top-up purchase wizard for one operator: phone number + plan, then confirm.
 * Route params: `countryCode`, `brandSlug` and optionally the `country` object.
 * Offers load from `GET /store/topup-catalog?country&brand`; Cuba (Cubacel) plans buy
 * via `POST /store/phone_package` (with gold pricing), all others via `POST /store/topup`.
 * The destination country is locked to the brand's — numbers are built as E.164 from the
 * catalog dial code and validated against the catalog regex. Balance (USD + sats) shows
 * in the header: iOS 26 liquid-glass `unstable_headerRightItems`, `headerRight` on Android.
 */
const PhoneTopupBrand = ({ navigation, route }) => {

	const { country: initCountry, countryCode, brandSlug } = route.params || {}

	const { t } = useTranslation()
	const { user } = useAuth()
	const { theme } = useTheme()
	const containerStyles = createContainerStyles(theme)
	const textStyles = createTextStyles(theme)
	const contentPadding = useContentPadding()
	const isGold = user?.golden_check

	// Fetched brand data (same-named setters keep every call site unchanged)
	// Detalle del operador en React Query (clave país+marca)
	const detailQuery = useTopupBrandDetailQuery(countryCode, brandSlug)
	const offers = detailQuery.data?.offers || []
	const brand = detailQuery.data?.brand || brandSlug
	const brandLogo = detailQuery.data?.brand_logo_url || null
	// Only fall back to the fetched country when the route didn't supply one
	const country = initCountry || detailQuery.data?.country || null

	// Purchase wizard selection
	const [purchase, dispatchPurchase] = useReducer(setFieldReducer, { phoneNumber: '', selectedOffer: null, rangeAmount: '', activeTab: 'ALL', step: 1 })
	const { phoneNumber, selectedOffer, rangeAmount, activeTab, step } = purchase
	const setPhoneNumber = (value) => dispatchPurchase({ type: 'set', field: 'phoneNumber', value })
	const setSelectedOffer = (value) => dispatchPurchase({ type: 'set', field: 'selectedOffer', value })
	const setRangeAmount = (value) => dispatchPurchase({ type: 'set', field: 'rangeAmount', value })
	const setActiveTab = (value) => dispatchPurchase({ type: 'set', field: 'activeTab', value })
	const setStep = (value) => dispatchPurchase({ type: 'set', field: 'step', value })

	const loading = detailQuery.isPending
	const [submitting, setSubmitting] = useState(false)

	// El toast solo cuando no hay NADA que pintar
	useEffect(() => {
		if (detailQuery.isError && !detailQuery.data) {
			toast.error(i18n.t('store.toasts.operator'), { description: detailQuery.error?.message || i18n.t('store.topupBrand.toasts.loadError') })
		}
	}, [detailQuery.isError, detailQuery.data, detailQuery.error])

	useLayoutEffect(() => {
		const usd = parseFloat(user?.balance || 0)
		if (Number.isNaN(usd)) return
		const sats = Number(user?.satoshis || 0)

		const balanceNode = (
			<View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginRight: 12 }}>
				<View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
					<FontAwesome6 name="bolt" size={12} color="#F7931A" iconStyle="solid" />
					<Text style={[textStyles.h6, { color: theme.colors.primaryText }]}>
						{sats.toLocaleString()}
					</Text>
				</View>
				<Text style={[textStyles.h5, { color: theme.colors.primaryText }]}>
					${tinyfiNumber(usd)}
				</Text>
			</View>
		)

		navigation.setOptions({
			headerTitle: '',
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

	// País bloqueado al del brand — el wizard de un operador no debería permitir
	// cambiar el destino (Cubacel = CU, Telcel = MX, etc.). Construimos el E.164
	// uniendo el dial del catálogo + dígitos locales del usuario.
	const fullPhoneNumber = useMemo(() => {
		const dial = country?.dial || ''
		const digits = phoneNumber.replace(/\D/g, '')
		if (!digits) return ''
		return `${dial}${digits.replace(/^0+/, '')}`
	}, [phoneNumber, country?.dial])

	const phoneValid = useMemo(() => {
		if (!fullPhoneNumber) return false
		if (!country?.pattern) return phoneNumber.replace(/\D/g, '').length >= 6
		try { return new RegExp(country.pattern).test(fullPhoneNumber) } catch { return false }
	}, [phoneNumber, country?.pattern, fullPhoneNumber])

	const offerPrice = useMemo(() => {
		if (!selectedOffer) return 0
		if (selectedOffer.source === 'cuba') {
			return isGold && selectedOffer.gold_price ? Number(selectedOffer.gold_price) : Number(selectedOffer.price)
		}
		if (selectedOffer.price_type === 'FIXED') return Number(selectedOffer.price)
		const baseUsd = parseFloat(rangeAmount) || 0
		const feePct = Number(selectedOffer.service_fee_pct || 0)
		return baseUsd + (baseUsd * feePct) / 100
	}, [selectedOffer, rangeAmount, isGold])

	// Descuento en sats: estimado client-side, el server recalcula fresh en la compra.
	// cashDue == offerPrice cuando el toggle está apagado.
	const satsDiscount = useSatsDiscount(offerPrice)
	const hasBalance = user?.balance != null ? Number(user.balance) >= satsDiscount.cashDue : false

	const handleContinue = useCallback(() => {
		if (!phoneValid || !selectedOffer) { toast.error(i18n.t('store.topupBrand.toasts.selectPlanAndNumber')); return }
		if (selectedOffer.price_type === 'RANGE') {
			const min = Number(selectedOffer.price_min || 0)
			const max = Number(selectedOffer.price_max || 0)
			const amt = parseFloat(rangeAmount)
			if (!amt || amt < min || amt > max) { toast.error(i18n.t('store.toasts.amountBetween', { min: `$${min}`, max: `$${max}` })); return }
		}
		setStep(2)
	}, [phoneValid, selectedOffer, rangeAmount])

	const handleConfirm = useCallback(async () => {
		if (!selectedOffer) return
		if (!hasBalance) { toast.error(i18n.t('store.toasts.insufficientBalance')); return }
		setSubmitting(true)
		let res
		if (selectedOffer.source === 'cuba') {
			const body = {
				phone_package_id: Number(selectedOffer.phone_package_id),
				phone_number: fullPhoneNumber,
			}
			if (satsDiscount.enabled) body.use_satoshis = true
			res = await storeApi.purchasePhonePackage(body)
		} else {
			const body = {
				offer_id: selectedOffer.offer_id,
				phone_number: fullPhoneNumber,
				country: countryCode,
			}
			if (selectedOffer.price_type === 'RANGE') body.amount = parseFloat(rangeAmount)
			if (satsDiscount.enabled) body.use_satoshis = true
			res = await storeApi.purchaseTopup(body)
		}
		setSubmitting(false)
		if (res.success) {
			// Reflejar el gasto real (cash_paid) y los sats restantes sin refetch
			satsDiscount.applyPurchaseResult(res.data, offerPrice)
			toast.success(i18n.t('store.topupBrand.toasts.sent'), { description: i18n.t('store.topupBrand.toasts.sentDescription') })
			navigation.goBack()
		} else {
			toast.error(i18n.t('store.toasts.error'), { description: res.error })
		}
	}, [selectedOffer, fullPhoneNumber, hasBalance, countryCode, rangeAmount, satsDiscount, offerPrice, navigation])

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
					{t('store.topupBrand.noActivePlans')}
				</Text>
			</View>
		)
	}

	return (
		<View style={containerStyles.subContainer}>
			<ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={contentPadding}>

				{/* Header */}
				<View style={styles.header}>
					<OperatorAvatar brand={brand} logoUrl={brandLogo} size="lg" />
					<View style={{ flex: 1, marginLeft: 12 }}>
						<Text style={[textStyles.h3, { color: theme.colors.primaryText, fontWeight: '600' }]} numberOfLines={1}>{brand}</Text>
						<Text style={[textStyles.caption, { color: theme.colors.tertiaryText }]}>
							{country?.flag} {country?.name} · {t('store.common.plans', { count: offers.length })}
						</Text>
					</View>
				</View>

				{step === 1 && (
					<PhoneTopupStep1
						country={country}
						phoneNumber={phoneNumber}
						phoneValid={phoneValid}
						onChangePhone={setPhoneNumber}
						offers={offers}
						activeTab={activeTab}
						onSelectTab={setActiveTab}
						selectedOffer={selectedOffer}
						rangeAmount={rangeAmount}
						onSelectOffer={(offer) => { setSelectedOffer(offer); if (offer.price_type !== 'RANGE') setRangeAmount('') }}
						onChangeRange={setRangeAmount}
						isGold={isGold}
						theme={theme}
						textStyles={textStyles}
					/>
				)}

				{step === 2 && selectedOffer && (
					<View style={styles.section}>
						<View style={[styles.summary, { backgroundColor: theme.colors.surface }, theme.mode === 'light' && { borderWidth: 0.5, borderColor: theme.colors.border }]}>
							<Text style={[textStyles.h5, { color: theme.colors.primaryText, fontWeight: '600', marginBottom: 12 }]}>
								{t('store.topupBrand.confirmTitle')}
							</Text>
							<SummaryRow theme={theme} textStyles={textStyles} label={t('store.summary.operator')} value={`${brand} (${country?.name})`} />
							<SummaryRow theme={theme} textStyles={textStyles} label={t('store.summary.number')} value={fullPhoneNumber} />
							<SummaryRow theme={theme} textStyles={textStyles} label={t('store.summary.plan')} value={selectedOffer.name || selectedOffer.notes || '—'} />
							{selectedOffer.sent_benefits && (
								<SummaryRow theme={theme} textStyles={textStyles} label={t('store.summary.benefits')} value={selectedOffer.sent_benefits} />
							)}
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
							title={selectedOffer && phoneValid ? t('store.common.continueWithAmount', { amount: `$${offerPrice.toFixed(2)}` }) : t('store.topupBrand.selectPlanAndNumberCta')}
							onPress={handleContinue}
							disabled={!selectedOffer || !phoneValid || (selectedOffer?.price_type === 'RANGE' && !rangeAmount)}
						/>
					) : (
						<View style={{ flexDirection: 'row', gap: 10 }}>
							<View style={{ flex: 1 }}>
								<QPButton title={t('store.common.back')} onPress={() => setStep(1)} disabled={submitting} />
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

const SummaryRow = ({ label, value, bold, highlight, theme, textStyles }) => (
	<View style={styles.summaryRow}>
		<Text style={[textStyles.caption, { color: highlight ? theme.colors.successText : theme.colors.tertiaryText, fontWeight: highlight ? '700' : undefined }]}>{label}</Text>
		<Text style={[textStyles.h6, { color: theme.colors.primaryText, fontWeight: bold ? '700' : '500', flexShrink: 1, textAlign: 'right' }]} numberOfLines={2}>
			{value}
		</Text>
	</View>
)

const styles = StyleSheet.create({
	header: {
		flexDirection: 'row',
		alignItems: 'center',
		paddingVertical: 12,
		marginBottom: 6,
	},
	section: { marginBottom: 18 },
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

export default PhoneTopupBrand
