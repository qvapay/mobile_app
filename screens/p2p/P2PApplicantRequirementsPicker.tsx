import { View, Text, ScrollView, StyleSheet } from 'react-native'
import FontAwesome6 from '@react-native-vector-icons/fontawesome6'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'

import QPPressable from '../../ui/particles/QPPressable'
import { REQUIREMENT_KEYS, REQUIREMENT_OPTIONS, EMPTY_REQUIREMENTS, activeRequirementsCount } from './p2pApplicantRequirements'
import type { ApplicantRequirements, ApplicantRequirementKey } from './p2pApplicantRequirements'
import type { Theme } from '../../theme/ThemeContext'
import type { TextStyles } from '../../theme/themeUtils'

type Props = {
	value: ApplicantRequirements
	onChange: (next: ApplicantRequirements) => void
	theme: Theme
	textStyles: TextStyles
}

/** Etiqueta de cada valor en su chip (i18n con el número interpolado). */
const formatValue = (t: TFunction, key: ApplicantRequirementKey, v: number) =>
	t(`p2p.create.requirements.values.${key}`, { value: key === 'min_rating' ? v.toFixed(1) : v })

/**
 * Requisitos para quien aplique, dentro del acordeón de opciones avanzadas del wizard de
 * crear oferta. Un selector de chips por requisito (valores cerrados, espejo del
 * `RequirementsPicker` de qpweb): "Sin requisito" + los valores permitidos.
 */
const P2PApplicantRequirementsPicker = ({ value, onChange, theme, textStyles }: Props) => {

	const { t } = useTranslation()
	const active = activeRequirementsCount(value)

	const chipStyle = (selected: boolean) => selected
		? { backgroundColor: theme.colors.primary }
		: theme.isDark
			? { backgroundColor: theme.colors.background }
			: { backgroundColor: 'transparent', borderWidth: 1, borderColor: theme.colors.border }

	return (
		<View style={{ gap: 12 }}>
			<View>
				<Text style={textStyles.h6}>{t('p2p.create.requirements.title')}</Text>
				<Text style={[textStyles.h7, { color: theme.colors.secondaryText, marginTop: 2 }]}>{t('p2p.create.requirements.hint')}</Text>
			</View>

			{REQUIREMENT_KEYS.map((key) => {
				const current = value[key]
				const options: (number | null)[] = [null, ...REQUIREMENT_OPTIONS[key]]
				return (
					<View key={key}>
						<Text style={[textStyles.h7, { color: theme.colors.secondaryText, marginBottom: 6 }]}>{t(`p2p.create.requirements.labels.${key}`)}</Text>
						<ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }} keyboardShouldPersistTaps="handled">
							{options.map((option) => {
								const selected = current === option
								return (
									<QPPressable
										key={option ?? 'none'}
										onPress={() => onChange({ ...value, [key]: option })}
										style={[styles.chip, chipStyle(selected)]}
										accessibilityState={{ selected }}
									>
										<Text style={[textStyles.caption, { fontWeight: '500', color: selected ? theme.colors.almostWhite : theme.colors.primaryText }]}>
											{option === null ? t('p2p.create.requirements.none') : formatValue(t, key, option)}
										</Text>
									</QPPressable>
								)
							})}
						</ScrollView>
					</View>
				)
			})}

			{value.min_trustscore != null && (
				<View style={styles.warningRow}>
					<FontAwesome6 name="triangle-exclamation" size={12} color={theme.colors.warning} iconStyle="solid" style={{ marginTop: 2 }} />
					<Text style={[textStyles.h7, { color: theme.colors.warning, flex: 1 }]}>{t('p2p.create.requirements.trustscoreWarning')}</Text>
				</View>
			)}

			{active > 0 && (
				<QPPressable onPress={() => onChange(EMPTY_REQUIREMENTS)} style={{ alignSelf: 'flex-start' }}>
					<Text style={[textStyles.h7, { color: theme.colors.secondaryText, textDecorationLine: 'underline' }]}>{t('p2p.create.requirements.clear')}</Text>
				</QPPressable>
			)}
		</View>
	)
}

const styles = StyleSheet.create({
	chip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999 },
	warningRow: { flexDirection: 'row', gap: 6 },
})

export default P2PApplicantRequirementsPicker
