import { useState } from 'react'
import { ScrollView, StyleSheet, Text, View } from 'react-native'
import FontAwesome6 from '@react-native-vector-icons/fontawesome6'
import { useTranslation } from 'react-i18next'

import QPSheet from '../../ui/QPSheet'
import QPPressable from '../../ui/particles/QPPressable'
import { CASH_CANCEL_AFTER_DAYS, etaParts, formatPct, municipalitiesOf, normalizePlace, provinceOptions, zoneSurchargePct } from './cashZones'
import type { CashZone, CashZoneMode, ZoneCharge } from './cashZones'

import type { Theme } from '../../theme/ThemeContext'
import type { TextStyles } from '../../theme/themeUtils'

type CashZoneFieldsProps = {
	mode: CashZoneMode
	/** Valor actual del campo de provincia (nombre de provincia). */
	province: string
	/** Valor actual del campo de municipio. */
	municipality: string
	/** Zona resuelta (null hasta elegir un municipio cubierto). */
	zone: CashZone | null
	/** Cargo de zona sobre el bruto tecleado (null sin importe). */
	charge: ZoneCharge | null
	/** Lo entregado no alcanza el mínimo de la zona. */
	belowMin: boolean
	onChangeProvince: (province: string) => void
	onChangeMunicipality: (municipality: string) => void
	theme: Theme
	textStyles: TextStyles
}

type Option = { value: string, label: string }

// Campo tipo select: muestra el valor (o el placeholder) y abre una hoja con las opciones
const ZoneSelect = ({ label, placeholder, value, options, disabled, onSelect, theme, textStyles }: {
	label: string
	placeholder: string
	value: string
	options: Option[]
	disabled?: boolean
	onSelect: (value: string) => void
	theme: Theme
	textStyles: TextStyles
}) => {
	const [open, setOpen] = useState(false)
	const current = options.find(o => normalizePlace(o.value) === normalizePlace(value))
	return (
		<View style={styles.field}>
			<Text style={[textStyles.h7, { color: theme.colors.tertiaryText, marginBottom: 8 }]}>{label}:</Text>
			<QPPressable
				variant="opacity"
				disabled={disabled}
				onPress={() => setOpen(true)}
				accessibilityRole="button"
				accessibilityLabel={label}
				style={[styles.trigger, { borderColor: theme.colors.border, backgroundColor: theme.colors.surface, opacity: disabled ? 0.5 : 1 }]}
			>
				<Text style={[textStyles.h6, { flex: 1, color: current ? theme.colors.primaryText : theme.colors.placeholder }]} numberOfLines={1}>
					{current ? current.label : placeholder}
				</Text>
				<FontAwesome6 name="chevron-down" size={13} color={theme.colors.tertiaryText} iconStyle="solid" />
			</QPPressable>
			<QPSheet visible={open} title={label} onClose={() => setOpen(false)}>
				<ScrollView style={styles.list} contentContainerStyle={{ paddingBottom: 8 }}>
					{options.map((opt) => {
						const selected = !!current && current.value === opt.value
						return (
							<QPPressable
								key={opt.value}
								variant="opacity"
								onPress={() => { setOpen(false); onSelect(opt.value) }}
								accessibilityRole="button"
								style={[styles.row, { borderBottomColor: theme.colors.border }]}
							>
								<Text style={[textStyles.h6, { flex: 1, color: selected ? theme.colors.primary : theme.colors.primaryText }]}>{opt.label}</Text>
								{selected && <FontAwesome6 name="check" size={14} color={theme.colors.primary} iconStyle="solid" />}
							</QPPressable>
						)
					})}
				</ScrollView>
			</QPSheet>
		</View>
	)
}

/**
 * Provincia → Municipio para la entrega de efectivo por zonas (USDCASH…), más el aviso
 * con plazo, cargo de entrega y mínimo. Sustituye al select de provincia y al municipio
 * de texto libre: los valores que escribe son `province_name` y `municipality` de la
 * zona, que el servidor vuelve a casar sin acentos ni mayúsculas.
 */
const CashZoneFields = ({ mode, province, municipality, zone, charge, belowMin, onChangeProvince, onChangeMunicipality, theme, textStyles }: CashZoneFieldsProps) => {

	const { t } = useTranslation()

	const etaText = (z: CashZone) => {
		const eta = etaParts(z)
		return eta.unit === 'hours' ? t('withdraw.cashZones.etaHours', { min: eta.min, max: eta.max }) : t('withdraw.cashZones.etaDays', { min: eta.min, max: eta.max })
	}

	const provinces: Option[] = provinceOptions(mode.zones).map(p => ({ value: p, label: p }))
	const municipalities: Option[] = municipalitiesOf(mode.zones, province).map(z => ({
		value: z.municipality,
		label: [
			z.municipality,
			`+${formatPct(zoneSurchargePct(z, mode.globalMarginPct))}%`,
			etaText(z),
			...(z.home_delivery === false ? [t('withdraw.cashZones.noHomeDelivery')] : []),
		].join(' · '),
	}))

	return (
		<View>
			<ZoneSelect
				label={mode.provinceField}
				placeholder={t('withdraw.cashZones.selectProvince')}
				value={province}
				options={provinces}
				onSelect={onChangeProvince}
				theme={theme}
				textStyles={textStyles}
			/>
			<ZoneSelect
				label={mode.municipalityField}
				placeholder={province ? t('withdraw.cashZones.selectMunicipality') : t('withdraw.cashZones.chooseProvinceFirst')}
				value={municipality}
				options={municipalities}
				disabled={!province}
				onSelect={onChangeMunicipality}
				theme={theme}
				textStyles={textStyles}
			/>

			<View style={[styles.notice, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
				{zone ? (
					<>
						<Text style={[textStyles.h6, { color: theme.colors.primaryText }]}>
							{t('withdraw.cashZones.deliveryIn', { municipality: zone.municipality, province: zone.province_name })}
						</Text>
						<Text style={[textStyles.caption, styles.line, { color: theme.colors.secondaryText }]}>{t('withdraw.cashZones.eta', { eta: etaText(zone) })}</Text>
						<Text style={[textStyles.caption, styles.line, { color: theme.colors.secondaryText }]}>
							{charge && charge.total > 0
								? t('withdraw.cashZones.charge', { amount: charge.total.toFixed(2) })
								: t('withdraw.cashZones.chargePct', { pct: formatPct(zoneSurchargePct(zone, mode.globalMarginPct)) })}
						</Text>
						<Text style={[textStyles.caption, styles.line, { color: belowMin ? theme.colors.danger : theme.colors.secondaryText }]}>
							{t('withdraw.cashZones.minimum', { min: zone.min_usd })}
						</Text>
						{zone.home_delivery === false && (
							<Text style={[textStyles.caption, styles.line, { color: theme.colors.warning }]}>{t('withdraw.cashZones.noHomeDeliveryNotice')}</Text>
						)}
						<Text style={[textStyles.caption, styles.line, { color: theme.colors.tertiaryText }]}>{t('withdraw.cashZones.cancelNotice', { days: CASH_CANCEL_AFTER_DAYS })}</Text>
						{belowMin && (
							<Text style={[textStyles.caption, styles.line, { color: theme.colors.danger }]}>
								{t('withdraw.cashZones.belowMin', { municipality: zone.municipality, min: zone.min_usd })}
							</Text>
						)}
					</>
				) : (
					<Text style={[textStyles.caption, { color: theme.colors.secondaryText }]}>{t('withdraw.cashZones.pickPrompt')}</Text>
				)}
			</View>
		</View>
	)
}

const styles = StyleSheet.create({
	field: { marginVertical: 6 },
	trigger: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 13 },
	list: { maxHeight: 420 },
	row: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth },
	notice: { marginTop: 10, marginBottom: 6, padding: 12, borderRadius: 12, borderWidth: 1 },
	line: { marginTop: 4 },
})

export default CashZoneFields
