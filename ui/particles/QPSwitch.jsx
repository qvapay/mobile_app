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
	style,
	testID
}) => {

	const { theme } = useTheme()
	const textStyles = createTextStyles(theme)

	const controlledValue = value !== undefined ? value : (position !== undefined ? position : undefined)
	const initialIsLeft = (controlledValue ?? defaultValue) === 'left'
	const translate = useRef(new Animated.Value(initialIsLeft ? 0 : 1)).current
	const [containerWidth, setContainerWidth] = useState(0)
	const [internalValue, setInternalValue] = useState(controlledValue ?? defaultValue)

	// Keep internal value in sync when controlled
	useEffect(() => {
		if (controlledValue !== undefined) {
			setInternalValue(controlledValue)
		}
	}, [controlledValue])

	useEffect(() => {
		Animated.spring(translate, {
			toValue: internalValue === 'left' ? 0 : 1,
			useNativeDriver: true,
			friction: 12,
			tension: 120
		}).start()
	}, [internalValue])

	const halfWidth = Math.max(0, containerWidth / 2)
	const pillWidth = Math.max(0, halfWidth - 4) // 2px inset on each side within half
	const leftStart = 2 // Starting position with 2px margin
	const rightStart = halfWidth - 1 // Starting position for right side with 2px margin
	const pillTranslateX = translate.interpolate({ inputRange: [0, 1], outputRange: [leftStart, rightStart] })

	const handlePress = (next) => {
		if (disabled) return
		const isControlled = controlledValue !== undefined
		if (!isControlled) {
			setInternalValue(next)
		}
		onChange && onChange(next)
		if (next === 'left') {
			onLeftPress && onLeftPress()
		} else {
			onRightPress && onRightPress()
		}
	}

	return (
		<View
			testID={testID}
			onLayout={(e) => setContainerWidth(e.nativeEvent.layout.width)}
			style={[
				styles.segmentedContainer,
				{ backgroundColor: theme.colors.elevation, borderColor: theme.colors.border, opacity: disabled ? 0.6 : 1 },
				style
			]}
		>
			<Animated.View
				pointerEvents='none'
				style={[styles.segmentedPill, {
					left: 0,
					width: pillWidth,
					backgroundColor: internalValue === 'left' ? leftColor : rightColor,
					transform: [{ translateX: pillTranslateX }]
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