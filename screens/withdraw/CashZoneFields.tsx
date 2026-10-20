import { useEffect, useMemo, useRef, useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import FontAwesome6 from '@react-native-vector-icons/fontawesome6'
import { useTranslation } from 'react-i18next'

import QPAssetSheet from '../../ui/QPAssetSheet'
import type { QPAssetOption } from '../../ui/QPAssetSheet'
import QPPressable from '../../ui/particles/QPPressable'
import { CASH_CANCEL_AFTER_DAYS, etaParts, formatPct, normalizePlace, provinceSummaries, sortedMunicipalities, zoneSurchargePct } from './cashZones'
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

// Con pocas opciones el buscador estorba más de lo que ayuda (Cienfuegos e Isla tienen una)
const SEARCH_MIN_OPTIONS = 7
// Elegir provincia abre sus municipios cuando la primera hoja ya cerró (dos <Modal> a la vez fallan en iOS)
const CHAIN_DELAY_MS = 450

// Campo tipo select: valor (o placeholder) con su detalle debajo; abre la hoja de destinos
const ZoneTrigger = ({ label, icon, placeholder, value, detail, disabled, onPress, theme, textStyles }: {
	label: string
	icon: 'map-location-dot' | 'house'
	placeholder: string
	value: string | null
	detail?: string | null
	disabled?: boolean
	onPress: () => void
	theme: Theme
	textStyles: TextStyles
}) => (
	<View style={styles.field}>
		<Text style={[textStyles.h7, styles.label, { color: theme.colors.tertiaryText }]}>{label}:</Text>
		<QPPressable
			variant="opacity"
			disabled={disabled}
			onPress={onPress}
			accessibilityRole="button"
			accessibilityLabel={label}
			style={[styles.trigger, { borderColor: theme.colors.border, backgroundColor: theme.colors.surface }, disabled && styles.disabled]}
		>
			<View style={[styles.triggerIcon, { backgroundColor: theme.colors.primary + '1F' }]}>
				<FontAwesome6 name={icon} size={14} color={theme.colors.primary} iconStyle="solid" />
			</View>
			<View style={styles.triggerTexts}>
				<Text style={[textStyles.h6, { color: value ? theme.colors.primaryText : theme.colors.placeholder }]} numberOfLines={1}>
					{value || placeholder}
				</Text>
				{!!value && !!detail && <Text style={[textStyles.caption, { color: theme.colors.tertiaryText }]} numberOfLines={1}>{detail}</Text>}
			</View>
			<FontAwesome6 name="chevron-down" size={13} color={theme.colors.tertiaryText} iconStyle="solid" />
		</QPPressable>
	</View>
)

/**
 * Provincia → Municipio para la entrega de efectivo por zonas (USDCASH…), más el aviso
 * con plazo, cargo de entrega y mínimo. Sustituye al select de provincia y al municipio
 * de texto libre: los valores que escribe son `province_name` y `municipality` de la
 * zona, que el servidor vuelve a casar sin acentos ni mayúsculas.
 */
const CashZoneFields = ({ mode, province, municipality, zone, charge, belowMin, onChangeProvince, onChangeMunicipality, theme, textStyles }: CashZoneFieldsProps) => {

	const { t } = useTranslation()
	const [sheet, setSheet] = useState<'province' | 'municipality' | null>(null)
	const chainTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
	useEffect(() => () => { if (chainTimer.current) clearTimeout(chainTimer.current) }, [])

	const etaText = (z: CashZone) => {
		const eta = etaParts(z)
		return eta.unit === 'hours' ? t('withdraw.cashZones.etaHours', { min: eta.min, max: eta.max }) : t('withdraw.cashZones.etaDays', { min: eta.min, max: eta.max })
	}
	const pctText = (pct: number) => t('withdraw.cashZones.picker.pct', { pct: formatPct(pct) })

	// Provincias: siglas del servidor, cuántos municipios, el plazo más corto y desde qué recargo
	const provinces = useMemo(() => provinceSummaries(mode.zones, mode.globalMarginPct), [mode.zones, mode.globalMarginPct])
	const provinceOptions: QPAssetOption[] = provinces.map(p => ({
		id: p.name,
		title: p.name,
		monogram: p.code || undefined,
		subtitle: t('withdraw.cashZones.picker.provinceSubtitle', { count: p.municipalities, eta: etaText(p.fastest) }),
		value: p.minPct === p.maxPct ? pctText(p.minPct) : t('withdraw.cashZones.picker.fromPct', { pct: formatPct(p.minPct) }),
		valueCaption: t('withdraw.cashZones.picker.surcharge'),
		// Sin acentos: quien escribe "camaguey" encuentra Camagüey
		keywords: `${normalizePlace(p.name)} ${p.code}`,
	}))
	const currentProvince = provinces.find(p => normalizePlace(p.name) === normalizePlace(province) || normalizePlace(p.code) === normalizePlace(province)) ?? null

	// Municipios: la cabecera primero; la tesela dice si hay entrega a domicilio o recoge el beneficiario
	const zones = useMemo(() => sortedMunicipalities(mode.zones, province), [mode.zones, province])
	const municipalityOptions: QPAssetOption[] = zones.map(z => {
		const home = z.home_delivery !== false
		return {
			id: z.municipality,
			title: z.municipality,
			badge: z.is_capital ? t('withdraw.cashZones.picker.capital') : undefined,
			iconName: home ? 'house' : 'store',
			tint: home ? theme.colors.primary : theme.colors.warning,
			subtitle: `${etaText(z)} · ${home ? t('withdraw.cashZones.picker.homeDelivery') : t('withdraw.cashZones.picker.pickup')}`,
			value: pctText(zoneSurchargePct(z, mode.globalMarginPct)),
			valueCaption: t('withdraw.cashZones.picker.minimum', { min: z.min_usd }),
			keywords: normalizePlace(z.municipality),
		}
	})
	// Una provincia NUEVA deja el municipio vacío: se encadena su lista para no tener que buscarla
	const pickProvince = (name: string) => {
		const changed = normalizePlace(name) !== normalizePlace(currentProvince?.name ?? province)
		onChangeProvince(name)
		if (!changed) return
		if (chainTimer.current) clearTimeout(chainTimer.current)
		chainTimer.current = setTimeout(() => setSheet('municipality'), CHAIN_DELAY_MS)
	}

	const currentZone = zones.find(z => normalizePlace(z.municipality) === normalizePlace(municipality)) ?? null
	const hasPickup = zones.some(z => z.home_delivery === false)

	return (
		<View>
			<ZoneTrigger
				label={mode.provinceField}
				icon="map-location-dot"
				placeholder={t('withdraw.cashZones.selectProvince')}
				value={currentProvince?.name ?? null}
				onPress={() => setSheet('province')}
				theme={theme}
				textStyles={textStyles}
			/>
			<ZoneTrigger
				label={mode.municipalityField}
				icon="house"
				placeholder={province ? t('withdraw.cashZones.selectMunicipality') : t('withdraw.cashZones.chooseProvinceFirst')}
				value={currentZone?.municipality ?? null}
				detail={currentZone ? `${etaText(currentZone)} · ${pctText(zoneSurchargePct(currentZone, mode.globalMarginPct))}` : null}
				disabled={!province}
				onPress={() => setSheet('municipality')}
				theme={theme}
				textStyles={textStyles}
			/>

			<QPAssetSheet
				visible={sheet === 'province'}
				title={t('withdraw.cashZones.picker.provinceTitle')}
				options={provinceOptions}
				selectedId={currentProvince?.name ?? null}
				onSelect={pickProvince}
				onClose={() => setSheet(null)}
				searchable={provinceOptions.length >= SEARCH_MIN_OPTIONS}
				searchPlaceholder={t('withdraw.cashZones.picker.searchProvince')}
				emptyText={t('withdraw.cashZones.picker.empty')}
			/>
			<QPAssetSheet
				visible={sheet === 'municipality'}
				title={t('withdraw.cashZones.picker.municipalityTitle', { province: currentProvince?.name ?? province })}
				options={municipalityOptions}
				selectedId={currentZone?.municipality ?? null}
				onSelect={onChangeMunicipality}
				onClose={() => setSheet(null)}
				searchable={municipalityOptions.length >= SEARCH_MIN_OPTIONS}
				searchPlaceholder={t('withdraw.cashZones.picker.searchMunicipality')}
				emptyText={t('withdraw.cashZones.picker.empty')}
				footnote={hasPickup ? t('withdraw.cashZones.picker.pickupFootnote') : null}
			/>

			<View style={[styles.notice, { backgroundColor: theme.colors.surface }, !theme.isDark && { borderWidth: 1, borderColor: theme.colors.border }]}>
				{zone ? (
					<>
						<Text style={[textStyles.h6, { color: theme.colors.primaryText }]}>
							{t('withdraw.cashZones.deliveryIn', { municipality: zone.municipality, province: zone.province_name })}
						</Text>
						<Text style={[textStyles.caption, styles.line, { color: theme.colors.secondaryText }]}>{t('withdraw.cashZones.eta', { eta: etaText(zone) })}</Text>
						<Text style={[textStyles.caption, styles.line, { color: theme.colors.secondaryText }]}>{t('withdraw.cashZones.agentContact')}</Text>
						<Text style={[textStyles.caption, styles.line, { color: theme.colors.secondaryText }]}>
							{charge && charge.total > 0
								? (charge.flatApplied
									? t('withdraw.cashZones.chargeWithFlat', { amount: charge.total.toFixed(2), flat: Number(zone.small_flat_usd) })
									: t('withdraw.cashZones.charge', { amount: charge.total.toFixed(2) }))
								: t('withdraw.cashZones.chargePct', { pct: formatPct(zoneSurchargePct(zone, mode.globalMarginPct)) })}
						</Text>
						<Text style={[textStyles.caption, styles.line, { color: belowMin ? theme.colors.dangerText : theme.colors.secondaryText }]}>
							{t('withdraw.cashZones.minimum', { min: zone.min_usd })}
						</Text>
						{zone.home_delivery === false && (
							<Text style={[textStyles.caption, styles.line, { color: theme.colors.warning }]}>{t('withdraw.cashZones.noHomeDeliveryNotice')}</Text>
						)}
						<Text style={[textStyles.caption, styles.line, { color: theme.colors.tertiaryText }]}>{t('withdraw.cashZones.cancelNotice', { days: CASH_CANCEL_AFTER_DAYS })}</Text>
						{belowMin && (
							<Text style={[textStyles.caption, styles.line, { color: theme.colors.dangerText }]}>
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
	label: { marginBottom: 8 },
	trigger: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderRadius: 12, borderCurve: 'continuous', paddingHorizontal: 12, paddingVertical: 10, minHeight: 52 },
	triggerIcon: { width: 30, height: 30, borderRadius: 9, borderCurve: 'continuous', alignItems: 'center', justifyContent: 'center' },
	triggerTexts: { flex: 1, gap: 1 },
	disabled: { opacity: 0.5 },
	notice: { marginTop: 10, marginBottom: 6, padding: 12, borderRadius: 12 },
	line: { marginTop: 4 },
})

export default CashZoneFields
