import { useEffect, useImperativeHandle, useRef } from 'react'
import { Platform, Pressable, StyleSheet, TextInput } from 'react-native'
import Animated, {
	useAnimatedStyle,
	useSharedValue,
	withSequence,
	withSpring,
	withTiming,
} from 'react-native-reanimated'
import type { Ref } from 'react'

// Theme
import { useTheme } from '../theme/ThemeContext'

export type PinDotsHandle = { focus: () => void, shake: () => void }

const DOT = 14
const GAP = 22

/**
 * Los dígitos del bloqueo como PUNTOS, no como cajitas.
 *
 * `QPCodeInput` sigue siendo la implementación única de la rejilla de cajitas y no se toca:
 * la comparten el envío, el retiro, el 2FA del login y el PIN de cuenta, donde la cajita
 * ayuda a corregir un dígito concreto. Aquí no hay nada que corregir —son cuatro dígitos y
 * se verifican solos al caer el cuarto—, así que el punto dice lo mismo con mucho menos.
 *
 * La entrada real es un TextInput invisible: toda la superficie lo enfoca, y el teclado
 * numérico es el del sistema.
 */
const PinDots = ({ ref, length = 4, code, onChangeCode, onFilled, disabled = false }: {
	ref?: Ref<PinDotsHandle>
	length?: number
	code: string
	onChangeCode: (code: string) => void
	onFilled?: (code: string) => void
	disabled?: boolean
}) => {

	const { theme } = useTheme()
	const inputRef = useRef<TextInput>(null)
	const shake = useSharedValue(0)

	useImperativeHandle(ref, () => ({
		focus: () => inputRef.current?.focus(),
		shake: () => {
			// Cinco tirones cortos: lo justo para leerse como un "no" sin marear
			shake.value = withSequence(
				...[10, -10, 8, -8, 0].map(to => withTiming(to, { duration: 55 })),
			)
		},
	}), [shake])

	useEffect(() => { if (!disabled) { inputRef.current?.focus() } }, [disabled])

	const rowStyle = useAnimatedStyle(() => ({ transform: [{ translateX: shake.value }] }))

	const handleChange = (raw: string) => {
		const digits = raw.replace(/[^0-9]/g, '').slice(0, length)
		onChangeCode(digits)
		if (digits.length === length) { onFilled?.(digits) }
	}

	return (
		<Pressable onPress={() => inputRef.current?.focus()} disabled={disabled} accessibilityRole="none">
			<Animated.View style={[styles.row, rowStyle]}>
				{Array.from({ length }).map((_, i) => (
					<Dot key={i} filled={i < code.length} color={theme.colors.primary} empty={theme.colors.border} />
				))}
			</Animated.View>

			{/* La entrada real: invisible pero presente, para que el teclado sea el del sistema */}
			<TextInput
				ref={inputRef}
				value={code}
				onChangeText={handleChange}
				keyboardType="number-pad"
				maxLength={length}
				editable={!disabled}
				secureTextEntry
				style={styles.hidden}
				// iOS ofrecería "contraseña guardada" sobre un PIN de 4 dígitos
				textContentType="oneTimeCode"
				autoComplete={Platform.OS === 'android' ? 'off' : undefined}
				caretHidden
				accessibilityLabel={undefined}
			/>
		</Pressable>
	)
}

/** Un punto: vacío es un aro; lleno entra con un rebote corto. */
const Dot = ({ filled, color, empty }: { filled: boolean, color: string, empty: string }) => {

	const fill = useSharedValue(filled ? 1 : 0)
	useEffect(() => {
		fill.value = filled ? withSpring(1, { damping: 12, stiffness: 320 }) : withTiming(0, { duration: 120 })
	}, [filled, fill])

	const style = useAnimatedStyle(() => ({
		transform: [{ scale: 0.75 + 0.25 * fill.value }],
		backgroundColor: fill.value > 0.5 ? color : 'transparent',
		borderColor: fill.value > 0.5 ? color : empty,
	}))

	return <Animated.View style={[styles.dot, style]} />
}

const styles = StyleSheet.create({
	row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: GAP, height: DOT * 2 },
	dot: { width: DOT, height: DOT, borderRadius: DOT / 2, borderWidth: 1.5 },
	// Fuera de la vista pero enfocable: `display:none` u opacity 0 con width 0 impiden el foco
	hidden: { position: 'absolute', opacity: 0, height: 1, width: 1, top: 0, left: 0 },
})

export default PinDots
