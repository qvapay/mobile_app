import { useRef, useState, useEffect } from 'react'
import { View, Text, Pressable, Animated, StyleSheet } from 'react-native'

// Theme
import { useTheme } from '../../theme/ThemeContext'
import { createTextStyles } from '../../theme/themeUtils'

// Reusable animated segmented switch (left/right)
// Supports controlled (value/position) and uncontrolled (defaultValue) usage
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
	leftColor,
	rightColor,
	// Callbacks
	onChange,
	onLeftPress,
	onRightPress,
	// Misc
	disabled = false,
	style
}) => {

	const { theme } = useTheme()
	const textStyles = createTextStyles(theme)

	const controlledValue = value !== undefined ? value : (position !== undefined ? position : undefined)
	const hasValue = controlledValue !== undefined && controlledValue !== null
	const initialValue = hasValue ? controlledValue : defaultValue
	const getInitialTranslateValue = () => {
		if (initialValue === 'left') return 0
		if (initialValue === 'right') return 1
		return 0.5 // Neutral position
	}
	const translate = useRef(new Animated.Value(getInitialTranslateValue())).current
	const [containerWidth, setContainerWidth] = useState(0)
	const [internalValue, setInternalValue] = useState(hasValue ? controlledValue : defaultValue)

	// Keep internal value in sync when controlled
	useEffect(() => {
		if (controlledValue !== undefined) {
			setInternalValue(controlledValue)
		}
	}, [controlledValue])

	useEffect(() => {
		let targetValue = 0.5 // Default to neutral
		if (internalValue === 'left') targetValue = 0
		else if (internalValue === 'right') targetValue = 1

		Animated.spring(translate, {
			toValue: targetValue,
			useNativeDriver: true,
			friction: 12,
			tension: 120
		}).start()
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [internalValue])

	const halfWidth = Math.max(0, containerWidth / 2)
	const pillWidth = Math.max(0, halfWidth - 4) // 2px inset on each side within half
	const leftStart = 2 // Starting position with 2px margin
	const rightStart = halfWidth - 1 // Starting position for right side with 2px margin
	const centerStart = halfWidth / 2 - pillWidth / 2 // Center position when no selection
	const pillTranslateX = translate.interpolate({
		inputRange: [0, 0.5, 1],
		outputRange: [leftStart, centerStart, rightStart]
	})

	const handlePress = (next) => {
		
		if (disabled) return
		const isControlled = controlledValue !== undefined

		// If clicking on the already selected option, deselect it (toggle off)
		const currentValue = isControlled ? controlledValue : internalValue
		const newValue = currentValue === next ? null : next

		if (!isControlled) { setInternalValue(newValue) }
		onChange && onChange(newValue)
		if (newValue === 'left') { onLeftPress && onLeftPress() }
		else if (newValue === 'right') { onRightPress && onRightPress() }
	}

	return (
		<View onLayout={(e) => setContainerWidth(e.nativeEvent.layout.width)} style={[styles.segmentedContainer, { backgroundColor: theme.colors.elevation, borderColor: theme.colors.border, opacity: disabled ? 0.6 : 1 }, style]}>
			<Animated.View
				pointerEvents='none'
				style={[styles.segmentedPill, {
					left: 0,
					width: pillWidth,
					backgroundColor: internalValue === 'left' ? leftColor : internalValue === 'right' ? rightColor : 'transparent',
					transform: [{ translateX: pillTranslateX }],
					opacity: internalValue !== null && internalValue !== undefined ? 1 : 0
				}]}
			/>
			<Pressable style={styles.segmentedOption} onPress={() => handlePress('left')} disabled={disabled}>
				<Text style={[textStyles.h6, { color: internalValue === 'left' ? theme.colors.almostBlack : theme.colors.primaryText }]}>{leftText}</Text>
			</Pressable>
			<Pressable style={styles.segmentedOption} onPress={() => handlePress('right')} disabled={disabled}>
				<Text style={[textStyles.h6, { color: internalValue === 'right' ? theme.colors.almostWhite : theme.colors.primaryText }]}>{rightText}</Text>
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
	segmentedPill: {
		position: 'absolute',
		left: 0,
		top: 2,
		bottom: 2,
		borderRadius: 20,
	},
	segmentedOption: {
		flex: 1,
		height: '100%',
		alignItems: 'center',
		justifyContent: 'center'
	}
})

export default QPSwitch