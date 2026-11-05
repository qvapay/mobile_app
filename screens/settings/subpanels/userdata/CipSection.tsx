import { useState } from 'react'
import { StyleSheet, Switch, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'

// Theme
import { useTheme } from '../../../../theme/ThemeContext'
import { useContainerStyles, useTextStyles } from '../../../../theme/themeUtils'

// UI
import QPInput from '../../../../ui/particles/QPInput'
import QPPressable from '../../../../ui/particles/QPPressable'
import OptionPickerModal from '../../../../ui/OptionPickerModal'
import AddressAutocomplete from '../../../../ui/AddressAutocomplete'
import type { PlaceAddress } from '../../../../ui/AddressAutocomplete'

// Icons
import FontAwesome6 from '@react-native-vector-icons/fontawesome6'

// Form logic (pure)
import { CIP_US_STATES, US_STATE_CODES, formatSsnInput, SSN_MAX_LENGTH } from './cipForm'
import type { CipField, CipForm } from './cipForm'

type Props = {
	form: CipForm
	onChange: (patch: Partial<CipForm>) => void
	/** Últimos 4 del SSN guardado en la ficha (null si no hay). */
	savedLast4: string | null
	/** `cip_status === 'complete'` según el servidor. */
	complete: boolean
	/** Campo a resaltar en rojo (validación o `block_reason` de dato faltante). */
	highlight: CipField | null
}

const STATE_OPTIONS = CIP_US_STATES.map(s => ({ value: s.code, label: s.name }))

/**
 * Sección «Datos de tu cuenta» de Datos personales: la ficha CIP (BSA §1022.210).
 * Interruptor «Soy persona de EE. UU.» y, con él activo, SSN/ITIN (nunca se devuelve
 * en claro: con uno guardado el campo queda en blanco y dice «guardado ···1234») y la
 * dirección de EE. UU. estructurada con el estado en un selector. Calco de
 * `components/settings/CipIdentityBlock.js` de qpweb. El guardado lo hace la pantalla
 * (viaja junto al resto del perfil en `POST /user/update`).
 */
const CipSection = ({ form, onChange, savedLast4, complete, highlight }: Props) => {

	const { t } = useTranslation()
	const { theme } = useTheme()
	const textStyles = useTextStyles(theme)
	const containerStyles = useContainerStyles(theme)
	const [statePickerOpen, setStatePickerOpen] = useState(false)

	const highlightStyle = (field: CipField) => (highlight === field ? { borderColor: theme.colors.danger, borderWidth: 1 } : null)
	const stateLabel = STATE_OPTIONS.find(o => o.value === form.addrState)?.label

	return (
		<View style={styles.section} testID="cip-section">
			<View style={styles.header}>
				<FontAwesome6 name="id-card-clip" size={14} color={theme.colors.primary} iconStyle="solid" />
				<Text style={[textStyles.h5, { color: theme.colors.secondaryText, marginLeft: 8, marginBottom: 0, flex: 1 }]}>{t('settings.userdata.cip.section')}</Text>
				{complete && (
					<View style={[styles.pill, { backgroundColor: theme.colors.successFill }]}>
						<Text style={[textStyles.caption, { color: theme.colors.successFillText, fontFamily: theme.typography.fontFamily.medium }]}>{t('settings.userdata.cip.complete')}</Text>
					</View>
				)}
			</View>
			<Text style={[textStyles.caption, { color: theme.colors.secondaryText, marginBottom: 10 }]}>{t('settings.userdata.cip.intro')}</Text>

			{/* Interruptor: persona de EE. UU. */}
			<View style={[containerStyles.card, styles.toggleRow, highlightStyle('usPerson')]} testID="cip-us-person-row">
				<View style={styles.toggleTexts}>
					<Text style={[textStyles.h4, { marginBottom: 0 }]}>{t('settings.userdata.cip.usPerson')}</Text>
					<Text style={[textStyles.caption, { color: theme.colors.secondaryText, marginTop: 2 }]}>{t('settings.userdata.cip.usPersonHint')}</Text>
				</View>
				<Switch
					value={form.usPerson}
					onValueChange={(value: boolean) => onChange({ usPerson: value })}
					trackColor={{ false: theme.colors.tertiaryText, true: theme.colors.primary }}
					testID="cip-us-person-switch"
				/>
			</View>

			{/* Casilla apagada con un SSN guardado: guardar lo borra */}
			{!form.usPerson && !!savedLast4 && (
				<View style={styles.warningRow}>
					<FontAwesome6 name="triangle-exclamation" size={12} color={theme.colors.warning} iconStyle="solid" />
					<Text style={[textStyles.caption, { color: theme.colors.warning, flex: 1 }]}>{t('settings.userdata.cip.ssnRemovalWarning', { last4: savedLast4 })}</Text>
				</View>
			)}

			{form.usPerson && (
				<View style={styles.fields}>
					<QPInput
						prelabel={t('settings.userdata.cip.ssnLabel')}
						placeholder={t('settings.userdata.cip.ssnPlaceholder')}
						value={form.ssn}
						onChangeText={(text: string) => onChange({ ssn: formatSsnInput(text) })}
						keyboardType="number-pad"
						maxLength={SSN_MAX_LENGTH}
						secureTextEntry
						suffixIconName="eye"
						prefixIconName="hashtag"
						autoComplete="off"
						style={highlightStyle('ssn')}
						testID="cip-ssn"
					/>
					{!!savedLast4 && (
						<Text style={[textStyles.caption, styles.fieldHint, { color: theme.colors.secondaryText }]}>{t('settings.userdata.cip.ssnSaved', { last4: savedLast4 })}</Text>
					)}

					<Text style={[textStyles.h6, { color: theme.colors.secondaryText, marginTop: 12, marginBottom: 4 }]}>{t('settings.userdata.cip.addressTitle')}</Text>
					{/* Google Places vía el backend (mismo buscador que la dirección de envío); elegir
					    una sugerencia rellena los campos, que siguen siendo editables */}
					<AddressAutocomplete onSelect={(place: PlaceAddress) => onChange({
						...(place.line1 && { addrLine1: place.line1 }),
						...(place.city && { addrCity: place.city }),
						...(place.state && US_STATE_CODES.has(place.state) && { addrState: place.state }),
						...(place.postal_code && { addrPostal: place.postal_code }),
					})} />
					<QPInput
						placeholder={t('settings.userdata.cip.line1')}
						value={form.addrLine1}
						onChangeText={(text: string) => onChange({ addrLine1: text })}
						autoCapitalize="words"
						prefixIconName="location-dot"
						style={highlightStyle('addrLine1')}
						testID="cip-line1"
					/>
					<QPInput
						placeholder={t('settings.userdata.cip.line2')}
						value={form.addrLine2}
						onChangeText={(text: string) => onChange({ addrLine2: text })}
						autoCapitalize="words"
						prefixIconName="building"
					/>
					<QPInput
						placeholder={t('settings.userdata.cip.city')}
						value={form.addrCity}
						onChangeText={(text: string) => onChange({ addrCity: text })}
						autoCapitalize="words"
						prefixIconName="city"
						style={highlightStyle('addrCity')}
						testID="cip-city"
					/>
					<View style={styles.row}>
						<QPPressable
							onPress={() => setStatePickerOpen(true)}
							style={[styles.stateRow, { backgroundColor: theme.colors.surface, borderColor: theme.isDark ? 'transparent' : theme.colors.border }, highlightStyle('addrState')]}
							accessibilityRole="button"
							testID="cip-state"
						>
							<Text style={[textStyles.body, { color: stateLabel ? theme.colors.primaryText : theme.colors.tertiaryText, flex: 1 }]} numberOfLines={1}>
								{stateLabel ?? t('settings.userdata.cip.state')}
							</Text>
							<FontAwesome6 name="chevron-down" size={12} color={theme.colors.secondaryText} iconStyle="solid" />
						</QPPressable>
						<View style={styles.zip}>
							<QPInput
								placeholder={t('settings.userdata.cip.zip')}
								value={form.addrPostal}
								onChangeText={(text: string) => onChange({ addrPostal: text.replace(/[^\d-]/g, '').slice(0, 10) })}
								keyboardType="number-pad"
								maxLength={10}
								style={highlightStyle('addrPostal')}
								testID="cip-zip"
							/>
						</View>
					</View>
					<QPInput value={t('settings.userdata.cip.country')} editable={false} prefixIconName="flag-usa" style={styles.readonly} />

					<View style={styles.privacyRow}>
						<FontAwesome6 name="lock" size={12} color={theme.colors.tertiaryText} iconStyle="solid" />
						<Text style={[textStyles.caption, { color: theme.colors.tertiaryText, flex: 1 }]}>{t('settings.userdata.cip.privacy')}</Text>
					</View>
				</View>
			)}

			<OptionPickerModal
				visible={statePickerOpen}
				title={t('settings.userdata.cip.statePicker')}
				options={STATE_OPTIONS}
				selected={form.addrState}
				onSelect={(code: string) => { onChange({ addrState: code }); setStatePickerOpen(false) }}
				onClose={() => setStatePickerOpen(false)}
				searchable
			/>
		</View>
	)
}

const styles = StyleSheet.create({
	section: { marginTop: 10 },
	header: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
	pill: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 999 },
	toggleRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
	toggleTexts: { flex: 1 },
	warningRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginTop: 10, paddingHorizontal: 4 },
	fields: { marginTop: 4 },
	fieldHint: { marginTop: -4, marginBottom: 6, paddingHorizontal: 4 },
	row: { flexDirection: 'row', gap: 10, alignItems: 'center' },
	// Misma altura y radio que QPInput para que la fila no cojee
	stateRow: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, height: 50, paddingHorizontal: 15, borderRadius: 10, borderWidth: 1, marginVertical: 5 },
	zip: { flex: 1 },
	readonly: { opacity: 0.6 },
	privacyRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4, paddingHorizontal: 4 },
})

export default CipSection
