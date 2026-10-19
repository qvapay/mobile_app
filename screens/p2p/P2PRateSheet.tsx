import { useState } from "react"
import { View, Text, Pressable, Modal, ScrollView, StyleSheet } from "react-native"
import FontAwesome6 from "@react-native-vector-icons/fontawesome6"
import { useTranslation } from "react-i18next"

import QPAvatar from "../../ui/particles/QPAvatar"
import QPButton from "../../ui/particles/QPButton"
import QPInput from "../../ui/particles/QPInput"
import QPPressable from "../../ui/particles/QPPressable"
import QPRate from "../../ui/particles/QPRate"
import QPKeyboardAvoidingView from "../../ui/QPKeyboardAvoidingView"
import { displayName } from "../../helpers/displayName"
import { formatCents, toCents } from "./p2pFlexible"
import { RATING_COMMENT_MAX, RATING_TAGS } from "./p2pRating"

import type { Theme } from "../../theme/ThemeContext"
import type { TextStyles, ContainerStyles } from "../../theme/themeUtils"
import type { P2PRatingTag } from "../../types/domain"
import type { RatingForm } from "./p2pRating"
import type { RateTarget } from "./useP2POfferDetail"

type P2PRateSheetProps = {
	/** Trato a valorar; null = hoja cerrada. */
	target: RateTarget | null
	loading: boolean
	onClose: () => void
	onSubmit: (form: RatingForm) => void
	theme: Theme
	textStyles: TextStyles
	containerStyles: ContainerStyles
}

const TAG_ICONS: Record<P2PRatingTag, "bolt" | "handshake" | "comments"> = {
	rapido: "bolt",
	confiable: "handshake",
	comunicacion: "comments",
}

/**
 * Hoja de valoración de un trato P2P cerrado (oferta fija u orden por rango),
 * calcada del `P2PRatingModal` de la web: contraparte, 5 estrellas obligatorias,
 * etiquetas rápidas y comentario opcional de 120 caracteres. "Omitir" la cierra
 * sin valorar (el botón Valorar sigue disponible). Se desmonta al cerrarse, así
 * que cada apertura arranca en blanco.
 */
const P2PRateSheet = ({ target, ...rest }: P2PRateSheetProps) => (target ? <RateSheetCard target={target} {...rest} /> : null)

const RateSheetCard = ({ target, loading, onClose, onSubmit, theme, textStyles, containerStyles }: P2PRateSheetProps & { target: RateTarget }) => {

	const { t } = useTranslation()
	const [rating, setRating] = useState(0)
	const [tags, setTags] = useState<P2PRatingTag[]>([])
	const [comment, setComment] = useState("")

	const close = () => { if (!loading) onClose() }
	const toggleTag = (tag: P2PRatingTag) => setTags(prev => (prev.includes(tag) ? prev.filter(x => x !== tag) : [...prev, tag]))

	const peer = target.counterparty
	const name = displayName(peer)
	const deal = t('p2p.rating.deal', { amount: formatCents(toCents(target.amount)), receive: target.receive, coin: target.coinName })

	return (
		<Modal visible transparent animationType="fade" statusBarTranslucent onRequestClose={close}>
			{/* El comentario abre el teclado: en Android edge-to-edge hay que reservarlo a mano */}
			<QPKeyboardAvoidingView style={styles.fill}>
				<Pressable style={containerStyles.modalOverlay} onPress={close}>
					<Pressable onPress={() => { }} style={[containerStyles.modalCard, styles.card]}>
						<ScrollView keyboardShouldPersistTaps="handled" bounces={false} showsVerticalScrollIndicator={false}>

							<View style={styles.titleRow}>
								<FontAwesome6 name="circle-check" size={18} color={theme.colors.successText} iconStyle="solid" />
								<Text style={[textStyles.h4, { color: theme.colors.primaryText }]}>{t('p2p.rating.title')}</Text>
							</View>
							<Text style={[textStyles.h6, styles.subtitle, { color: theme.colors.secondaryText }]}>
								{peer?.username ? t('p2p.rating.subtitle', { username: peer.username }) : t('p2p.rating.subtitleFallback')}
							</Text>

							<View style={styles.peer}>
								<QPAvatar user={peer} size={64} />
								{name ? <Text style={[textStyles.h5, { color: theme.colors.primaryText }]} numberOfLines={1}>{name}</Text> : null}
								{peer?.username ? <Text style={[textStyles.h7, { color: theme.colors.secondaryText }]}>@{peer.username}</Text> : null}
								<Text style={[textStyles.h7, styles.deal, { color: theme.colors.tertiaryText }]}>{deal}</Text>
							</View>

							<View style={styles.stars}>
								<QPRate value={rating} onRate={setRating} size={36} spacing={10} readOnly={loading} />
							</View>

							<View style={styles.tags}>
								{RATING_TAGS.map(tag => {
									const active = tags.includes(tag)
									return (
										<QPPressable
											key={tag}
											onPress={() => toggleTag(tag)}
											disabled={loading}
											accessibilityRole="button"
											accessibilityState={{ selected: active }}
											style={[styles.tag, active
												? { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary }
												: [styles.tagIdle, { borderColor: theme.colors.border }]]}
										>
											<FontAwesome6 name={TAG_ICONS[tag]} size={12} color={active ? theme.colors.almostWhite : theme.colors.secondaryText} iconStyle="solid" />
											<Text style={[textStyles.h7, { color: active ? theme.colors.almostWhite : theme.colors.secondaryText }]}>{t(`p2p.rating.tags.${tag}`)}</Text>
										</QPPressable>
									)
								})}
							</View>

							<QPInput
								value={comment}
								onChangeText={setComment}
								placeholder={t('p2p.rating.commentPlaceholder')}
								prelabel={t('p2p.rating.commentLabel')}
								maxLength={RATING_COMMENT_MAX}
								multiline
								editable={!loading}
								textAlignVertical="top"
								style={{ backgroundColor: theme.colors.background }}
							/>
							<Text style={[textStyles.h7, styles.counter, { color: theme.colors.tertiaryText }]}>{comment.length}/{RATING_COMMENT_MAX}</Text>

							<QPButton
								title={t('p2p.rating.submit')}
								onPress={() => onSubmit({ rating, tags, comment })}
								style={styles.submit}
								loading={loading}
								disabled={rating < 1 || loading}
							/>
							<QPPressable onPress={close} disabled={loading} style={styles.skip} accessibilityRole="button">
								<Text style={[textStyles.h6, { color: theme.colors.secondaryText }]}>{t('p2p.rating.skip')}</Text>
							</QPPressable>

						</ScrollView>
					</Pressable>
				</Pressable>
			</QPKeyboardAvoidingView>
		</Modal>
	)
}

const styles = StyleSheet.create({
	fill: { flex: 1 },
	card: { maxHeight: "85%" },
	titleRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, marginBottom: 4 },
	subtitle: { textAlign: "center", marginBottom: 16 },
	peer: { alignItems: "center", gap: 4, marginBottom: 16 },
	deal: { marginTop: 2 },
	stars: { alignItems: "center", marginBottom: 16 },
	tags: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 8, marginBottom: 16 },
	tag: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, borderWidth: 1 },
	tagIdle: { backgroundColor: "transparent" },
	counter: { textAlign: "right", marginTop: 4 },
	submit: { marginTop: 16 },
	skip: { alignSelf: "center", paddingVertical: 12, paddingHorizontal: 16, marginTop: 4 },
})

export default P2PRateSheet
