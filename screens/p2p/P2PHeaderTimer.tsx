import { View, Text, StyleSheet } from "react-native"
import FontAwesome6 from "@react-native-vector-icons/fontawesome6"

import { useTheme } from "../../theme/ThemeContext"
import { createTextStyles } from "../../theme/themeUtils"

import usePaymentWindow from "./usePaymentWindow"

/**
 * Payment-window countdown rendered as the P2POffer header title (the route's
 * own title is empty, so the center is free). Self-ticking: the screen sets it
 * ONCE per window via navigation.setOptions instead of re-setting every second.
 * Urgency by color: green while comfortable, warning under 15 minutes, danger
 * under 5 and at zero.
 */
type P2PHeaderTimerProps = {
	/** ISO del fin de la ventana de pago; null/undefined = no se pinta nada. */
	expiresAt?: string | null
}

const P2PHeaderTimer = ({ expiresAt }: P2PHeaderTimerProps) => {

	const { theme } = useTheme()
	const textStyles = createTextStyles(theme)
	const { label, expired, tone } = usePaymentWindow(expiresAt)

	if (!label) return null

	const color = expired || tone === "low"
		? theme.colors.danger
		: tone === "warn" ? theme.colors.warning : theme.colors.successText

	return (
		<View style={styles.row}>
			<FontAwesome6 name="stopwatch" size={14} color={color} iconStyle="solid" />
			<Text style={[textStyles.h4, { color, fontVariant: ["tabular-nums"], fontFamily: theme.typography.fontFamily.medium }]}>
				{label}
			</Text>
		</View>
	)
}

const styles = StyleSheet.create({
	row: {
		flexDirection: "row",
		alignItems: "center",
		gap: 6,
	},
})

export default P2PHeaderTimer
