import { useState, useMemo } from 'react'
import { Modal, View, Text, ScrollView, Pressable, StyleSheet, KeyboardAvoidingView, Platform, useWindowDimensions } from 'react-native'
import { useTranslation } from 'react-i18next'
import FontAwesome6 from '@react-native-vector-icons/fontawesome6'

// Theme
import { useTheme } from '../theme/ThemeContext'
import { createTextStyles } from '../theme/themeUtils'

// UI
import QPButton from './particles/QPButton'
import QPInput from './particles/QPInput'
import QPCheckbox from './particles/QPCheckbox'
import QPPressable from './particles/QPPressable'

// Compliance
import {
	ATTESTATION_KEYS,
	PURPOSE_NOTE_MAX,
	buildCompliancePayload,
	initialComplianceValue,
	isComplianceComplete,
	purposesForScope,
} from '../helpers/ofacCompliance'
import type { OfacComplianceValue, OfacCompliancePayload, OfacContext, OfacScope, OfacAttestationKey } from '../helpers/ofacCompliance'
import { OFAC_LANGUAGES, defaultOfacLanguage, ofacCopyFor } from '../helpers/ofacCopy'
import type { OfacLanguage } from '../helpers/ofacCopy'

export type OfacAttestationModalProps = {
	visible: boolean
	scope: OfacScope
	context: OfacContext
	/** Tick de la operación: precarga el propósito (ETECSA ⇒ P-4). */
	tick?: string | null
	onConfirm: (payload: OfacCompliancePayload) => void
	onClose: () => void
}

/**
 * Certificación OFAC (CACR, 31 CFR Part 515) antes de una operación de dinero:
 * propósito P-1…P-4 (o W-1 fijo en retiros cripto), las cuatro casillas, nota
 * opcional y pie legal. Espejo del `OfacComplianceBlock` de qpweb — el texto
 * legal sale de `helpers/ofacCopy` en es/en (selector propio), no de i18n.
 *
 * El formulario nace vacío en cada apertura (nunca se presume la atestación) y
 * el botón solo se habilita con todo marcado; `onConfirm` recibe el payload
 * `compliance` listo para el backend.
 */
const OfacAttestationModal = ({ visible, scope, context, tick, onConfirm, onClose }: OfacAttestationModalProps) => {

	const { t, i18n } = useTranslation()
	const { theme, styles: themeStyles } = useTheme()
	const textStyles = createTextStyles(theme)
	const { height } = useWindowDimensions()

	const [value, setValue] = useState<OfacComplianceValue>(() => initialComplianceValue(tick, scope))
	const [language, setLanguage] = useState<OfacLanguage>(() => defaultOfacLanguage(i18n.language))

	// Reinicio en cada apertura (patrón "ajustar estado al cambiar una prop", sin efecto)
	const [openKey, setOpenKey] = useState({ visible, scope, tick })
	if (openKey.visible !== visible || openKey.scope !== scope || openKey.tick !== tick) {
		setOpenKey({ visible, scope, tick })
		if (visible) {
			setValue(initialComplianceValue(tick, scope))
			setLanguage(defaultOfacLanguage(i18n.language))
		}
	}

	const copy = useMemo(() => ofacCopyFor(context, language), [context, language])
	const purposes = purposesForScope(scope)
	const singlePurpose = purposes.length === 1
	const checkedCount = ATTESTATION_KEYS.filter(k => value.attestations[k]).length
	const complete = isComplianceComplete(value, scope)
	const selectedPurpose = copy.purposes[value.purposeCode]

	const toggle = (key: OfacAttestationKey) => setValue(v => ({ ...v, attestations: { ...v.attestations, [key]: !v.attestations[key] } }))

	const handleConfirm = () => {
		const payload = buildCompliancePayload(value, scope, language)
		if (payload) onConfirm(payload)
	}

	const surfaceBorder = !theme.isDark && { borderWidth: 1, borderColor: theme.colors.border }
	const unselectedBorder = theme.isDark ? 'transparent' : theme.colors.border

	return (
		<Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={onClose}>
			<KeyboardAvoidingView style={styles.fill} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
				<Pressable style={themeStyles.container.modalOverlay} onPress={onClose}>
					<Pressable onPress={() => { }} style={[themeStyles.container.modalCard, styles.card, { maxHeight: height * 0.85 }]}>

						{/* Cabecera: escudo + título + selector de idioma del texto legal */}
						<View style={styles.header}>
							<View style={[styles.headerIcon, { backgroundColor: theme.colors.warning + '26' }]}>
								<FontAwesome6 name="shield-halved" size={18} color={theme.colors.warning} iconStyle="solid" />
							</View>
							<View style={styles.headerText}>
								<Text style={[textStyles.h5, { color: theme.colors.primaryText }]}>{copy.title}</Text>
								<Text style={[textStyles.caption, { color: theme.colors.secondaryText }]}>{copy.kicker}</Text>
							</View>
							<View style={[styles.langToggle, { borderColor: theme.colors.border }]} accessibilityRole="radiogroup" accessibilityLabel={t('ui.ofac.languageLabel')}>
								{OFAC_LANGUAGES.map(l => (
									<Pressable
										key={l}
										onPress={() => setLanguage(l)}
										accessibilityRole="radio"
										accessibilityState={{ selected: language === l }}
										style={[styles.langOption, language === l && { backgroundColor: theme.colors.primary }]}
									>
										<Text style={[textStyles.caption, { color: language === l ? theme.colors.almostWhite : theme.colors.secondaryText, fontFamily: theme.typography.fontFamily.medium }]}>{l.toUpperCase()}</Text>
									</Pressable>
								))}
							</View>
						</View>

						<ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>

							<Text style={[textStyles.caption, styles.paragraph, { color: theme.colors.secondaryText }]}>{copy.paragraph}</Text>

							{/* Propósito: W-1 es único (tarjeta fija); en Cuba/fondeo se elige */}
							{!singlePurpose && <Text style={[textStyles.caption, styles.sectionLabel, { color: theme.colors.primaryText }]}>{copy.purposeLabel}</Text>}
							<View style={styles.purposes}>
								{purposes.map(code => {
									const selected = value.purposeCode === code
									return (
											<QPPressable
												key={code}
												variant="opacity"
												disabled={singlePurpose}
												onPress={() => setValue(v => ({ ...v, purposeCode: code }))}
												accessibilityRole={singlePurpose ? undefined : 'radio'}
												accessibilityState={singlePurpose ? undefined : { selected }}
												style={[
													styles.purpose,
													{ backgroundColor: theme.colors.background },
													{ borderColor: selected ? theme.colors.primary : unselectedBorder },
												]}
											>
												<View style={styles.purposeRow}>
													<Text style={[textStyles.body, styles.flex, { color: theme.colors.primaryText }]}>{copy.purposes[code].label}</Text>
													<Text style={[textStyles.caption, { color: theme.colors.secondaryText }]}>{code}</Text>
												</View>
												{selected && <Text style={[textStyles.caption, styles.purposeSummary, { color: theme.colors.secondaryText }]}>{selectedPurpose.summary}</Text>}
											</QPPressable>
									)
								})}
							</View>

							{/* Las cuatro casillas */}
							<View style={[styles.certifyRow, styles.sectionLabel]}>
								<Text style={[textStyles.caption, { color: theme.colors.primaryText }]}>{copy.certify}</Text>
								<Text style={[textStyles.caption, { color: complete ? theme.colors.successText : theme.colors.secondaryText }]}>{checkedCount}/{ATTESTATION_KEYS.length}</Text>
							</View>
							{ATTESTATION_KEYS.map(key => {
								const checked = value.attestations[key]
								return (
									<QPPressable
										key={key}
										variant="opacity"
										onPress={() => toggle(key)}
										accessibilityRole="checkbox"
										accessibilityState={{ checked }}
										testID={`ofac-attestation-${key}`}
										style={[styles.attestation, { backgroundColor: theme.colors.background }, surfaceBorder]}
									>
										<QPCheckbox checked={checked} size={20} color={theme.colors.successFill} style={styles.checkbox} />
										<Text style={[textStyles.caption, styles.flex, styles.attestationText, { color: theme.colors.primaryText }]}>{copy.attestations[key]}</Text>
									</QPPressable>
								)
							})}

							{/* Nota opcional */}
							<Text style={[textStyles.caption, styles.sectionLabel, { color: theme.colors.primaryText }]}>{copy.noteLabel}</Text>
							<QPInput
								value={value.purposeNote}
								onChangeText={(text: string) => setValue(v => ({ ...v, purposeNote: text.slice(0, PURPOSE_NOTE_MAX) }))}
								placeholder={copy.notePlaceholder}
								maxLength={PURPOSE_NOTE_MAX}
								multiline
							/>

							<Text style={[textStyles.caption, styles.footer, { color: theme.colors.secondaryText, borderTopColor: theme.colors.warning + '33' }]}>{copy.footer}</Text>
						</ScrollView>

						<View style={styles.buttonsRow}>
							<QPButton
								title={t('ui.ofac.cancel')}
								onPress={onClose}
								style={[styles.button, styles.cancelButton, { borderColor: theme.colors.border }]}
								textStyle={{ color: theme.colors.primaryText }}
							/>
							<QPButton
								title={t('ui.ofac.confirm')}
								onPress={handleConfirm}
								disabled={!complete}
								testID="ofac-attestation-confirm"
								style={[styles.button, { backgroundColor: theme.colors.primary }]}
								textStyle={{ color: theme.colors.almostWhite }}
							/>
						</View>

					</Pressable>
				</Pressable>
			</KeyboardAvoidingView>
		</Modal>
	)
}

const styles = StyleSheet.create({
	fill: { flex: 1 },
	flex: { flex: 1 },
	card: { padding: 20 },
	header: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 },
	headerIcon: { width: 38, height: 38, borderRadius: 11, borderCurve: 'continuous', alignItems: 'center', justifyContent: 'center' },
	headerText: { flex: 1, gap: 2 },
	langToggle: { flexDirection: 'row', borderWidth: 1, borderRadius: 8, borderCurve: 'continuous', overflow: 'hidden' },
	langOption: { paddingHorizontal: 9, paddingVertical: 4 },
	scroll: { flexGrow: 0, flexShrink: 1 },
	scrollContent: { paddingBottom: 4 },
	paragraph: { lineHeight: 18 },
	sectionLabel: { marginTop: 16, marginBottom: 8 },
	purposes: { gap: 8, marginTop: 8 },
	purpose: { borderRadius: 12, borderCurve: 'continuous', borderWidth: 1.5, paddingHorizontal: 12, paddingVertical: 10 },
	purposeRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
	purposeSummary: { marginTop: 4, fontStyle: 'italic', lineHeight: 17 },
	certifyRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
	attestation: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, borderRadius: 12, borderCurve: 'continuous', padding: 12, marginBottom: 8 },
	checkbox: { marginTop: 1 },
	attestationText: { lineHeight: 18 },
	footer: { marginTop: 16, paddingTop: 12, borderTopWidth: 1, lineHeight: 17 },
	buttonsRow: { flexDirection: 'row', gap: 10, marginTop: 16 },
	button: { flex: 1 },
	cancelButton: { backgroundColor: 'transparent', borderWidth: 1.5 },
})

export default OfacAttestationModal
