import { useState, useEffect, useMemo, useLayoutEffect, useCallback } from 'react'
import { View, Text, StyleSheet, ScrollView, Pressable, TextInput, Platform } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import FontAwesome6 from '@react-native-vector-icons/fontawesome6'
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

const SUB_TYPE_LABEL = {
	MOBILE: 'Saldo',
	DATA: 'Datos',
	BUNDLE: 'Combo',
	EXTERIOR: 'Exterior',
	P2P: 'Local',
}
const SUB_TYPE_COLOR = {
	MOBILE: '#3b82f6',
	DATA: '#10b981',
	BUNDLE: '#8b5cf6',
	EXTERIOR: '#f59e0b',
	P2P: '#06b6d4',
}
const SUBTYPE_TABS = [
	{ key: 'ALL', label: 'Todos' },
	{ key: 'MOBILE', label: 'Saldo' },
	{ key: 'DATA', label: 'Datos' },
	{ key: 'BUNDLE', label: 'Combo' },
]

const extractBenefits = (text) => {
	if (!text) return []
	return String(text).split(/[•|·]+/).map(s => s.trim()).filter(Boolean).filter(s => s.length <= 60).slice(0, 3)
}
const extractHeadline = (text) => {
	if (!text) return ''
	const first = String(text).split(/[•|·]+/)[0]?.trim()
	return first || String(text).slice(0, 60)
}

const OfferRow = ({ offer, selected, isGold, onSelect, theme, textStyles }) => {

	const isPhonePackage = offer.source === 'cuba'
	const subTypeKey = (offer.sub_type || 'MOBILE').toUpperCase()
	const subTypeLabel = SUB_TYPE_LABEL[subTypeKey] || subTypeKey
	const subTypeColor = SUB_TYPE_COLOR[subTypeKey] || SUB_TYPE_COLOR.MOBILE

	const headline = isPhonePackage ? offer.name : extractHeadline(offer.notes || offer.name)
	const description = !isPhonePackage && offer.notes && offer.notes !== headline ? offer.notes : null
	const benefits = isPhonePackage
		? (Array.isArray(offer.notes) ? offer.notes : extractBenefits(offer.notes))
		: extractBenefits(offer.sent_benefits)

	let priceMain
	let priceSub = null
	if (isPhonePackage) {
		const golden = isGold && offer.gold_price && Number(offer.gold_price) < Number(offer.price)
		if (golden) {
			priceMain = `$${Number(offer.gold_price).toFixed(2)}`
			priceSub = `$${Number(offer.price).toFixed(2)}`
		} else { priceMain = `$${Number(offer.price).toFixed(2)}` }
	} else if (offer.price_type === 'FIXED') {
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
						{headline || '—'}
					</Text>
					<Text style={[textStyles.caption, { color: subTypeColor, marginLeft: 8, fontWeight: '600' }]}>
						{subTypeLabel}
					</Text>
				</View>
				{description && (
					<Text numberOfLines={1} style={[textStyles.caption, { color: theme.colors.secondaryText, marginTop: 2 }]}>
						{description}
					</Text>
				)}
				{(benefits.length > 0 || offer.period || (isPhonePackage && offer.external)) && (
					<View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 4, gap: 8 }}>
						{offer.period && <Text style={[textStyles.caption, { color: theme.colors.tertiaryText }]}>{offer.period}</Text>}
						{isPhonePackage && offer.external && <Text style={[textStyles.caption, { color: '#f59e0b' }]}>Exterior</Text>}
						{benefits.map((b, i) => (
							<Text key={i} style={[textStyles.caption, { color: theme.colors.tertiaryText }]}>{b}</Text>
						))}
					</View>
				)}
			</View>
			<View style={{ alignItems: 'flex-end', marginLeft: 10 }}>
				<Text style={[textStyles.h5, { color: theme.colors.primaryText, fontWeight: '700' }]}>{priceMain}</Text>
				{priceSub && (
					<Text style={[textStyles.caption, {
						color: theme.colors.tertiaryText,
						textDecorationLine: isPhonePackage && isGold ? 'line-through' : 'none',
					}]}>{priceSub}</Text>
				)}
			</View>
		</Pressable>
	)
}

const PhoneTopupBrand = ({ navigation, route }) => {

	const { country: initCountry, countryCode, brandSlug } = route.params || {}

	const { user } = useAuth()
	const { theme } = useTheme()
	const containerStyles = createContainerStyles(theme)
	const textStyles = createTextStyles(theme)
	const insets = useSafeAreaInsets()
	const isGold = user?.golden_check

	const [country, setCountry] = useState(initCountry || null)
	const [brand, setBrand] = useState('')
	const [brandLogo, setBrandLogo] = useState(null)
	const [offers, setOffers] = useState([])
	const [phoneNumber, setPhoneNumber] = useState('')
	const [phoneFocused, setPhoneFocused] = useState(false)
	const [selectedOffer, setSelectedOffer] = useState(null)
	const [rangeAmount, setRangeAmount] = useState('')
	const [activeTab, setActiveTab] = useState('ALL')
	const [step, setStep] = useState(1)
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

	const availableSubTypes = useMemo(() => {
		const set = new Set(offers.map(o => (o.sub_type || 'MOBILE').toUpperCase()))
		return SUBTYPE_TABS.filter(t => t.key === 'ALL' || set.has(t.key))
	}, [offers])

	const visibleOffers = useMemo(() => {
		if (activeTab === 'ALL') return offers
		return offers.filter(o => (o.sub_type || 'MOBILE').toUpperCase() === activeTab)
	}, [offers, activeTab])

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
				<Text style={[textStyles.h4, { color: theme.colors.primaryText, fontWeight: '700' }]}>
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
						<Text style={[textStyles.h3, { color: theme.colors.primaryText, fontWeight: '700' }]} numberOfLines={1}>{brand}</Text>
						<Text style={[textStyles.caption, { color: theme.colors.tertiaryText }]}>
							{country?.flag} {country?.name} · {offers.length} {offers.length === 1 ? 'plan' : 'planes'}
						</Text>
					</View>
				</View>

				{step === 1 && (
					<>
						{/* Phone input — país bloqueado al del brand, sin selector */}
						<View style={styles.section}>
							<Text style={[textStyles.h6, { color: theme.colors.primaryText, fontWeight: '600', marginBottom: 8 }]}>
								<FontAwesome6 name="phone" size={12} color={theme.colors.primaryText} iconStyle="solid" />  Número del destinatario
							</Text>

							<View style={[
								styles.phoneRow,
								{
									backgroundColor: theme.colors.surface,
									borderColor: phoneValid
										? theme.colors.primary
										: phoneFocused
											? theme.colors.primary + '55'
											: theme.mode === 'light'
												? theme.colors.border
												: 'transparent',
								},
							]}>
								<View style={[styles.dialBadge, { backgroundColor: theme.colors.elevation }]}>
									<Text style={styles.flagEmoji}>{country?.flag}</Text>
									<Text style={[textStyles.h6, { color: theme.colors.primaryText, fontWeight: '700' }]}>
										{country?.dial}
									</Text>
								</View>
								<TextInput
									value={phoneNumber}
									onChangeText={setPhoneNumber}
									onFocus={() => setPhoneFocused(true)}
									onBlur={() => setPhoneFocused(false)}
									placeholder="Número local"
									placeholderTextColor={theme.colors.placeholder}
									keyboardType="phone-pad"
									style={[styles.phoneInput, { color: theme.colors.primaryText }]}
								/>
								{phoneValid && (
									<FontAwesome6 name="circle-check" size={18} color={theme.colors.success} iconStyle="solid" />
								)}
							</View>

							{!phoneValid && phoneNumber.length > 0 ? (
								<View style={styles.hintRow}>
									<FontAwesome6 name="circle-exclamation" size={11} color={theme.colors.danger} iconStyle="solid" />
									<Text style={[textStyles.caption, { color: theme.colors.danger, marginLeft: 6 }]}>
										Número inválido para {country?.name}
									</Text>
								</View>
							) : (
								<View style={styles.hintRow}>
									<FontAwesome6 name="circle-info" size={11} color={theme.colors.tertiaryText} iconStyle="solid" />
									<Text style={[textStyles.caption, { color: theme.colors.tertiaryText, marginLeft: 6 }]}>
										Solo números de {country?.flag} {country?.name}
									</Text>
								</View>
							)}
						</View>

						{/* SubType tabs */}
						{availableSubTypes.length > 2 && (
							<View style={[styles.tabs, theme.mode === 'light' && { borderBottomWidth: 0.5, borderBottomColor: theme.colors.border }]}>
								{availableSubTypes.map(t => {
									const active = activeTab === t.key
									const cnt = t.key === 'ALL'
										? offers.length
										: offers.filter(o => (o.sub_type || 'MOBILE').toUpperCase() === t.key).length
									return (
										<Pressable
											key={t.key}
											onPress={() => setActiveTab(t.key)}
											style={[styles.tab, { borderBottomColor: active ? theme.colors.primary : 'transparent' }]}
										>
											<Text style={[textStyles.h6, { color: active ? theme.colors.primary : theme.colors.tertiaryText, fontWeight: '600' }]}>
												{t.label} <Text style={{ color: theme.colors.tertiaryText, fontSize: 12 }}>{cnt}</Text>
											</Text>
										</Pressable>
									)
								})}
							</View>
						)}

						{/* Offer list */}
						<View style={styles.section}>
							<Text style={[textStyles.h6, { color: theme.colors.primaryText, fontWeight: '600', marginBottom: 10 }]}>
								Selecciona un plan
							</Text>
							<View style={{ gap: 8 }}>
								{visibleOffers.map((offer, idx) => (
									<OfferRow
										key={offer.offer_id || offer.phone_package_id || idx}
										offer={offer}
										selected={selectedOffer === offer}
										isGold={isGold}
										theme={theme}
										textStyles={textStyles}
										onSelect={() => { setSelectedOffer(offer); if (offer.price_type !== 'RANGE') setRangeAmount('') }}
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
										onChangeText={setRangeAmount}
										keyboardType="decimal-pad"
										placeholder={`${selectedOffer.price_min}`}
										placeholderTextColor={theme.colors.placeholder}
										style={[styles.rangeInput, { color: theme.colors.primaryText, backgroundColor: theme.colors.surface }, theme.mode === 'light' && { borderWidth: 0.5, borderColor: theme.colors.border }]}
									/>
								</View>
							)}
						</View>
					</>
				)}

				{step === 2 && selectedOffer && (
					<View style={styles.section}>
						<View style={[styles.summary, { backgroundColor: theme.colors.surface }, theme.mode === 'light' && { borderWidth: 0.5, borderColor: theme.colors.border }]}>
							<Text style={[textStyles.h5, { color: theme.colors.primaryText, fontWeight: '700', marginBottom: 12 }]}>
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
	phoneRow: {
		flexDirection: 'row',
		alignItems: 'center',
		padding: 6,
		paddingRight: 14,
		borderRadius: 14,
		borderWidth: 1.5,
		gap: 12,
	},
	dialBadge: {
		flexDirection: 'row',
		alignItems: 'center',
		paddingHorizontal: 12,
		paddingVertical: 10,
		borderRadius: 10,
		gap: 8,
	},
	flagEmoji: {
		fontSize: 20,
	},
	phoneInput: {
		flex: 1,
		fontSize: 18,
		fontWeight: '600',
		letterSpacing: 0.3,
	},
	hintRow: {
		flexDirection: 'row',
		alignItems: 'center',
		marginTop: 8,
		paddingHorizontal: 4,
	},
	tabs: {
		flexDirection: 'row',
		marginBottom: 16,
	},
	tab: {
		paddingHorizontal: 12,
		paddingVertical: 10,
		marginRight: 4,
		borderBottomWidth: 2,
	},
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

export default PhoneTopupBrand
