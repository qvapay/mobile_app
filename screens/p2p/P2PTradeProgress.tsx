import { View, Text, StyleSheet } from "react-native"
import FontAwesome6 from "@react-native-vector-icons/fontawesome6"
import { useTranslation } from "react-i18next"

import QPCoin from "../../ui/particles/QPCoin"
import QPInput from "../../ui/particles/QPInput"

import usePaymentWindow from "./usePaymentWindow"

import type { TFunction } from "i18next"
import type { Theme } from "../../theme/ThemeContext"
import type { TextStyles, ContainerStyles } from "../../theme/themeUtils"
import type { P2POffer, P2PStatus } from "../../types/domain"

type P2PTradeProgressProps = {
	p2p: P2POffer | null
	status: P2PStatus
	isPayer: boolean
	isReceiver: boolean
	canMarkPaid: boolean
	txIdInput: string
	setTxIdInput: (value: string) => void
	theme: Theme
	textStyles: TextStyles
	containerStyles: ContainerStyles
}

// Trade lifecycle steps: the payer pays → marks it → the receiver releases.
// Builder (no module-level copy): resolved with t() per render so the stepper
// re-labels itself on a live language switch.
const getSteps = (t: TFunction): string[] => [t('p2p.tradeProgress.steps.payment'), t('p2p.tradeProgress.steps.confirmation'), t('p2p.tradeProgress.steps.release')]

/**
 * Trade-room progress card (industry pattern: the Binance/OKX order screen):
 * the actionable amount as hero from the VIEWER's perspective (the payer sends
 * the rail amount, the receiver awaits it), a 3-step progress indicator driven
 * by the offer status, and — for the payer while `processing` — the TX-id
 * input that unlocks "He pagado".
 * The payment-window countdown lives in the header (P2PHeaderTimer, set by the
 * screen); the card only reacts to EXPIRY with a danger notice (the
 * p2p-validate cron relists the offer within its 10-minute sweep — the
 * screen's 5s poll picks that up).
 * Renders only on processing/paid/completed; open, cancelled and revision keep
 * their own surfaces.
 */
const P2PTradeProgress = ({ p2p, status, isPayer, isReceiver, canMarkPaid, txIdInput, setTxIdInput, theme, textStyles, containerStyles }: P2PTradeProgressProps) => {

	const { t } = useTranslation()

	// Only the expiry flip matters here — the live countdown renders in the header
	const { expired: windowExpired } = usePaymentWindow(
		status === "processing" ? p2p?.payment_window_expires_at || null : null
	)

	if (!p2p || !["processing", "paid", "completed"].includes(status)) return null
	if (!isPayer && !isReceiver) return null

	// processing → doing step 1 · paid → 1-2 done, waiting on release · completed → all done
	const doneCount = status === "completed" ? 3 : status === "paid" ? 2 : 0
	const activeIndex = status === "completed" ? -1 : status === "paid" ? 2 : 0
	const completed = status === "completed"
	const steps = getSteps(t)

	// Claves por perspectiva y tiempo verbal — frases completas, nada concatenado
	const heroVerb = isPayer
		? (completed ? t('p2p.tradeProgress.hero.sent') : t('p2p.tradeProgress.hero.send'))
		: (completed ? t('p2p.tradeProgress.hero.received') : t('p2p.tradeProgress.hero.receive'))
	// La tasa viaja aquí porque esta card SUSTITUYE a la informativa en el trade room.
	// El " · " une dos datos independientes (frase de saldo + tasa), no parte una frase.
	const amountNum = Number(p2p.amount)
	const rate = amountNum > 0 ? (Number(p2p.receive) / amountNum).toFixed(2) : null
	const balanceLine = (isPayer
		? (completed ? t('p2p.tradeProgress.balance.payerDone', { amount: p2p.amount }) : t('p2p.tradeProgress.balance.payer', { amount: p2p.amount }))
		: (completed ? t('p2p.tradeProgress.balance.receiverDone', { amount: p2p.amount }) : t('p2p.tradeProgress.balance.receiver', { amount: p2p.amount })))
		+ (rate ? ` · ${t('p2p.tradeProgress.rateSuffix', { rate })}` : "")

	return (
		<View style={[containerStyles.card, styles.card]}>

			{/* La ventana expiró: único aviso que la card conserva (el timer vive en el header) */}
			{windowExpired && (
				<View style={styles.bannerRow}>
					<FontAwesome6 name="hourglass-end" size={16} color={theme.colors.danger} iconStyle="solid" />
					<Text style={[textStyles.h6, { color: theme.colors.danger, flex: 1, fontWeight: "600" }]}>
						{t('p2p.tradeProgress.windowExpired')}
					</Text>
				</View>
			)}

			{/* Hero: the amount the viewer acts on, not the rate */}
			<Text style={[textStyles.h7, { color: theme.colors.secondaryText, textTransform: "uppercase", letterSpacing: 0.5 }]}>{heroVerb}</Text>
			<View style={styles.heroRow}>
				<Text style={[textStyles.h2, { color: theme.colors.primaryText, fontWeight: "600" }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.5}>
					{p2p.receive}
				</Text>
				<QPCoin coin={p2p.Coin?.logo} size={20} />
				<Text style={[textStyles.h5, { color: theme.colors.secondaryText, flexShrink: 1 }]} numberOfLines={1}>{p2p.Coin?.name}</Text>
			</View>
			<Text style={[textStyles.caption, { color: theme.colors.secondaryText }]}>{balanceLine}</Text>

			{/* 3-step progress */}
			<View style={styles.stepsRow}>
				{steps.map((label, i) => {
					const done = i < doneCount
					const active = i === activeIndex
					return (
						<View key={label} style={styles.stepItem}>
							{i > 0 && <View style={[styles.connector, { backgroundColor: i <= doneCount ? theme.colors.successText : theme.colors.border }]} />}
							<View style={[
								styles.stepDot,
								done && { backgroundColor: theme.colors.successFill },
								active && { backgroundColor: theme.colors.primary },
								!done && !active && { borderWidth: 1.5, borderColor: theme.colors.border },
							]}>
								{done ? (
									<FontAwesome6 name="check" size={10} color={theme.colors.successFillText} iconStyle="solid" />
								) : (
									<Text style={[textStyles.h7, { color: active ? theme.colors.almostWhite : theme.colors.secondaryText, fontSize: theme.typography.fontSize.xs }]}>{i + 1}</Text>
								)}
							</View>
							<Text style={[textStyles.h7, { fontSize: theme.typography.fontSize.xs, color: active ? theme.colors.primaryText : theme.colors.secondaryText, fontFamily: active ? theme.typography.fontFamily.medium : theme.typography.fontFamily.regular }]}>
								{label}
							</Text>
						</View>
					)
				})}
			</View>

			{/* Safety line for the receiver while deciding to release */}
			{status === "paid" && isReceiver && (
				<View style={styles.safetyRow}>
					<FontAwesome6 name="shield-halved" size={12} color={theme.colors.warning} iconStyle="solid" />
					<Text style={[textStyles.caption, { color: theme.colors.warning, flex: 1 }]}>
						{t('p2p.tradeProgress.safety')}
					</Text>
				</View>
			)}

			{/* TX id — part of the payment step, gates "He pagado" */}
			{canMarkPaid && (
				<View style={styles.txIdBlock}>
					<QPInput
						value={txIdInput}
						onChangeText={setTxIdInput}
						placeholder={t('p2p.tradeProgress.txIdPlaceholder')}
						prefixIconName="hashtag"
					/>
					<Text style={[textStyles.caption, { color: theme.colors.tertiaryText }]}>
						{t('p2p.tradeProgress.txIdHelper')}
					</Text>
				</View>
			)}

		</View>
	)
}

const styles = StyleSheet.create({
	card: {
		marginVertical: 4,
		paddingVertical: 12,
		paddingHorizontal: 12,
	},
	heroRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: 6,
		marginTop: 2,
	},
	stepsRow: {
		flexDirection: "row",
		alignItems: "flex-start",
		marginTop: 14,
	},
	stepItem: {
		flex: 1,
		alignItems: "center",
		gap: 4,
		position: "relative",
	},
	stepDot: {
		width: 22,
		height: 22,
		borderRadius: 11,
		alignItems: "center",
		justifyContent: "center",
	},
	connector: {
		position: "absolute",
		top: 10,
		right: "50%",
		left: "-50%",
		marginRight: 15,
		marginLeft: 15,
		height: 2,
		borderRadius: 1,
	},
	bannerRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: 8,
		marginBottom: 12,
	},
	safetyRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: 6,
		marginTop: 8,
	},
	txIdBlock: {
		marginTop: 8,
		gap: 2,
	},
})

export default P2PTradeProgress
