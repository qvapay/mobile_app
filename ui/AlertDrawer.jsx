import { useState } from 'react'
import { View, Text, Dimensions } from 'react-native'
import Animated, {
	useSharedValue,
	useAnimatedStyle,
	withSpring,
	interpolate,
	interpolateColor,
	Extrapolation,
} from 'react-native-reanimated'

// Theme
import { useTheme } from '../theme/ThemeContext'

// Press feedback
import QPPressable from './particles/QPPressable'

// Icons
import FontAwesome6 from '@react-native-vector-icons/fontawesome6'

// Collapsed state mirrors QPButton's pill metrics so the drawer is a drop-in
// replacement for a destructive button.
const COLLAPSED_HEIGHT = 56
const ACTION_HEIGHT = 52
const CARD_PADDING = 20
const ACTION_GAP = 12
// Duration-based spring, same feel as the original demo (dampingRatio 1 = no bounce overshoot)
const SPRING = { dampingRatio: 1, duration: 400 }

/**
 * Morphing confirmation alert, a faithful port of the Family-app pattern
 * (reactiive.io/demos/alert-drawer). The destructive pill button never
 * unmounts: on press it shrinks and slides into the bottom-right corner of a
 * card that expands behind it (background transparent → surface), becoming
 * the confirm button — pressing it again confirms. A neutral pill fades in at
 * the bottom-left and a ✕ at the top-right; the card content fades with
 * progress² like the original. Replaces `Alert.alert` confirmations where the
 * trigger is a full-width button (e.g. logout in Settings).
 *
 * The card content lives on an always-mounted absolute layer whose onLayout
 * drives the expanded height, so the container springs between pill and card
 * without a jump; content below it in the parent ScrollView is pushed down.
 *
 * @param {object} props
 * @param {string} props.buttonLabel - Label of the collapsed pill button.
 * @param {string} props.title - Heading of the expanded card.
 * @param {string} props.description - Confirmation copy of the expanded card.
 * @param {function} props.onConfirm - Fired when the (morphed) danger button is pressed while expanded.
 * @param {string} [props.confirmLabel=buttonLabel] - Danger button label while expanded;
 *        crossfades from `buttonLabel` when they differ.
 * @param {string} [props.cancelLabel='Cancelar'] - Neutral pill label.
 * @param {function} [props.onCancel] - Optional action for the neutral pill (fired after
 *        collapsing). Without it the pill is a plain cancel. The ✕ always just dismisses.
 * @param {string} [props.icon='exclamation'] - FontAwesome6 icon inside the danger circle.
 * @param {function} [props.onBeforeExpand] - Awaited before expanding; use it to
 *        resolve content that is only known at press time (e.g. biometrics state).
 */
const AlertDrawer = ({ buttonLabel, title, description, onConfirm, confirmLabel, cancelLabel = 'Cancelar', onCancel, icon = 'exclamation', onBeforeExpand, style }) => {

	const { theme } = useTheme()
	const [expanded, setExpanded] = useState(false)

	// 0 = pill button, 1 = expanded card
	const progress = useSharedValue(0)
	const contentHeight = useSharedValue(0)
	// Real widths arrive via onLayout before first paint; window width is just a sane first guess
	const containerWidth = useSharedValue(Dimensions.get('window').width)
	// Measured from the layout slot the morphing button lands on, so it always
	// matches the cancel pill exactly instead of re-deriving the flex math.
	const slotWidth = useSharedValue(0)

	const isLight = !theme.isDark
	const surfaceColor = theme.colors.surface
	const borderColor = theme.colors.border

	const morphedConfirmLabel = confirmLabel || buttonLabel
	const labelsDiffer = morphedConfirmLabel !== buttonLabel

	const containerAnimatedStyle = useAnimatedStyle(() => ({
		height: interpolate(progress.value, [0, 1], [COLLAPSED_HEIGHT, Math.max(contentHeight.value, COLLAPSED_HEIGHT)], Extrapolation.CLAMP),
		backgroundColor: interpolateColor(progress.value, [0, 1], ['transparent', surfaceColor]),
		...(isLight && { borderColor: interpolateColor(progress.value, [0, 1], ['transparent', borderColor]) }),
	}))

	// The trigger button morphs in place into the confirm pill: full-width pill
	// anchored bottom-right → the measured bottom-right slot of the actions row.
	const confirmAnimatedStyle = useAnimatedStyle(() => {
		const expandedWidth = slotWidth.value || (containerWidth.value - CARD_PADDING * 2 - ACTION_GAP) / 2
		return {
			right: interpolate(progress.value, [0, 1], [0, CARD_PADDING], Extrapolation.CLAMP),
			bottom: interpolate(progress.value, [0, 1], [0, CARD_PADDING], Extrapolation.CLAMP),
			width: interpolate(progress.value, [0, 1], [containerWidth.value, expandedWidth], Extrapolation.CLAMP),
			height: interpolate(progress.value, [0, 1], [COLLAPSED_HEIGHT, ACTION_HEIGHT], Extrapolation.CLAMP),
			borderRadius: interpolate(progress.value, [0, 1], [COLLAPSED_HEIGHT / 2, ACTION_HEIGHT / 2], Extrapolation.CLAMP),
		}
	})

	// Card content fades with progress² (the demo's delayedProgress) so it
	// appears only once the card has mostly grown behind the button.
	const cardAnimatedStyle = useAnimatedStyle(() => ({
		opacity: progress.value * progress.value,
	}))

	const collapsedLabelStyle = useAnimatedStyle(() => ({
		opacity: labelsDiffer ? interpolate(progress.value, [0, 0.5], [1, 0], Extrapolation.CLAMP) : 1,
	}))

	const confirmLabelStyle = useAnimatedStyle(() => ({
		opacity: interpolate(progress.value, [0.5, 1], [0, 1], Extrapolation.CLAMP),
	}))

	const collapse = () => {
		setExpanded(false)
		progress.value = withSpring(0, SPRING)
	}

	const handleConfirmPress = async () => {
		if (expanded) {
			collapse()
			onConfirm?.()
			return
		}
		await onBeforeExpand?.()
		setExpanded(true)
		progress.value = withSpring(1, SPRING)
	}

	const handleCancelPress = () => {
		collapse()
		onCancel?.()
	}

	const labelStyle = { fontSize: theme.typography.fontSize.md, fontFamily: theme.typography.fontFamily.semiBold, color: theme.colors.almostWhite }

	return (
		<Animated.View
			onLayout={(e) => { containerWidth.value = e.nativeEvent.layout.width }}
			style={[styles.container, isLight && { borderWidth: 1 }, containerAnimatedStyle, style]}>

			{/* Expanded card content — always mounted (absolute) so onLayout drives the target height */}
			<Animated.View
				pointerEvents={expanded ? 'auto' : 'none'}
				accessibilityElementsHidden={!expanded}
				importantForAccessibility={expanded ? 'auto' : 'no-hide-descendants'}
				onLayout={(e) => { contentHeight.value = e.nativeEvent.layout.height }}
				style={[styles.card, cardAnimatedStyle]}>

				<View style={styles.cardHeader}>
					<View style={[styles.iconCircle, { borderColor: theme.colors.danger }]}>
						<FontAwesome6 name={icon} size={18} color={theme.colors.danger} iconStyle="solid" />
					</View>
					<QPPressable variant="opacity" onPress={collapse} hitSlop={10} style={[styles.closeButton, { backgroundColor: theme.colors.background }]}>
						<FontAwesome6 name="xmark" size={14} color={theme.colors.secondaryText} iconStyle="solid" />
					</QPPressable>
				</View>

				<Text style={{ fontSize: theme.typography.fontSize.lg, fontFamily: theme.typography.fontFamily.semiBold, color: theme.colors.primaryText, marginTop: 16 }}>
					{title}
				</Text>
				<Text style={{ fontSize: theme.typography.fontSize.sm, fontFamily: theme.typography.fontFamily.regular, color: theme.colors.secondaryText, lineHeight: 21, marginTop: 8 }}>
					{description}
				</Text>

				{/* Left: neutral pill. Right: empty slot the morphing danger button lands on. */}
				<View style={styles.actionsRow}>
					<QPPressable onPress={handleCancelPress} style={[styles.cancelButton, { backgroundColor: theme.colors.background }]}>
						<Text numberOfLines={1} style={{ fontSize: theme.typography.fontSize.sm, fontFamily: theme.typography.fontFamily.semiBold, color: theme.colors.primaryText }}>
							{cancelLabel}
						</Text>
					</QPPressable>
					<View style={styles.confirmSlot} onLayout={(e) => { slotWidth.value = e.nativeEvent.layout.width }} />
				</View>

			</Animated.View>

			{/* The morphing trigger/confirm button — a single persistent element, like the demo */}
			<QPPressable onPress={handleConfirmPress} style={[styles.confirmButton, { backgroundColor: theme.colors.danger }, confirmAnimatedStyle]}>
				<Animated.Text numberOfLines={1} style={[labelStyle, collapsedLabelStyle]}>
					{buttonLabel}
				</Animated.Text>
				{labelsDiffer && (
					<Animated.View pointerEvents="none" style={[styles.confirmLabelOverlay, confirmLabelStyle]}>
						<Text numberOfLines={1} style={labelStyle}>{morphedConfirmLabel}</Text>
					</Animated.View>
				)}
			</QPPressable>

		</Animated.View>
	)
}

const styles = {
	container: {
		width: '100%',
		marginVertical: 5,
		borderRadius: COLLAPSED_HEIGHT / 2,
		borderCurve: 'continuous',
		overflow: 'hidden',
	},
	card: {
		position: 'absolute',
		top: 0,
		left: 0,
		right: 0,
		padding: CARD_PADDING,
	},
	cardHeader: {
		flexDirection: 'row',
		justifyContent: 'space-between',
		alignItems: 'flex-start',
	},
	iconCircle: {
		width: 44,
		height: 44,
		borderRadius: 22,
		borderWidth: 1.5,
		alignItems: 'center',
		justifyContent: 'center',
	},
	closeButton: {
		width: 30,
		height: 30,
		borderRadius: 15,
		alignItems: 'center',
		justifyContent: 'center',
	},
	actionsRow: {
		flexDirection: 'row',
		marginTop: CARD_PADDING,
	},
	cancelButton: {
		flex: 1,
		height: ACTION_HEIGHT,
		borderRadius: ACTION_HEIGHT / 2,
		alignItems: 'center',
		justifyContent: 'center',
		paddingHorizontal: 12,
	},
	confirmSlot: {
		flex: 1,
		height: ACTION_HEIGHT,
		marginLeft: ACTION_GAP,
	},
	confirmButton: {
		position: 'absolute',
		alignItems: 'center',
		justifyContent: 'center',
		paddingHorizontal: 12,
		borderCurve: 'continuous',
	},
	confirmLabelOverlay: {
		position: 'absolute',
		top: 0,
		bottom: 0,
		left: 0,
		right: 0,
		alignItems: 'center',
		justifyContent: 'center',
	},
}

export default AlertDrawer
