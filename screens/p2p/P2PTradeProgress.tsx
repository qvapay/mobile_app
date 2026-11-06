import { View, Text, StyleSheet } from "react-native"
import { SurfaceHost } from "../../ui/SurfaceContext"
import FontAwesome6 from "@react-native-vector-icons/fontawesome6"
import { useTranslation } from "react-i18next"

import QPCoin from "../../ui/particles/QPCoin"
import QPInput from "../../ui/particles/QPInput"

import { offerRate } from "./p2pFlexible"
import { formatRate, formatUsd } from "./p2pOfferCard"
import { buildTradeTimeline, isTradeRoomStatus } from "./p2pTradeRoom"
import usePaymentWindow from "./usePaymentWindow"

import type { ReactNode } from "react"
import type { Theme } from "../../theme/ThemeContext"
import type { TextStyles, ContainerStyles } from "../../theme/themeUtils"
import type { P2POffer, P2PStatus, P2PUser } from "../../types/domain"
import type { TradeStepState } from "./p2pTradeRoom"

type P2PTradeProgressProps = {
	p2p: P2POffer | null
	status: P2PStatus
	isPayer: boolean
	isReceiver: boolean
	counterparty?: P2PUser | null
	canMarkPaid: boolean
	txIdInput: string
	/** El comprobante propio basta para «He pagado»: lo decide el servidor. */
	proofReplaces?: boolean
	setTxIdInput: (value: string) => void
	theme: Theme
	textStyles: TextStyles
	containerStyles: ContainerStyles
}

type SummaryRowProps = {
	label: string
	children: ReactNode
	theme: Theme
	textStyles: TextStyles
}

const SummaryRow = ({ label, children, theme, textStyles }: SummaryRowProps) => (
	<View style={styles.summaryRow}>
		<Text style={[textStyles.h6, { color: theme.colors.secondaryText }]}>{label}</Text>
		<View style={styles.summaryValue}>{children}</View>
	</View>
)

type StepDotProps = {
	state: TradeStepState
	position: number
	theme: Theme
	textStyles: TextStyles
}

const StepDot = ({ state, position, theme, textStyles }: StepDotProps) => (
	<View style={[
		styles.stepDot,
		state === "done" && { backgroundColor: theme.colors.successFill },
		state === "active" && { backgroundColor: theme.colors.primary },
		state === "pending" && { borderWidth: 1.5, borderColor: theme.colors.border },
	]}>
		{state === "done" ? (
			<FontAwesome6 name="check" size={10} color={theme.colors.successFillText} iconStyle="solid" />
		) : (
			<Text style={[textStyles.h7, { color: state === "active" ? theme.colors.almostWhite : theme.colors.secondaryText }]}>{position}</Text>
		)}
	</View>
)

/**
 * Trade-room status card: what moves in this deal from the VIEWER's perspective
 * (the payer sends the rail amount and gets balance, the receiver awaits it and
 * releases balance), then a vertical timeline with the indication of each step,
 * driven by the offer status. The active step hosts what it needs: the TX-id
 * input that unlocks "He pagado" and the receiver's safety line.
 * The amount, the side and the payment-window countdown live in the header
 * (P2PHeaderTitle, set by the screen); the card only reacts to EXPIRY with a
 * danger notice (the p2p-validate cron relists the offer within its 10-minute
 * sweep — the screen's 5s poll picks that up).
 * Renders only on processing/paid/completed; open, cancelled and revision keep
 * their own surfaces.
 */
const P2PTradeProgress = ({ p2p, status, isPayer, isReceiver, counterparty, canMarkPaid, txIdInput, setTxIdInput, proofReplaces = false, theme, textStyles, containerStyles }: P2PTradeProgressProps) => {

	const { t } = useTranslation()

	// Only the expiry flip matters here — the live countdown renders in the header
	const { expired: windowExpired } = usePaymentWindow(
		status === "processing" ? p2p?.payment_window_expires_at || null : null
	)

	if (!p2p || !isTradeRoomStatus(status)) return null
	if (!isPayer && !isReceiver) return null

	const completed = status === "completed"
	const coinName = p2p.Coin?.name ?? p2p.coin
	const balance = formatUsd(p2p.amount)
	const rate = offerRate(p2p)
	const steps = buildTradeTimeline(t, {
		status,
		isPayer,
		amount: String(p2p.receive),
		coin: coinName,
		balance,
		counterparty: counterparty?.username ? `@${counterparty.username}` : t('p2p.offer.counterpartyFallback'),
	})

	// Claves por perspectiva y tiempo verbal — frases completas, nada concatenado
	const railLabel = isPayer
		? (completed ? t('p2p.tradeProgress.summary.sent') : t('p2p.tradeProgress.summary.send'))
		: (completed ? t('p2p.tradeProgress.summary.received') : t('p2p.tradeProgress.summary.receive'))
	const balanceLabel = isPayer
		? (completed ? t('p2p.tradeProgress.summary.received') : t('p2p.tradeProgress.summary.receive'))
		: (completed ? t('p2p.tradeProgress.summary.released') : t('p2p.tradeProgress.summary.release'))

	const valueStyle = [textStyles.h5, { color: theme.colors.primaryText, fontFamily: theme.typography.fontFamily.medium }]

	return (
		<View style={[containerStyles.card, styles.card]}>
			<SurfaceHost tone="surface">

				{/* La ventana expiró: único aviso que la card conserva (el timer vive en el header) */}
				{windowExpired && (
					<View style={styles.bannerRow}>
						<FontAwesome6 name="hourglass-end" size={16} color={theme.colors.danger} iconStyle="solid" />
						<Text style={[textStyles.h6, { color: theme.colors.danger, flex: 1, fontWeight: "600" }]}>
							{t('p2p.tradeProgress.windowExpired')}
						</Text>
					</View>
				)}

				{/* Lo que se mueve en el trato. La tasa viaja aquí porque esta card SUSTITUYE a la informativa */}
				<SummaryRow label={railLabel} theme={theme} textStyles={textStyles}>
					<Text style={[valueStyle, styles.summaryAmount]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.5}>{p2p.receive}</Text>
					<QPCoin coin={p2p.Coin?.logo} size={18} />
					<Text style={[textStyles.h6, styles.summaryCoin, { color: theme.colors.secondaryText }]} numberOfLines={1}>{coinName}</Text>
				</SummaryRow>
				<SummaryRow label={balanceLabel} theme={theme} textStyles={textStyles}>
					<Text style={valueStyle} numberOfLines={1}>${balance}</Text>
				</SummaryRow>
				{rate != null && (
					<SummaryRow label={t('p2p.tradeProgress.summary.rate')} theme={theme} textStyles={textStyles}>
						<Text style={valueStyle} numberOfLines={1}>{formatRate(rate)}</Text>
					</SummaryRow>
				)}

				<View style={[styles.divider, { backgroundColor: theme.colors.border }]} />

				{/* Línea de tiempo: el raíl se estira con el paso, incluido el input del activo */}
				{steps.map((step, i) => {
					const last = i === steps.length - 1
					return (
						<View key={step.key} style={styles.step}>
							<View style={styles.rail}>
								<StepDot state={step.state} position={i + 1} theme={theme} textStyles={textStyles} />
								{!last && <View style={[styles.railLine, { backgroundColor: step.state === "done" ? theme.colors.successText : theme.colors.border }]} />}
							</View>
							<View style={[styles.stepBody, !last && styles.stepBodySpaced]}>
								<Text style={[textStyles.h6, { color: step.state === "pending" ? theme.colors.secondaryText : theme.colors.primaryText, fontFamily: theme.typography.fontFamily.medium }]}>
									{step.title}
								</Text>
								<Text style={[textStyles.caption, { color: step.state === "active" ? theme.colors.secondaryText : theme.colors.tertiaryText }]}>
									{step.body}
								</Text>

								{/* TX id — part of the payment step, gates "He pagado" */}
								{step.key === "payment" && canMarkPaid && (
									<View style={styles.txIdBlock}>
										<QPInput
											value={txIdInput}
											onChangeText={setTxIdInput}
											placeholder={t('p2p.tradeProgress.txIdPlaceholder')}
											prefixIconName="hashtag"
										/>
										<Text style={[textStyles.caption, { color: theme.colors.tertiaryText }]}>
											{t(proofReplaces ? 'p2p.tradeProgress.txIdHelperOrProof' : 'p2p.tradeProgress.txIdHelper')}
										</Text>
									</View>
								)}

								{/* Safety line for the receiver while deciding to release */}
								{step.key === "release" && status === "paid" && isReceiver && (
									<View style={styles.safetyRow}>
										<FontAwesome6 name="shield-halved" size={12} color={theme.colors.warning} iconStyle="solid" />
										<Text style={[textStyles.caption, { color: theme.colors.warning, flex: 1 }]}>
											{t('p2p.tradeProgress.safety')}
										</Text>
									</View>
								)}
							</View>
						</View>
					)
				})}

			</SurfaceHost>
		</View>
	)
}

const styles = StyleSheet.create({
	card: {
		marginVertical: 4,
		paddingVertical: 12,
		paddingHorizontal: 12,
	},
	summaryRow: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		gap: 12,
		minHeight: 26,
	},
	summaryValue: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "flex-end",
		gap: 6,
		flexShrink: 1,
	},
	summaryAmount: {
		flexShrink: 1,
	},
	summaryCoin: {
		flexShrink: 0,
		maxWidth: 120,
	},
	divider: {
		height: StyleSheet.hairlineWidth,
		marginVertical: 12,
	},
	step: {
		flexDirection: "row",
		gap: 12,
	},
	rail: {
		width: 24,
		alignItems: "center",
	},
	railLine: {
		flex: 1,
		width: 2,
		borderRadius: 1,
		marginVertical: 4,
	},
	stepDot: {
		width: 24,
		height: 24,
		borderRadius: 12,
		alignItems: "center",
		justifyContent: "center",
	},
	stepBody: {
		flex: 1,
		gap: 2,
		paddingTop: 2,
	},
	stepBodySpaced: {
		paddingBottom: 18,
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
		marginTop: 6,
	},
	txIdBlock: {
		marginTop: 8,
		gap: 2,
	},
})

export default P2PTradeProgress
