import { useState } from "react"
import { View, Text, Pressable, Modal, ScrollView, StyleSheet } from "react-native"
import QPModalCard from "../../ui/QPModalCard"
import FontAwesome6 from "@react-native-vector-icons/fontawesome6"
import { useTranslation } from "react-i18next"

import QPAvatar from "../../ui/particles/QPAvatar"
import QPButton from "../../ui/particles/QPButton"
import QPInput from "../../ui/particles/QPInput"
import QPPressable from "../../ui/particles/QPPressable"
import QPKeyboardAvoidingView from "../../ui/QPKeyboardAvoidingView"
import { useModalGate } from "../../ui/useModalGate"
import type { ModalGate } from "../../ui/useModalGate"
import { displayName } from "../../helpers/displayName"
import { REPORT_DESCRIPTION_MAX, REPORT_REASONS } from "./userModeration"

import type { FontAwesome6SolidIconName } from "@react-native-vector-icons/fontawesome6"
import type { Theme } from "../../theme/ThemeContext"
import { scaleType } from "../../theme/themeUtils"
import type { TextStyles, ContainerStyles } from "../../theme/themeUtils"
import type { ReportForm, ReportReason } from "./userModeration"
import type { ModerationTarget, ModerationView } from "./useUserModeration"

type P2PUserModerationSheetProps = {
	/** Usuario y vista inicial; null = hoja cerrada. */
	target: ModerationTarget | null
	/** Yo lo tengo bloqueado: decide si el menú ofrece bloquear o desbloquear. */
	blocked: boolean
	busy: boolean
	onClose: () => void
	onReport: (form: ReportForm) => void
	onBlock: () => void
	onUnblock: () => void
	theme: Theme
	textStyles: TextStyles
	containerStyles: ContainerStyles
}

/**
 * Hoja de moderación de OTRO usuario: menú ⋯ (reportar · bloquear/desbloquear), el
 * formulario de reporte (motivo + detalles) y la confirmación de bloqueo, calcados de
 * los modales de la web. Es UNA sola `<Modal>` que cambia de vista por dentro: encadenar
 * dos Modal (menú → formulario) en iOS es la receta del modal zombi, y pasa por
 * `useModalGate` por lo mismo. Cada apertura remonta la tarjeta (`key`) para que el
 * formulario arranque en blanco.
 */
const P2PUserModerationSheet = ({ target, ...rest }: P2PUserModerationSheetProps) => {
	const gate = useModalGate(!!target)
	const [shown, setShown] = useState(target)
	if (target && target !== shown) setShown(target)
	return gate.mounted && shown ? <SheetCard key={gate.generation} target={shown} gate={gate} {...rest} /> : null
}

type CardProps = Omit<P2PUserModerationSheetProps, 'target'> & { target: ModerationTarget, gate: ModalGate }

const SheetCard = ({ target, gate, blocked, busy, onClose, onReport, onBlock, onUnblock, theme, textStyles, containerStyles }: CardProps) => {

	const { t } = useTranslation()
	const [view, setView] = useState<ModerationView>(target.view)
	const [reason, setReason] = useState<ReportReason | null>(null)
	const [description, setDescription] = useState("")

	const peer = target.user
	const username = peer.username ?? ""
	const close = () => { if (!busy) onClose() }

	return (
		<Modal visible={gate.visible} onShow={gate.onShow} onDismiss={gate.onDismiss} transparent animationType="fade" statusBarTranslucent onRequestClose={close}>
			{/* El formulario de reporte abre el teclado: en Android edge-to-edge hay que reservarlo a mano */}
			<QPKeyboardAvoidingView style={styles.fill}>
				<Pressable style={containerStyles.modalOverlay} onPress={close}>
					<QPModalCard style={styles.card} testID="moderation-sheet">

						{view === "menu" && (
							<>
								<View style={[styles.header, { borderBottomColor: theme.colors.border }]}>
									<QPAvatar user={peer} size={40} />
									<View style={styles.headerText}>
										<Text style={[textStyles.h5, { color: theme.colors.primaryText }]} numberOfLines={1}>{displayName(peer)}</Text>
										{username ? <Text style={[textStyles.h7, { color: theme.colors.secondaryText }]} numberOfLines={1}>@{username}</Text> : null}
									</View>
								</View>
								<MenuRow icon="flag" label={t('p2p.moderation.report')} onPress={() => setView("report")} theme={theme} textStyles={textStyles} testID="moderation-report" />
								{blocked
									? <MenuRow icon="user-check" label={t('p2p.moderation.unblock')} onPress={() => setView("unblock")} theme={theme} textStyles={textStyles} testID="moderation-unblock" />
									: <MenuRow icon="user-slash" label={t('p2p.moderation.block')} onPress={() => setView("block")} danger theme={theme} textStyles={textStyles} testID="moderation-block" />}
							</>
						)}

						{view === "report" && (
							<ScrollView keyboardShouldPersistTaps="handled" bounces={false} showsVerticalScrollIndicator={false}>
								<View style={styles.titleRow}>
									<FontAwesome6 name="flag" size={18} color={theme.colors.warning} iconStyle="solid" />
									<Text style={[textStyles.h4, { color: theme.colors.primaryText }]} numberOfLines={1}>{t('p2p.moderation.reportSheet.title', { username })}</Text>
								</View>
								<Text style={[textStyles.h6, styles.subtitle, { color: theme.colors.secondaryText }]}>{t('p2p.moderation.reportSheet.subtitle')}</Text>

								<Text style={[textStyles.h7, styles.label, { color: theme.colors.secondaryText }]}>{t('p2p.moderation.reportSheet.reasonLabel')}</Text>
								<View style={styles.reasons}>
									{REPORT_REASONS.map(key => {
										const active = reason === key
										return (
											<QPPressable
												key={key}
												onPress={() => setReason(key)}
												disabled={busy}
												accessibilityRole="button"
												accessibilityState={{ selected: active }}
												testID={`moderation-reason-${key}`}
												style={[styles.reason, active
													? { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary }
													: [styles.reasonIdle, { borderColor: theme.colors.border }]]}
											>
												<Text style={[textStyles.h7, { color: active ? theme.colors.almostWhite : theme.colors.secondaryText }]}>{t(`p2p.moderation.reportSheet.reasons.${key}`)}</Text>
											</QPPressable>
										)
									})}
								</View>

								<QPInput
									value={description}
									onChangeText={setDescription}
									placeholder={t('p2p.moderation.reportSheet.descriptionPlaceholder')}
									prelabel={t('p2p.moderation.reportSheet.descriptionLabel')}
									maxLength={REPORT_DESCRIPTION_MAX}
									multiline
									editable={!busy}
									textAlignVertical="top"
								/>
								<Text style={[textStyles.h7, styles.counter, { color: theme.colors.tertiaryText }]}>{description.length}/{REPORT_DESCRIPTION_MAX}</Text>

								<QPButton
									title={t('p2p.moderation.reportSheet.submit')}
									onPress={() => onReport({ reason, description })}
									style={styles.submit}
									loading={busy}
									disabled={!reason || busy}
								/>
								<CancelLink onPress={close} disabled={busy} theme={theme} textStyles={textStyles} />
							</ScrollView>
						)}

						{(view === "block" || view === "unblock") && (
							<View>
								<FontAwesome6
									name={view === "block" ? "user-slash" : "user-check"}
									size={40}
									color={view === "block" ? theme.colors.danger : theme.colors.primary}
									iconStyle="solid"
									style={styles.icon}
								/>
								<Text style={[textStyles.h3, styles.confirmTitle, { color: theme.colors.primaryText }]}>{t(`p2p.moderation.${view}Sheet.title`, { username })}</Text>
								<Text style={[textStyles.body, styles.confirmBody, { color: theme.colors.secondaryText, lineHeight: scaleType(theme, 22) }]}>{t(`p2p.moderation.${view}Sheet.body`)}</Text>
								<QPButton
									title={t(`p2p.moderation.${view}Sheet.confirm`)}
									onPress={view === "block" ? onBlock : onUnblock}
									style={[styles.submit, view === "block" && { backgroundColor: theme.colors.danger }]}
									loading={busy}
									disabled={busy}
								/>
								<CancelLink onPress={close} disabled={busy} theme={theme} textStyles={textStyles} />
							</View>
						)}

					</QPModalCard>
				</Pressable>
			</QPKeyboardAvoidingView>
		</Modal>
	)
}

type MenuRowProps = {
	icon: FontAwesome6SolidIconName
	label: string
	onPress: () => void
	danger?: boolean
	theme: Theme
	textStyles: TextStyles
	testID?: string
}

const MenuRow = ({ icon, label, onPress, danger = false, theme, textStyles, testID }: MenuRowProps) => {
	const color = danger ? theme.colors.danger : theme.colors.primaryText
	return (
		<Pressable onPress={onPress} style={styles.row} accessibilityRole="button" testID={testID}>
			<FontAwesome6 name={icon} size={16} color={color} iconStyle="solid" style={styles.rowIcon} />
			<Text style={[textStyles.h5, { color }]}>{label}</Text>
		</Pressable>
	)
}

const CancelLink = ({ onPress, disabled, theme, textStyles }: { onPress: () => void, disabled: boolean, theme: Theme, textStyles: TextStyles }) => {
	const { t } = useTranslation()
	return (
		<QPPressable onPress={onPress} disabled={disabled} style={styles.cancel} accessibilityRole="button">
			<Text style={[textStyles.h6, { color: theme.colors.secondaryText }]}>{t('common.actions.cancel')}</Text>
		</QPPressable>
	)
}

const styles = StyleSheet.create({
	fill: { flex: 1 },
	card: { maxHeight: "85%" },
	header: { flexDirection: "row", alignItems: "center", gap: 12, paddingBottom: 12, marginBottom: 4, borderBottomWidth: StyleSheet.hairlineWidth },
	headerText: { flex: 1 },
	row: { flexDirection: "row", alignItems: "center", paddingVertical: 14 },
	rowIcon: { width: 28 },
	titleRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, marginBottom: 4 },
	subtitle: { textAlign: "center", marginBottom: 16 },
	label: { marginBottom: 8 },
	reasons: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 16 },
	reason: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, borderWidth: 1 },
	reasonIdle: { backgroundColor: "transparent" },
	counter: { textAlign: "right", marginTop: 4 },
	icon: { alignSelf: "center", marginBottom: 16 },
	confirmTitle: { textAlign: "center", marginBottom: 8 },
	confirmBody: { textAlign: "center", marginBottom: 8 },
	submit: { marginTop: 16 },
	cancel: { alignSelf: "center", paddingVertical: 12, paddingHorizontal: 16, marginTop: 4 },
})

export default P2PUserModerationSheet
