import { View, Text, StyleSheet } from "react-native"
import FontAwesome6 from "@react-native-vector-icons/fontawesome6"

import QPCoin from "../../ui/particles/QPCoin"
import QPInput from "../../ui/particles/QPInput"

import usePaymentWindow from "./usePaymentWindow"

// Trade lifecycle steps: the payer pays → marks it → the receiver releases
const STEPS = ["Pago", "Confirmación", "Liberación"]

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
const P2PTradeProgress = ({ p2p, status, isPayer, isReceiver, canMarkPaid, txIdInput, setTxIdInput, theme, textStyles, containerStyles }) => {

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

	const heroVerb = isPayer ? (completed ? "Enviaste" : "Envías") : (completed ? "Recibiste" : "Recibirás")
	// La tasa viaja aquí porque esta card SUSTITUYE a la informativa en el trade room
	const amountNum = Number(p2p.amount)
	const rate = amountNum > 0 ? (Number(p2p.receive) / amountNum).toFixed(2) : null
	const balanceLine = (isPayer
		? (completed ? `recibiste $${p2p.amount} de saldo` : `recibirás $${p2p.amount} de saldo`)
		: (completed ? `liberaste $${p2p.amount} de tu saldo` : `liberarás $${p2p.amount} de tu saldo`))
		+ (rate ? ` · tasa ${rate}` : "")

	return (
		<View style={[containerStyles.card, styles.card]}>

			{/* La ventana expiró: único aviso que la card conserva (el timer vive en el header) */}
			{windowExpired && (
				<View style={styles.bannerRow}>
					<FontAwesome6 name="hourglass-end" size={16} color={theme.colors.danger} iconStyle="solid" />
					<Text style={[textStyles.h6, { color: theme.colors.danger, flex: 1, fontWeight: "600" }]}>
						Ventana de pago expirada; la oferta volverá a publicarse
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
				{STEPS.map((label, i) => {
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
						Libera solo si el pago ya está en tu cuenta, no por capturas ni promesas.
					</Text>
				</View>
			)}

			{/* TX id — part of the payment step, gates "He pagado" */}
			{canMarkPaid && (
				<View style={styles.txIdBlock}>
					<QPInput
						value={txIdInput}
						onChangeText={setTxIdInput}
						placeholder="ID de la transferencia"
						prefixIconName="hashtag"
					/>
					<Text style={[textStyles.caption, { color: theme.colors.tertiaryText }]}>
						El ID del pago habilita «He pagado» y ayuda a verificarlo más rápido.
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
