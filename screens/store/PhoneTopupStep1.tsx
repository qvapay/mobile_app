import { useMemo } from 'react'
import { View, Text, Pressable, TextInput, StyleSheet } from 'react-native'
import FontAwesome6 from '@react-native-vector-icons/fontawesome6'
import { useTranslation } from 'react-i18next'

import QPPhoneInput from '../../ui/QPPhoneInput'
import { sanitizeAmountInput } from '../../helpers/amountInput'

import type { Theme } from '../../theme/ThemeContext'
import type { TextStyles } from '../../theme/themeUtils'
import type { StoreCountry, StoreOffer } from './storeQueries'

// OJO: `theme.mode` no existe en el tema (siempre undefined) — bug de runtime
// pre-existente que se preserva tal cual; el alias es solo de tipos.
type ThemeWithMode = Theme & { mode?: string }

// Constantes de módulo con CLAVES de i18n (no copy): se resuelven con t() en
// render para que el idioma activo aplique en vivo
const SUB_TYPE_LABEL_KEY: Record<string, string> = {
	MOBILE: 'store.topupStep1.subTypes.MOBILE',
	DATA: 'store.topupStep1.subTypes.DATA',
	BUNDLE: 'store.topupStep1.subTypes.BUNDLE',
	EXTERIOR: 'store.topupStep1.subTypes.EXTERIOR',
	P2P: 'store.topupStep1.subTypes.P2P',
}
const SUB_TYPE_COLOR: Record<string, string> = {
	MOBILE: '#3b82f6',
	DATA: '#10b981',
	BUNDLE: '#8b5cf6',
	EXTERIOR: '#f59e0b',
	P2P: '#06b6d4',
}
const SUBTYPE_TABS = [
	{ key: 'ALL', labelKey: 'store.topupStep1.subTypes.ALL' },
	{ key: 'MOBILE', labelKey: 'store.topupStep1.subTypes.MOBILE' },
	{ key: 'DATA', labelKey: 'store.topupStep1.subTypes.DATA' },
	{ key: 'BUNDLE', labelKey: 'store.topupStep1.subTypes.BUNDLE' },
]

const extractBenefits = (text: unknown): string[] => {
	if (!text) return []
	return String(text).split(/[•|·]+/).map(s => s.trim()).filter(Boolean).filter(s => s.length <= 60).slice(0, 3)
}
const extractHeadline = (text: unknown): string => {
	if (!text) return ''
	const first = String(text).split(/[•|·]+/)[0]?.trim()
	return first || String(text).slice(0, 60)
}

type OfferRowProps = {
	offer: StoreOffer
	selected: boolean
	/** `user.golden_check`: boolean o el 0/1 de MySQL. */
	isGold?: boolean | number
	onSelect: () => void
	theme: Theme
	textStyles: TextStyles
}

const OfferRow = ({ offer, selected, isGold, onSelect, theme, textStyles }: OfferRowProps) => {

	const { t } = useTranslation()
	const isPhonePackage = offer.source === 'cuba'
	const subTypeKey = (offer.sub_type || 'MOBILE').toUpperCase()
	const subTypeLabel = SUB_TYPE_LABEL_KEY[subTypeKey] ? t(SUB_TYPE_LABEL_KEY[subTypeKey]) : subTypeKey
	const subTypeColor = SUB_TYPE_COLOR[subTypeKey] || SUB_TYPE_COLOR.MOBILE

	const headline = isPhonePackage ? offer.name : extractHeadline(offer.notes || offer.name)
	const description = !isPhonePackage && offer.notes && offer.notes !== headline ? offer.notes : null
	const benefits = isPhonePackage
		? (Array.isArray(offer.notes) ? offer.notes : extractBenefits(offer.notes))
		: extractBenefits(offer.sent_benefits)

	let priceMain: string
	let priceSub: string | null = null
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
		priceSub = t('store.common.variableAmount')
	}

	return (
		<Pressable
			onPress={onSelect}
			style={[
				styles.offerRow,
				selected
					? { backgroundColor: theme.colors.primary + '12', borderWidth: 1, borderColor: theme.colors.primary }
					: { backgroundColor: theme.colors.surface, ...((theme as ThemeWithMode).mode === 'light' && { borderWidth: 1, borderColor: theme.colors.border }) },
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
						{isPhonePackage && offer.external && <Text style={[textStyles.caption, { color: '#f59e0b' }]}>{t('store.topupStep1.subTypes.EXTERIOR')}</Text>}
						{benefits.map((b) => (
							<Text key={b} style={[textStyles.caption, { color: theme.colors.tertiaryText }]}>{b}</Text>
						))}
					</View>
				)}
			</View>
			<View style={{ alignItems: 'flex-end', marginLeft: 10 }}>
				<Text style={[textStyles.h5, { color: theme.colors.primaryText, fontWeight: '600' }]}>{priceMain}</Text>
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

type Props = {
	country: StoreCountry | null
	phoneNumber: string
	phoneValid: boolean
	onChangePhone: (value: string) => void
	offers: StoreOffer[]
	activeTab: string
	onSelectTab: (value: string) => void
	selectedOffer: StoreOffer | null
	rangeAmount: string
	onSelectOffer: (offer: StoreOffer) => void
	onChangeRange: (value: string) => void
	/** `user.golden_check`: boolean o el 0/1 de MySQL. */
	isGold?: boolean | number
	theme: Theme
	textStyles: TextStyles
}

// Step 1 of the top-up wizard: recipient phone, plan-type tabs, plan list + range amount.
const PhoneTopupStep1 = ({ country, phoneNumber, phoneValid, onChangePhone, offers, activeTab, onSelectTab, selectedOffer, rangeAmount, onSelectOffer, onChangeRange, isGold, theme, textStyles }: Props) => {

	const { t } = useTranslation()

	const availableSubTypes = useMemo(() => {
		const set = new Set(offers.map(o => (o.sub_type || 'MOBILE').toUpperCase()))
		return SUBTYPE_TABS.filter(tab => tab.key === 'ALL' || set.has(tab.key))
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
					<FontAwesome6 name="phone" size={12} color={theme.colors.primaryText} iconStyle="solid" />  {t('store.topupStep1.recipientNumber')}
				</Text>

				<QPPhoneInput
					// `flag`/`dial` del catálogo pueden ser null y QPPhoneInput los declara
					// `string`: se preservan tal cual (cast de tipos, sin cambio de runtime)
					lockedCountry={{ flag: country?.flag as string, dial: country?.dial as string }}
					valid={phoneValid}
					value={phoneNumber}
					onChangeText={onChangePhone}
					placeholder={t('store.topupStep1.localNumberPlaceholder')}
				/>

				{!phoneValid && phoneNumber.length > 0 ? (
					<View style={styles.hintRow}>
						<FontAwesome6 name="circle-exclamation" size={11} color={theme.colors.danger} iconStyle="solid" />
						<Text style={[textStyles.caption, { color: theme.colors.danger, marginLeft: 6 }]}>
							{t('store.topupStep1.invalidNumberFor', { country: country?.name || '' })}
						</Text>
					</View>
				) : (
					<View style={styles.hintRow}>
						<FontAwesome6 name="circle-info" size={11} color={theme.colors.tertiaryText} iconStyle="solid" />
						<Text style={[textStyles.caption, { color: theme.colors.tertiaryText, marginLeft: 6 }]}>
							{t('store.topupStep1.onlyNumbersFrom', { flag: country?.flag || '', country: country?.name || '' })}
						</Text>
					</View>
				)}
			</View>

			{/* SubType tabs */}
			{availableSubTypes.length > 2 && (
				<View style={[styles.tabs, (theme as ThemeWithMode).mode === 'light' && { borderBottomWidth: 0.5, borderBottomColor: theme.colors.border }]}>
					{availableSubTypes.map(tab => {
						const active = activeTab === tab.key
						const cnt = tab.key === 'ALL'
							? offers.length
							: offers.filter(o => (o.sub_type || 'MOBILE').toUpperCase() === tab.key).length
						return (
							<Pressable
								key={tab.key}
								onPress={() => onSelectTab(tab.key)}
								style={[styles.tab, { borderBottomColor: active ? theme.colors.primary : 'transparent' }]}
							>
								<Text style={[textStyles.h6, { color: active ? theme.colors.primary : theme.colors.tertiaryText, fontWeight: '600' }]}>
									{t(tab.labelKey)} <Text style={{ color: theme.colors.tertiaryText, fontSize: 12 }}>{cnt}</Text>
								</Text>
							</Pressable>
						)
					})}
				</View>
			)}

			{/* Offer list */}
			<View style={styles.section}>
				<Text style={[textStyles.h6, { color: theme.colors.primaryText, fontWeight: '600', marginBottom: 10 }]}>
					{t('store.topupStep1.selectPlan')}
				</Text>
				<View style={{ gap: 8 }}>
					{visibleOffers.map((offer: StoreOffer, idx: number) => (
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
							{t('store.common.amountUsdBetween', { min: `$${selectedOffer.price_min}`, max: `$${selectedOffer.price_max}` })}
						</Text>
						<TextInput
							value={rangeAmount}
							onChangeText={(v) => onChangeRange(sanitizeAmountInput(v))}
							keyboardType="decimal-pad"
							placeholder={`${selectedOffer.price_min}`}
							placeholderTextColor={theme.colors.placeholder}
							style={[styles.rangeInput, { color: theme.colors.primaryText, backgroundColor: theme.colors.surface }, (theme as ThemeWithMode).mode === 'light' && { borderWidth: 0.5, borderColor: theme.colors.border }]}
						/>
					</View>
				)}
			</View>
		</>
	)
}

const styles = StyleSheet.create({
	section: { marginBottom: 18 },
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
