import { useMemo } from 'react'
import { View, Text, Pressable, TextInput, StyleSheet } from 'react-native'
import FontAwesome6 from '@react-native-vector-icons/fontawesome6'

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

// Step 1 of the top-up wizard: recipient phone, plan-type tabs, plan list + range amount.
const PhoneTopupStep1 = ({ country, phoneNumber, phoneFocused, phoneValid, onChangePhone, onFocusPhone, onBlurPhone, offers, activeTab, onSelectTab, selectedOffer, rangeAmount, onSelectOffer, onChangeRange, isGold, theme, textStyles }) => {

	const availableSubTypes = useMemo(() => {
		const set = new Set(offers.map(o => (o.sub_type || 'MOBILE').toUpperCase()))
		return SUBTYPE_TABS.filter(t => t.key === 'ALL' || set.has(t.key))
	}, [offers])

	const visibleOffers = useMemo(() => {
		if (activeTab === 'ALL') return offers
		return offers.filter(o => (o.sub_type || 'MOBILE').toUpperCase() === activeTab)
	}, [offers, activeTab])

	return (
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
						onChangeText={onChangePhone}
						onFocus={onFocusPhone}
						onBlur={onBlurPhone}
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
								onPress={() => onSelectTab(t.key)}
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
							onSelect={() => onSelectOffer(offer)}
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
							onChangeText={onChangeRange}
							keyboardType="decimal-pad"
							placeholder={`${selectedOffer.price_min}`}
							placeholderTextColor={theme.colors.placeholder}
							style={[styles.rangeInput, { color: theme.colors.primaryText, backgroundColor: theme.colors.surface }, theme.mode === 'light' && { borderWidth: 0.5, borderColor: theme.colors.border }]}
						/>
					</View>
				)}
			</View>
		</>
	)
}

const styles = StyleSheet.create({
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
	flagEmoji: { fontSize: 20 },
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
})

export default PhoneTopupStep1
