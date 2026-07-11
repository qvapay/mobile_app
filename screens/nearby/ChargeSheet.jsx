import { useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import Animated, { SlideInDown, SlideOutDown, FadeIn, FadeOut, Easing } from 'react-native-reanimated'

// Theme Context
import { useTheme } from '../../theme/ThemeContext'
import { useTextStyles } from '../../theme/themeUtils'

// UI
import AmountInput from '../../ui/AmountInput'
import QPButton from '../../ui/particles/QPButton'

/**
 * Charge-mode sheet for NearbyPay. Rendered as an internal animated overlay —
 * NOT a navigation route — so the radar screen never blurs and the transport
 * keeps announcing while the user types the amount.
 *
 * @param {object} props
 * @param {string} [props.initialAmount] - Prefill (e.g. amount typed in Keypad).
 * @param {number|string} props.balance - Shown by AmountInput.
 * @param {(amount: string) => void} props.onConfirm
 * @param {() => void} props.onClose
 */
const ChargeSheet = ({ initialAmount = '', balance, onConfirm, onClose }) => {

	const { theme } = useTheme()
	const textStyles = useTextStyles(theme)
	const [amount, setAmount] = useState(initialAmount)

	const numericAmount = parseFloat(amount) || 0
	const canConfirm = numericAmount > 0

	return (
		<View style={StyleSheet.absoluteFill}>
			<Animated.View entering={FadeIn.duration(150)} exiting={FadeOut.duration(150)} style={styles.backdrop}>
				<Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
			</Animated.View>

			<Animated.View
				entering={SlideInDown.duration(280).easing(Easing.out(Easing.cubic))}
				exiting={SlideOutDown.duration(180).easing(Easing.in(Easing.cubic))}
				style={[styles.sheet, { backgroundColor: theme.colors.background }]}
			>
				<View style={[styles.handle, { backgroundColor: theme.colors.tertiaryText }]} />

				<Text style={[textStyles.h4, { color: theme.colors.primaryText, textAlign: 'center', marginBottom: 4 }]}>
					Cobrar cerca
				</Text>
				<Text style={[textStyles.body, { color: theme.colors.secondaryText, textAlign: 'center', marginBottom: 16 }]}>
					Los usuarios cercanos verán este monto al tocar tu avatar
				</Text>

				<AmountInput amount={amount} onAmountChange={setAmount} balance={balance} placeholder="Monto a cobrar" />

				<QPButton
					title={canConfirm ? `Cobrar $${amount}` : 'Cobrar'}
					onPress={() => canConfirm && onConfirm(amount)}
					disabled={!canConfirm}
					icon="bolt"
					iconStyle="solid"
					style={styles.confirmButton}
				/>
			</Animated.View>
		</View>
	)
}

const styles = StyleSheet.create({
	backdrop: {
		...StyleSheet.absoluteFillObject,
		backgroundColor: 'rgba(0, 0, 0, 0.4)',
	},
	sheet: {
		position: 'absolute',
		left: 0,
		right: 0,
		bottom: 0,
		borderTopLeftRadius: 24,
		borderTopRightRadius: 24,
		paddingHorizontal: 20,
		paddingBottom: 34,
		paddingTop: 8,
	},
	handle: {
		alignSelf: 'center',
		width: 36,
		height: 4,
		borderRadius: 2,
		opacity: 0.4,
		marginBottom: 12,
	},
	confirmButton: {
		marginTop: 16,
	},
})

export default ChargeSheet
