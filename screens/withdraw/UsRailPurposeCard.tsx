import { useState } from 'react'
import { View, Text, StyleSheet, Pressable } from 'react-native'
import { useTranslation } from 'react-i18next'
import FontAwesome6 from '@react-native-vector-icons/fontawesome6'

import QPInput from '../../ui/particles/QPInput'
import QPCheckbox from '../../ui/particles/QPCheckbox'
import QPPressable from '../../ui/particles/QPPressable'
import CountryPickerModal from '../../ui/CountryPickerModal'
import WithdrawInvoiceField from './WithdrawInvoiceField'
import { countries } from '../../labels/countries'
import { scaleType } from '../../theme/themeUtils'
import { fillGoodsAttestation, ownBlocked, OTHER_PURPOSE } from './usRail'
import type { InvoiceFile, UsRailRequirements, UsRailValue } from './usRail'

import type { Theme } from '../../theme/ThemeContext'
import type { TextStyles } from '../../theme/themeUtils'

type Props = {
	req: UsRailRequirements
	value: UsRailValue
	onChange: (next: UsRailValue) => void
	/** Idioma de los textos legales (declaraciones y Atestación A), que viaja en `us_payment.language`. */
	language: 'es' | 'en'
	onChangeLanguage: (language: 'es' | 'en') => void
	amount: string
	/** Nombre del beneficiario del formulario del método: sugerencia para el destinatario. */
	payeeHint?: string
	/** Claves que el servidor marcó como faltantes (`missing` del 400). */
	highlight?: string[]
	invoice: InvoiceFile | null
	invoiceRequired: boolean
	onChangeInvoice: (file: InvoiceFile | null) => void
	theme: Theme
	textStyles: TextStyles
}

type Group = 'recipient' | 'goods' | 'service' | 'goodsA'
type SetIn = <K extends Group>(group: K, patch: Partial<UsRailValue[K]>) => void
type CountryTarget = 'recipient' | 'origin'

/** Lo que comparten las secciones del formulario. */
type Ctx = {
	theme: Theme
	textStyles: TextStyles
	/** Borde rojo en lo que el servidor marcó como faltante. */
	mark: (key: string) => object | null
}

const countryName = (code: string) => countries.find(c => c.code === code)?.name || code

const Label = ({ text, ctx }: { text: string, ctx: Ctx }) => (
	<Text style={[ctx.textStyles.h7, styles.label, { color: ctx.theme.colors.tertiaryText }]}>{text}</Text>
)

type ChoiceProps = { selected: boolean, onPress: () => void, title: string, summary?: string, testID?: string, ctx: Ctx }
const Choice = ({ selected, onPress, title, summary, testID, ctx }: ChoiceProps) => {
	const { theme, textStyles } = ctx
	const borderColor = selected ? theme.colors.primary : (theme.isDark ? 'transparent' : theme.colors.border)
	return (
		<QPPressable variant="opacity" onPress={onPress} accessibilityRole="radio" accessibilityState={{ selected }} testID={testID} style={[styles.choice, { backgroundColor: theme.colors.background, borderColor }]}>
			<Text style={[textStyles.body, { color: theme.colors.primaryText }]}>{title}</Text>
			{!!summary && <Text style={[textStyles.caption, styles.summary, { color: theme.colors.secondaryText, lineHeight: scaleType(theme, 17) }]}>{summary}</Text>}
		</QPPressable>
	)
}

const CountryRow = ({ code, onPress, testID, markKey, ctx }: { code: string, onPress: () => void, testID: string, markKey: string, ctx: Ctx }) => {
	const { t } = useTranslation()
	const { theme, textStyles } = ctx
	return (
		<QPPressable onPress={onPress} accessibilityRole="button" testID={testID} style={[styles.pickerRow, { backgroundColor: theme.colors.background }, ctx.mark(markKey)]}>
			<Text style={[textStyles.text, { color: code ? theme.colors.primaryText : theme.colors.secondaryText }]}>{code ? countryName(code) : t('withdraw.usRail.countryPlaceholder')}</Text>
			<FontAwesome6 name="angle-down" size={14} color={theme.colors.secondaryText} iconStyle="solid" />
		</QPPressable>
	)
}

const Header = ({ language, onChangeLanguage, ctx }: { language: 'es' | 'en', onChangeLanguage: (l: 'es' | 'en') => void, ctx: Ctx }) => {
	const { t } = useTranslation()
	const { theme, textStyles } = ctx
	return (
		<View style={styles.header}>
			<View style={[styles.headerIcon, { backgroundColor: theme.colors.warning + '26' }]}>
				<FontAwesome6 name="shield-halved" size={18} color={theme.colors.warning} iconStyle="solid" />
			</View>
			<View style={styles.flex}>
				<Text style={[textStyles.h5, { color: theme.colors.primaryText }]}>{t('withdraw.usRail.title')}</Text>
				<Text style={[textStyles.caption, { color: theme.colors.secondaryText, lineHeight: scaleType(theme, 17) }]}>{t('withdraw.usRail.intro')}</Text>
			</View>
			<View style={[styles.langToggle, { borderColor: theme.colors.border }]} accessibilityRole="radiogroup" accessibilityLabel={t('withdraw.usRail.languageLabel')}>
				{(['es', 'en'] as const).map(l => (
					<Pressable key={l} onPress={() => onChangeLanguage(l)} accessibilityRole="radio" accessibilityState={{ selected: language === l }} style={[styles.langOption, language === l && { backgroundColor: theme.colors.primary }]}>
						<Text style={[textStyles.caption, { color: language === l ? theme.colors.almostWhite : theme.colors.secondaryText, fontFamily: theme.typography.fontFamily.medium }]}>{l.toUpperCase()}</Text>
					</Pressable>
				))}
			</View>
		</View>
	)
}

const PayeeSection = ({ req, v, onChange, blocked, ctx }: { req: UsRailRequirements, v: UsRailValue, onChange: (next: UsRailValue) => void, blocked: boolean, ctx: Ctx }) => {
	const { t } = useTranslation()
	const { theme, textStyles } = ctx
	const hint = (p: UsRailRequirements['payees'][number]) => {
		if (p.code === 'third_party') return t('withdraw.usRail.payeeThirdHint')
		return p.suspended ? t('withdraw.usRail.payeeOwnSuspendedHint') : t('withdraw.usRail.payeeOwnHint')
	}
	return (
		<>
			<Label text={t('withdraw.usRail.payeeLabel')} ctx={ctx} />
			<View style={[styles.group, ctx.mark('payee')]} accessibilityRole="radiogroup">
				{req.payees.map(p => (
					<Choice key={p.code} selected={v.payee === p.code} onPress={() => onChange({ ...v, payee: p.code })} title={p.label} summary={hint(p)} testID={`us-rail-payee-${p.code}`} ctx={ctx} />
				))}
			</View>
			{blocked && (
				<View accessibilityRole="alert" testID="us-rail-own-blocked" style={[styles.alert, { borderColor: theme.colors.danger + '4D', backgroundColor: theme.colors.danger + '1A' }]}>
					<FontAwesome6 name="ban" size={14} color={theme.colors.danger} iconStyle="solid" style={styles.alertIcon} />
					<Text style={[textStyles.caption, styles.flex, { color: theme.colors.primaryText, lineHeight: scaleType(theme, 17) }]}>{req.messages.own_suspended}</Text>
				</View>
			)}
		</>
	)
}

const RecipientSection = ({ v, setIn, payeeHint, openCountry, ctx }: { v: UsRailValue, setIn: SetIn, payeeHint?: string, openCountry: (target: CountryTarget) => void, ctx: Ctx }) => {
	const { t } = useTranslation()
	const outsideUs = !!v.recipient.country && v.recipient.country !== 'US' && v.purpose !== OTHER_PURPOSE
	return (
		<>
			<Label text={t('withdraw.usRail.recipientName')} ctx={ctx} />
			<QPInput value={v.recipient.name} onChangeText={(text: string) => setIn('recipient', { name: text })} placeholder={payeeHint || t('withdraw.usRail.recipientNamePlaceholder')} maxLength={160} prefixIconName="building" testID="us-rail-recipient-name" style={ctx.mark('recipient.name')} />
			<Label text={t('withdraw.usRail.recipientCountry')} ctx={ctx} />
			<CountryRow code={v.recipient.country} onPress={() => openCountry('recipient')} testID="us-rail-country-recipient" markKey="recipient.country" ctx={ctx} />
			{outsideUs && <Text style={[ctx.textStyles.caption, styles.note, { color: ctx.theme.colors.warning }]}>{t('withdraw.usRail.recipientOutsideUs')}</Text>}
		</>
	)
}

const ServiceSection = ({ req, v, onChange, setIn, ctx }: { req: UsRailRequirements, v: UsRailValue, onChange: (next: UsRailValue) => void, setIn: SetIn, ctx: Ctx }) => {
	const { t } = useTranslation()
	const { theme, textStyles } = ctx
	return (
		<>
			<Label text={t('withdraw.usRail.serviceKindLabel')} ctx={ctx} />
			<View style={[styles.chips, ctx.mark('service_kind')]}>
				{req.service_kinds.map(k => {
					const selected = v.service_kind === k.code
					const chipColors = { backgroundColor: selected ? theme.colors.primary : 'transparent', borderColor: selected ? theme.colors.primary : theme.colors.border }
					return (
						<QPPressable key={k.code} onPress={() => onChange({ ...v, service_kind: k.code })} accessibilityRole="radio" accessibilityState={{ selected }} style={[styles.chip, chipColors]}>
							<Text style={[textStyles.h7, { color: selected ? theme.colors.almostWhite : theme.colors.primaryText }]}>{k.label}</Text>
						</QPPressable>
					)
				})}
			</View>
			<Label text={t('withdraw.usRail.serviceDescription')} ctx={ctx} />
			<QPInput value={v.service.description} onChangeText={(text: string) => setIn('service', { description: text })} placeholder={t('withdraw.usRail.serviceDescriptionPlaceholder')} maxLength={300} style={ctx.mark('service.description')} />
		</>
	)
}

// Atestación A (E-1): el texto viene del servidor, con los datos de este retiro
const GoodsAttestationSection = ({ v, setIn, text, ctx }: { v: UsRailValue, setIn: SetIn, text: string, ctx: Ctx }) => {
	const { t } = useTranslation()
	const { theme, textStyles } = ctx
	return (
		<View style={[styles.subCard, { backgroundColor: theme.colors.background }, ctx.mark('goods_attestation')]}>
			<Text style={[textStyles.h6, { color: theme.colors.primaryText }]}>{t('withdraw.usRail.goodsAttestationTitle')}</Text>
			<Label text={t('withdraw.usRail.goodsEntity')} ctx={ctx} />
			<QPInput value={v.goodsA.entity} onChangeText={(value: string) => setIn('goodsA', { entity: value })} placeholder={t('withdraw.usRail.goodsEntity')} maxLength={160} />
			<Label text={t('withdraw.usRail.goodsInvoice')} ctx={ctx} />
			<QPInput value={v.goodsA.invoice} onChangeText={(value: string) => setIn('goodsA', { invoice: value })} placeholder={t('withdraw.usRail.goodsInvoice')} maxLength={60} autoCapitalize="characters" />
			<Label text={t('withdraw.usRail.goodsEndUser')} ctx={ctx} />
			<QPInput value={v.goodsA.endUser} onChangeText={(value: string) => setIn('goodsA', { endUser: value })} placeholder={t('withdraw.usRail.goodsEndUser')} maxLength={160} />
			<Text style={[textStyles.caption, styles.legal, { color: theme.colors.secondaryText, lineHeight: scaleType(theme, 17) }]}>{text}</Text>
			<QPPressable variant="opacity" onPress={() => setIn('goodsA', { accepted: !v.goodsA.accepted })} accessibilityRole="checkbox" accessibilityState={{ checked: v.goodsA.accepted }} testID="us-rail-goods-accept" style={styles.checkRow}>
				<QPCheckbox checked={v.goodsA.accepted} size={20} color={theme.colors.successFill} style={styles.checkbox} />
				<Text style={[textStyles.caption, styles.flex, { color: theme.colors.primaryText }]}>{t('withdraw.usRail.goodsAccept')}</Text>
			</QPPressable>
		</View>
	)
}

// Mercancía (E-1 y E-2)
const GoodsSection = ({ v, setIn, openCountry, ctx }: { v: UsRailValue, setIn: SetIn, openCountry: (target: CountryTarget) => void, ctx: Ctx }) => {
	const { t } = useTranslation()
	return (
		<>
			<Label text={t('withdraw.usRail.goodsDescription')} ctx={ctx} />
			<QPInput value={v.goods.description} onChangeText={(text: string) => setIn('goods', { description: text })} placeholder={t('withdraw.usRail.goodsDescriptionPlaceholder')} maxLength={300} style={ctx.mark('goods.description')} />
			<Label text={t('withdraw.usRail.goodsManufacturer')} ctx={ctx} />
			<QPInput value={v.goods.manufacturer} onChangeText={(text: string) => setIn('goods', { manufacturer: text })} placeholder={t('withdraw.usRail.goodsManufacturer')} maxLength={160} style={ctx.mark('goods.manufacturer')} />
			<Label text={t('withdraw.usRail.goodsOrigin')} ctx={ctx} />
			<CountryRow code={v.goods.origin_country} onPress={() => openCountry('origin')} testID="us-rail-country-origin" markKey="goods.origin_country" ctx={ctx} />
			<Label text={t('withdraw.usRail.goodsEndUse')} ctx={ctx} />
			<QPInput value={v.goods.end_use} onChangeText={(text: string) => setIn('goods', { end_use: text })} placeholder={t('withdraw.usRail.goodsEndUsePlaceholder')} maxLength={300} style={ctx.mark('goods.end_use')} />
			<Label text={t('withdraw.usRail.goodsShipping')} ctx={ctx} />
			<QPInput value={v.goods.shipping} onChangeText={(text: string) => setIn('goods', { shipping: text })} placeholder={t('withdraw.usRail.goodsShippingPlaceholder')} maxLength={300} style={ctx.mark('goods.shipping')} />
		</>
	)
}

// Las cuatro declaraciones (texto del servidor, en el idioma elegido)
const DeclarationsSection = ({ req, v, onChange, language, ctx }: { req: UsRailRequirements, v: UsRailValue, onChange: (next: UsRailValue) => void, language: 'es' | 'en', ctx: Ctx }) => {
	const { t } = useTranslation()
	const { theme, textStyles } = ctx
	return (
		<>
			<Label text={t('withdraw.usRail.declarationsLabel')} ctx={ctx} />
			<View style={ctx.mark('attestations')}>
				{req.declarations.map(d => {
					const checked = v.attestations[d.key] === true
					return (
						<QPPressable
							key={d.key}
							variant="opacity"
							onPress={() => onChange({ ...v, attestations: { ...v.attestations, [d.key]: !checked } })}
							accessibilityRole="checkbox"
							accessibilityState={{ checked }}
							testID={`us-rail-declaration-${d.key}`}
							style={[styles.declaration, { backgroundColor: theme.colors.background }]}
						>
							<QPCheckbox checked={checked} size={20} color={theme.colors.successFill} style={styles.checkbox} />
							<Text style={[textStyles.caption, styles.flex, { color: theme.colors.primaryText, lineHeight: scaleType(theme, 18) }]}>{language === 'en' ? d.en : d.es}</Text>
						</QPPressable>
					)
				})}
			</View>
		</>
	)
}

/**
 * Retiro de una cuenta de Cuba por un método conectado a EE. UU.: a quién paga, propósito permitido,
 * datos del pago, las cuatro declaraciones y, a un tercero, la factura. Espejo del `UsRailPurposeBlock`
 * de la web. Todos los textos de las opciones y los legales vienen de `GET /withdraw/us-rail`; aquí
 * solo las etiquetas de los campos. El servidor repite cada comprobación.
 */
const UsRailPurposeCard = ({ req, value: v, onChange, language, onChangeLanguage, amount, payeeHint, highlight = [], invoice, invoiceRequired, onChangeInvoice, theme, textStyles }: Props) => {

	const { t } = useTranslation()
	const [countryFor, setCountryFor] = useState<CountryTarget | null>(null)
	const [countrySearch, setCountrySearch] = useState('')

	const setIn: SetIn = (group, patch) => onChange({ ...v, [group]: { ...v[group], ...patch } })
	const openCountry = (target: CountryTarget) => { setCountrySearch(''); setCountryFor(target) }
	const ctx: Ctx = {
		theme,
		textStyles,
		mark: (key) => (highlight.includes(key) ? { borderWidth: 1.5, borderColor: theme.colors.danger, borderRadius: 12 } : null),
	}

	const blocked = ownBlocked(v, req)
	const goodsAText = fillGoodsAttestation(req.goods_attestation?.[language] || '', {
		entity: v.goodsA.entity, amount, payee: v.recipient.name || payeeHint, invoice: v.goodsA.invoice, endUser: v.goodsA.endUser,
	})
	const surfaceBorder = !theme.isDark && { borderWidth: 1, borderColor: theme.colors.border }

	return (
		<View testID="us-rail-card" style={[styles.card, { backgroundColor: theme.colors.surface }, surfaceBorder]}>
			<Header language={language} onChangeLanguage={onChangeLanguage} ctx={ctx} />
			<PayeeSection req={req} v={v} onChange={onChange} blocked={blocked} ctx={ctx} />

			{!blocked && (<>
				<Label text={t('withdraw.usRail.purposeLabel')} ctx={ctx} />
				<View style={[styles.group, ctx.mark('purpose')]} accessibilityRole="radiogroup">
					{req.purposes.map(p => (
						<Choice key={p.code} selected={v.purpose === p.code} onPress={() => onChange({ ...v, purpose: p.code })} title={p.label} summary={v.purpose === p.code ? p.summary : undefined} testID={`us-rail-purpose-${p.code}`} ctx={ctx} />
					))}
				</View>

				{v.payee === 'third_party' && <RecipientSection v={v} setIn={setIn} payeeHint={payeeHint} openCountry={openCountry} ctx={ctx} />}
				{v.purpose === 'S-1' && <ServiceSection req={req} v={v} onChange={onChange} setIn={setIn} ctx={ctx} />}
				{v.purpose === 'E-1' && <GoodsAttestationSection v={v} setIn={setIn} text={goodsAText} ctx={ctx} />}
				{(v.purpose === 'E-1' || v.purpose === 'E-2') && <GoodsSection v={v} setIn={setIn} openCountry={openCountry} ctx={ctx} />}
				{v.purpose === OTHER_PURPOSE && (<>
					<Label text={t('withdraw.usRail.noteLabel', { min: req.note_min_length })} ctx={ctx} />
					<QPInput value={v.note} onChangeText={(text: string) => onChange({ ...v, note: text.slice(0, 300) })} placeholder={t('withdraw.usRail.noteLabel', { min: req.note_min_length })} maxLength={300} multiline style={ctx.mark('note')} />
				</>)}

				<DeclarationsSection req={req} v={v} onChange={onChange} language={language} ctx={ctx} />
			</>)}

			{/* Factura: pago a un tercero (o retiro bancario de $3,000 o más) */}
			{invoiceRequired && !blocked && (
				<WithdrawInvoiceField reason={v.payee === 'third_party' ? 'third_party' : 'large_bank'} file={invoice} onChange={onChangeInvoice} maxBytes={req.invoice?.max_bytes} highlighted={highlight.includes('invoice')} theme={theme} textStyles={textStyles} embedded />
			)}

			<CountryPickerModal
				visible={countryFor !== null}
				country={countryFor === 'origin' ? v.goods.origin_country : v.recipient.country}
				countrySearch={countrySearch}
				onChangeSearch={setCountrySearch}
				onSelect={(code: string) => {
					if (countryFor === 'origin') setIn('goods', { origin_country: code })
					else setIn('recipient', { country: code })
					setCountryFor(null)
				}}
				onClose={() => setCountryFor(null)}
				theme={theme}
				textStyles={textStyles}
			/>
		</View>
	)
}

const styles = StyleSheet.create({
	card: { marginTop: 20, padding: 16, borderRadius: 16, borderCurve: 'continuous' },
	header: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
	headerIcon: { width: 38, height: 38, borderRadius: 11, borderCurve: 'continuous', alignItems: 'center', justifyContent: 'center' },
	flex: { flex: 1 },
	langToggle: { flexDirection: 'row', borderWidth: 1, borderRadius: 8, borderCurve: 'continuous', overflow: 'hidden' },
	langOption: { paddingHorizontal: 9, paddingVertical: 4 },
	label: { marginTop: 16, marginBottom: 8 },
	group: { gap: 8 },
	choice: { borderRadius: 12, borderCurve: 'continuous', borderWidth: 1.5, paddingHorizontal: 12, paddingVertical: 10 },
	summary: { marginTop: 4 },
	alert: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, borderWidth: 1, borderRadius: 10, borderCurve: 'continuous', padding: 10, marginTop: 10 },
	alertIcon: { marginTop: 2 },
	pickerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderRadius: 12, borderCurve: 'continuous', paddingHorizontal: 14, paddingVertical: 14 },
	note: { marginTop: 6 },
	chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
	chip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 16, borderWidth: 1 },
	subCard: { marginTop: 16, padding: 12, borderRadius: 12, borderCurve: 'continuous' },
	legal: { marginTop: 12 },
	checkRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 12 },
	checkbox: { marginTop: 1 },
	declaration: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, borderRadius: 12, borderCurve: 'continuous', padding: 12, marginBottom: 8 },
})

export default UsRailPurposeCard
