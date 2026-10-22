import { memo } from 'react'
import { View, Text, Pressable, StyleSheet } from 'react-native'
import type { PressableStateCallbackType } from 'react-native'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import ReactNativeHapticFeedback from 'react-native-haptic-feedback'
import FontAwesome6 from '@react-native-vector-icons/fontawesome6'

import { useTheme } from '../theme/ThemeContext'

/**
 * Tecla de abajo a la izquierda: el punto decimal (montos), una acción propia
 * con su icono (la biometría del bloqueo) o un hueco.
 */
export type KeypadExtraKey = 'decimal' | { icon: ReactNode, label: string, onPress: () => void } | null

type QPKeypadProps = {
	/** Recibe '0'–'9', '.' o 'backspace'. */
	onKey: (key: string) => void
	extraKey?: KeypadExtraKey
	disabled?: boolean
	/** Teclas de 52 en vez de 60 y menos aire: pantallas bajas (el bloqueo en un Android de 640 dp). */
	compact?: boolean
	/** Pistas de accesibilidad de la pantalla (p. ej. «Añade este número al monto»). */
	numberHint?: string
	deleteHint?: string
	/** E2E: cada tecla lleva `${testIDPrefix}-${tecla}` (`-extra` la de abajo a la izquierda). */
	testIDPrefix?: string
}

const DIGIT_ROWS = [['1', '2', '3'], ['4', '5', '6'], ['7', '8', '9']]

// El mismo tic que el cambio de pestaña del BottomBar (Taptic Engine en iOS, vibrador en Android)
const tick = () => ReactNativeHapticFeedback.trigger('impactLight', { enableVibrateFallback: true, ignoreAndroidSystemSettings: false })

/**
 * Teclado numérico de la app: el del tab Keypad, también en la pantalla de
 * bloqueo. Tres filas de dígitos y una inferior con la tecla extra, el cero y
 * el borrado; cada pulsación da el tic háptico.
 *
 * Va en `memo` y NO es cosmético: junto al teclado hay algo que cambia con cada
 * pulsación (el monto, los puntos del PIN), y repintar las doce teclas ocupa el
 * hilo de JS justo cuando llega la pulsación siguiente, que se pierde. Con
 * `onKey` y `extraKey` estables el teclado se pinta una vez; un `extraKey`
 * creado en cada render anula el memo.
 */
const QPKeypad = memo(({ onKey, extraKey = null, disabled = false, compact = false, numberHint, deleteHint, testIDPrefix }: QPKeypadProps) => {

	const { t } = useTranslation()
	const { theme } = useTheme()

	// En claro las teclas translúcidas no se leen sobre blanco: se perfilan con el acento
	const keyStyle = ({ pressed }: PressableStateCallbackType) => [styles.key, compact && styles.keyCompact, pressed && styles.keyPressed, !theme.isDark && { borderColor: theme.colors.primary, borderWidth: 0.3 }]
	const rowStyle = compact ? [styles.row, styles.rowCompact] : styles.row
	const press = (key: string) => () => { tick(); onKey(key) }
	const testID = (key: string) => (testIDPrefix ? `${testIDPrefix}-${key}` : undefined)

	const digit = (key: string) => (
		<Pressable
			key={key}
			testID={testID(key === '.' ? 'decimal' : key)}
			style={keyStyle}
			onPress={press(key)}
			accessibilityRole="button"
			accessibilityLabel={t('keypad.a11y.numberKeyLabel', { digit: key })}
			accessibilityHint={numberHint}
			disabled={disabled}
		>
			<Text style={{ color: theme.colors.primaryText, fontSize: theme.typography.fontSize.xxl, fontFamily: theme.typography.fontFamily.medium }}>{key}</Text>
		</Pressable>
	)

	const extra = extraKey === 'decimal' ? digit('.')
		: extraKey ? (
			<Pressable
				key="extra"
				testID={testID('extra')}
				style={keyStyle}
				onPress={() => { tick(); extraKey.onPress() }}
				accessibilityRole="button"
				accessibilityLabel={extraKey.label}
				disabled={disabled}
			>
				{extraKey.icon}
			</Pressable>
		)
			: <View key="extra" style={[styles.slot, compact && styles.keyCompact]} />

	return (
		<View style={styles.pad}>
			{DIGIT_ROWS.map(row => <View key={row[0]} style={rowStyle}>{row.map(digit)}</View>)}
			<View style={rowStyle}>
				{extra}
				{digit('0')}
				<Pressable
					key="backspace"
					testID={testID('backspace')}
					style={keyStyle}
					onPress={press('backspace')}
					accessibilityRole="button"
					accessibilityLabel={t('keypad.a11y.deleteKeyLabel')}
					accessibilityHint={deleteHint}
					disabled={disabled}
				>
					<FontAwesome6 name="delete-left" size={20} color={theme.colors.primaryText} style={styles.icon} iconStyle="solid" />
				</Pressable>
			</View>
		</View>
	)
})

const styles = StyleSheet.create({
	pad: { width: '100%' },
	row: { flexDirection: 'row', gap: 12, marginBottom: 12 },
	rowCompact: { gap: 10, marginBottom: 10 },
	key: {
		flex: 1,
		height: 60,
		alignItems: 'center',
		justifyContent: 'center',
		borderRadius: 16,
		borderCurve: 'continuous',
		backgroundColor: 'rgba(255, 255, 255, 0.05)',
		borderWidth: 1,
		borderColor: 'rgba(255, 255, 255, 0.1)',
	},
	keyCompact: { height: 52 },
	keyPressed: { backgroundColor: 'rgba(255, 255, 255, 0.1)', transform: [{ scale: 0.95 }] },
	slot: { flex: 1, height: 60 },
	icon: { marginHorizontal: 2 },
})

export default QPKeypad
