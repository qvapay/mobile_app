import { useState, useEffect, useMemo, useLayoutEffect, useCallback, useReducer } from 'react'
import { View, Text, StyleSheet, ScrollView, Platform } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import FontAwesome6 from '@react-native-vector-icons/fontawesome6'
import { toast } from 'sonner-native'

const supportsLiquidGlass = Platform.OS === 'ios' && parseInt(String(Platform.Version), 10) >= 26

import { useTheme } from '../../theme/ThemeContext'
import { createContainerStyles, createTextStyles } from '../../theme/themeUtils'

import QPButton from '../../ui/particles/QPButton'
import QPLoader from '../../ui/particles/QPLoader'
import OperatorAvatar from '../../ui/store/OperatorAvatar'
import PhoneTopupStep1 from './PhoneTopupStep1'

import { useAuth } from '../../auth/AuthContext'
import { storeApi } from '../../api/storeApi'
import { tinyfiNumber } from '../../helpers'

// Fetched brand data + the purchase wizard selection are two cohesive units
function setFieldReducer(state, action) {
	switch (action.type) {
		case 'set':
			return { ...state, [action.field]: action.value }
		default:
			return state
	}
}

const PhoneTopupBrand = ({ navigation, route }) => {

	const { country: initCountry, countryCode, brandSlug } = route.params || {}

	const { user } = useAuth()
	const { theme } = useTheme()
	const containerStyles = createContainerStyles(theme)
	const textStyles = createTextStyles(theme)
	const insets = useSafeAreaInsets()
	const isGold = user?.golden_check

	// Fetched brand data (same-named setters keep every call site unchanged)
	const [data, dispatchData] = useReducer(setFieldReducer, { country: initCountry || null, brand: '', brandLogo: null, offers: [] })
	const { country, brand, brandLogo, offers } = data
	const setCountry = (value) => dispatchData({ type: 'set', field: 'country', value })
	const setBrand = (value) => dispatchData({ type: 'set', field: 'brand', value })
	const setBrandLogo = (value) => dispatchData({ type: 'set', field: 'brandLogo', value })
	const setOffers = (value) => dispatchData({ type: 'set', field: 'offers', value })

	// Purchase wizard selection
	const [purchase, dispatchPurchase] = useReducer(setFieldReducer, { phoneNumber: '', phoneFocused: false, selectedOffer: null, rangeAmount: '', activeTab: 'ALL', step: 1 })
	const { phoneNumber, phoneFocused, selectedOffer, rangeAmount, activeTab, step } = purchase
	const setPhoneNumber = (value) => dispatchPurchase({ type: 'set', field: 'phoneNumber', value })
	const setPhoneFocused = (value) => dispatchPurchase({ type: 'set', field: 'phoneFocused', value })
	const setSelectedOffer = (value) => dispatchPurchase({ type: 'set', field: 'selectedOffer', value })
	const setRangeAmount = (value) => dispatchPurchase({ type: 'set', field: 'rangeAmount', value })
	const setActiveTab = (value) => dispatchPurchase({ type: 'set', field: 'activeTab', value })
	const setStep = (value) => dispatchPurchase({ type: 'set', field: 'step', value })

	const [loading, setLoading] = useState(true)
	const [submitting, setSubmitting] = useState(false)

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

	useEffect(() => {
		(async () => {
			setLoading(true)
			const res = await storeApi.getTopupCatalog({ country: countryCode, brand: brandSlug })
			if (res.success) {
				setOffers(res.data?.offers || [])
				setBrand(res.data?.brand || brandSlug)
				setBrandLogo(res.data?.brand_logo_url || null)
				if (res.data?.country && !country) setCountry(res.data.country)
			} else {
				toast.error('Operador', { description: res.error || 'No se pudo cargar el operador' })
			}
			setLoading(false)
		})()
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [countryCode, brandSlug])

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

	const hasBalance = user?.balance != null ? Number(user.balance) >= offerPrice : false

	const handleContinue = useCallback(() => {
		if (!phoneValid || !selectedOffer) { toast.error('Selecciona un plan y un número válido'); return }
		if (selectedOffer.price_type === 'RANGE') {
			const min = Number(selectedOffer.price_min || 0)
			const max = Number(selectedOffer.price_max || 0)
			const amt = parseFloat(rangeAmount)
			if (!amt || amt < min || amt > max) { toast.error(`Monto entre $${min} y $${max}`); return }
		}
		setStep(2)
	}, [phoneValid, selectedOffer, rangeAmount])

	const handleConfirm = useCallback(async () => {
		if (!selectedOffer) return
		if (!hasBalance) { toast.error('Saldo insuficiente'); return }
		setSubmitting(true)
		let res
		if (selectedOffer.source === 'cuba') {
			res = await storeApi.purchasePhonePackage({
				phone_package_id: Number(selectedOffer.phone_package_id),
				phone_number: fullPhoneNumber,
			})
		} else {
			const body = {
				offer_id: selectedOffer.offer_id,
				phone_number: fullPhoneNumber,
				country: countryCode,
			}
			if (selectedOffer.price_type === 'RANGE') body.amount = parseFloat(rangeAmount)
			res = await storeApi.purchaseTopup(body)
		}
		setSubmitting(false)
		if (res.success) {
			toast.success('¡Recarga enviada!', { description: 'Tu recarga se está procesando' })
			navigation.goBack()
		} else {
			toast.error('Error', { description: res.error })
		}
	}, [selectedOffer, fullPhoneNumber, hasBalance, countryCode, rangeAmount, navigation])

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
					No hay planes activos en este momento.
				</Text>
			</View>
		)
	}

	return (
		<View style={containerStyles.subContainer}>
			<ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: insets.bottom }}>

				{/* Header */}
				<View style={styles.header}>
					<OperatorAvatar brand={brand} logoUrl={brandLogo} size="lg" />
					<View style={{ flex: 1, marginLeft: 12 }}>
						<Text style={[textStyles.h3, { color: theme.colors.primaryText, fontWeight: '600' }]} numberOfLines={1}>{brand}</Text>
						<Text style={[textStyles.caption, { color: theme.colors.tertiaryText }]}>
							{country?.flag} {country?.name} · {offers.length} {offers.length === 1 ? 'plan' : 'planes'}
						</Text>
					</View>
				</View>

				{step === 1 && (
					<PhoneTopupStep1
						country={country}
						phoneNumber={phoneNumber}
						phoneFocused={phoneFocused}
						phoneValid={phoneValid}
						onChangePhone={setPhoneNumber}
						onFocusPhone={() => setPhoneFocused(true)}
						onBlurPhone={() => setPhoneFocused(false)}
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
								Confirmar recarga
							</Text>
							<SummaryRow theme={theme} textStyles={textStyles} label="Operador" value={`${brand} (${country?.name})`} />
							<SummaryRow theme={theme} textStyles={textStyles} label="Número" value={fullPhoneNumber} />
							<SummaryRow theme={theme} textStyles={textStyles} label="Plan" value={selectedOffer.name || selectedOffer.notes || '—'} />
							{selectedOffer.sent_benefits && (
								<SummaryRow theme={theme} textStyles={textStyles} label="Beneficios" value={selectedOffer.sent_benefits} />
							)}
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
							title={selectedOffer && phoneValid ? `Continuar · $${offerPrice.toFixed(2)}` : 'Selecciona plan y número'}
							onPress={handleContinue}
							disabled={!selectedOffer || !phoneValid || (selectedOffer?.price_type === 'RANGE' && !rangeAmount)}
						/>
					) : (
						<View style={{ flexDirection: 'row', gap: 10 }}>
							<View style={{ flex: 1 }}>
								<QPButton title="Atrás" onPress={() => setStep(1)} disabled={submitting} />
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

const SummaryRow = ({ label, value, bold, theme, textStyles }) => (
	<View style={styles.summaryRow}>
		<Text style={[textStyles.caption, { color: theme.colors.tertiaryText }]}>{label}</Text>
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
