import { useState, useEffect } from 'react'
import type { ComponentType } from 'react'
import { View, Text, Pressable, Animated, Easing, StyleSheet } from 'react-native'
import type { StyleProp, TextStyle, ViewStyle } from 'react-native'
import FontAwesome6Icon from '@react-native-vector-icons/fontawesome6'

// Mismo recorte de tipos que QPButton: los de FontAwesome6 exigen uniones literales por iconStyle
const FontAwesome6 = FontAwesome6Icon as ComponentType<{ name?: string, size?: number, color?: string, iconStyle?: 'solid' | 'regular' | 'brand' }>

// Theme
import { useTheme } from '../../theme/ThemeContext'
import { createTextStyles } from '../../theme/themeUtils'
import { useAnimatedValue } from '../../hooks/useAnimatedValue'

/** Inset de la píldora en modo `bare` (cápsula de cristal de 44 pt → segmento de 34). */
const BARE_PILL_INSET = 5

// Pill animation target per side; everything else sits at the neutral midpoint.
const POSITION_OFFSET = { left: 0, right: 1 }
const NEUTRAL_OFFSET = 0.5

/**
 * Animated two-option segmented switch with a sliding pill; the house standard
 * for left/right toggles (e.g. PIN vs OTP). Supports controlled (`value`, or the
 * legacy `position` alias) and uncontrolled (`defaultValue`) usage — when
 * controlled there is no internal copy to drift out of sync. Tapping the
 * selected side deselects it (`onChange(null)`): the pill fades out and parks at
 * the neutral midpoint. The pill slides with a native-driver spring.
 *
 * @param props
 * @param props.value - Controlled value (preferred over `position`).
 * @param props.defaultValue - Uncontrolled initial value.
 * @param props.leftText - Left label (colors via leftColor/leftTextColor).
 * @param props.rightText - Right label (colors via rightColor/rightTextColor).
 * @param props.onChange - Receives 'left' | 'right' | null on every change.
 */
type SwitchSide = 'left' | 'right'
type SwitchValue = SwitchSide | null

type Props = {
	value?: SwitchValue
	position?: SwitchValue
	defaultValue?: SwitchSide
	leftText: string
	rightText: string
	/** Icono FontAwesome6 (solid) delante de cada etiqueta, del mismo color que el texto. Sustituye a los emojis en el copy. */
	leftIcon?: string
	rightIcon?: string
	leftColor?: string
	rightColor?: string
	leftTextColor?: string
	rightTextColor?: string
	onChange?: (value: SwitchValue) => void
	onLeftPress?: () => void
	onRightPress?: () => void
	disabled?: boolean
	/** Sin fondo ni borde: para vivir dentro de un cristal del header nativo de iOS 26, que ya pone la cápsula. */
	bare?: boolean
	style?: StyleProp<ViewStyle>
}

const QPSwitch = ({
	// Controlled value (preferred). If omitted, falls back to `position`, then internal state
	value,
	// Backward-compatible prop name for value
	position,
	// Uncontrolled initial value
	defaultValue = 'left',
	// Labels and colors for each side
	leftText,
	rightText,
	leftIcon,
	rightIcon,
	leftColor,
	rightColor,
	leftTextColor,
	rightTextColor,
	// Callbacks
	onChange,
	onLeftPress,
	onRightPress,
	// Misc
	disabled = false,
	bare = false,
	style
}: Props) => {

	const { theme } = useTheme()
	// themeUtils.js declara `@returns {Object}`: sin claves hasta que se migre a TS
	const textStyles = createTextStyles(theme) as Record<string, TextStyle>

	const controlledValue = value !== undefined ? value : (position !== undefined ? position : undefined)
	const hasValue = controlledValue !== undefined && controlledValue !== null
	const initialValue = hasValue ? controlledValue : defaultValue
	const translate = useAnimatedValue(POSITION_OFFSET[initialValue] ?? NEUTRAL_OFFSET)
	const [containerWidth, setContainerWidth] = useState(0)
	// Uncontrolled state only; when controlled, the value is derived from props so
	// there is no second copy to keep in sync.
	const [uncontrolledValue, setUncontrolledValue] = useState<SwitchValue>(initialValue)
	const currentValue = hasValue ? controlledValue : uncontrolledValue

	// Animate the pill whenever the selected value changes (from a press here or
	// from a controlled prop update by the parent).
	// Curva estándar (acelera y frena suave) en vez de un spring seco: la
	// píldora se siente fluida al deslizarse, sin rebote — mismo easing que el
	// segmented control de reactiive.io/demos/fluid-tab-interaction, a una
	// duración usable (el demo va a 1s para lucirse).
	useEffect(() => {
		Animated.timing(translate, {
			toValue: POSITION_OFFSET[currentValue as SwitchSide] ?? NEUTRAL_OFFSET,
			useNativeDriver: true,
			duration: 320,
			easing: Easing.bezier(0.4, 0.0, 0.2, 1),
		}).start()
	}, [currentValue, translate])

	const halfWidth = Math.max(0, containerWidth / 2)
	// Dentro de un cristal del header (bare) la píldora va más metida: pegada al
	// borde de la cápsula se veía como una mancha abombada, no como un segmento
	const inset = bare ? BARE_PILL_INSET : 2
	const pillWidth = Math.max(0, halfWidth - 2 * inset)
	const leftStart = inset
	const rightStart = bare ? halfWidth + inset : halfWidth - 1
	const centerStart = halfWidth / 2 - pillWidth / 2 // Center position when no selection
	const pillTranslateX = translate.interpolate({
		inputRange: [0, 0.5, 1],
		outputRange: [leftStart, centerStart, rightStart]
	})

	const handlePress = (next: SwitchSide) => {

		if (disabled) return

		// If clicking on the already selected option, deselect it (toggle off)
		const newValue = currentValue === next ? null : next

		if (!hasValue) { setUncontrolledValue(newValue) }
		onChange && onChange(newValue)
		if (newValue === 'left') { onLeftPress && onLeftPress() }
		else if (newValue === 'right') { onRightPress && onRightPress() }
	}

	return (
		<View onLayout={(e) => setContainerWidth(e.nativeEvent.layout.width)} style={[styles.segmentedContainer, { backgroundColor: theme.colors.elevation, borderColor: theme.colors.border, opacity: disabled ? 0.6 : 1 }, bare && styles.bare, style]}>
			<Animated.View
				pointerEvents='none'
				style={[styles.segmentedPill, bare && styles.barePill, {
					left: 0,
					width: pillWidth,
					backgroundColor: currentValue === 'left' ? leftColor : currentValue === 'right' ? rightColor : 'transparent',
					transform: [{ translateX: pillTranslateX }],
					opacity: currentValue !== null && currentValue !== undefined ? 1 : 0
				}]}
			/>
			<Pressable style={styles.segmentedOption} onPress={() => handlePress('left')} disabled={disabled}>
				{!!leftIcon && <FontAwesome6 name={leftIcon} size={13} color={currentValue === 'left' ? (leftTextColor || theme.colors.almostWhite) : theme.colors.primaryText} iconStyle="solid" />}
				<Text style={[textStyles.h6, { color: currentValue === 'left' ? (leftTextColor || theme.colors.almostWhite) : theme.colors.primaryText }]}>{leftText}</Text>
			</Pressable>
			<Pressable style={styles.segmentedOption} onPress={() => handlePress('right')} disabled={disabled}>
				{!!rightIcon && <FontAwesome6 name={rightIcon} size={13} color={currentValue === 'right' ? (rightTextColor || theme.colors.almostWhite) : theme.colors.primaryText} iconStyle="solid" />}
				<Text style={[textStyles.h6, { color: currentValue === 'right' ? (rightTextColor || theme.colors.almostWhite) : theme.colors.primaryText }]}>{rightText}</Text>
			</Pressable>
		</View>
	)
}

const styles = StyleSheet.create({
	segmentedContainer: {
		position: 'relative',
		height: 44,
		borderRadius: 22,
		borderWidth: 1,
		overflow: 'hidden',
		flexDirection: 'row',
		alignItems: 'center'
	},
	bare: {
		backgroundColor: 'transparent',
		borderWidth: 0,
	},
	barePill: {
		top: BARE_PILL_INSET,
		bottom: BARE_PILL_INSET,
		borderRadius: (44 - 2 * BARE_PILL_INSET) / 2,
	},
	segmentedPill: {
		position: 'absolute',
		left: 0,
		top: 2,
		bottom: 2,
		borderRadius: 20,
	},
	segmentedOption: {
		flexDirection: 'row',
		gap: 6,
		flex: 1,
		height: '100%',
		alignItems: 'center',
		justifyContent: 'center'
	}
})

export default QPSwitch