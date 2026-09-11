import { memo, useCallback } from 'react'
import { View, Text, Platform, Vibration, StyleSheet } from 'react-native'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import FontAwesome6 from '@react-native-vector-icons/fontawesome6'

// UI
import QPPressable from './QPPressable'

// Theme
import { useTheme } from '../../theme/ThemeContext'
import { hexToRgba } from '../../theme/themeUtils'

const DIGIT_ROWS = [['1', '2', '3'], ['4', '5', '6'], ['7', '8', '9']]

// Mismo pulso que el keypad de montos (iOS: Android no tiene permiso VIBRATE)
const VIBRATION_DURATION = 50

type QPPinPadProps = {
	onDigit: (digit: string) => void
	onBackspace: () => void
	onBiometric?: () => void
	biometricIcon?: ReactNode
	biometricLabel?: string
	disabled?: boolean
}

/**
 * Teclado numérico propio para introducir un PIN. Sustituye al teclado del
 * sistema: en una pantalla de bloqueo el teclado nativo tapaba el campo sin
 * dejar scroll (issue #47) y, al ir contra cajas de texto controladas, un
 * tecleo rápido podía perder dígitos. Aquí cada pulsación es un evento suelto,
 * así que ni hay nada que tapar ni dígitos que se pisen.
 *
 * La fila inferior ofrece el atajo biométrico (solo si se pasa `onBiometric`),
 * el cero y el borrado. Las teclas usan `QPPressable`, así que el rebote corre
 * en el hilo de UI.
 *
 * Va envuelto en `memo` y NO es cosmético: el pad se pinta junto a un contador
 * de dígitos que cambia con cada pulsación, y re-renderizar las doce teclas deja
 * el hilo de JS ocupado justo cuando llega la pulsación siguiente — que se
 * pierde, porque quien reclama el toque (`onStartShouldSetResponder`) corre en
 * ese mismo hilo. Con las props estables el pad se pinta una vez. Ojo al pasar
 * `biometricIcon`: un elemento creado en cada render anula el memo.
 *
 * @param props
 * @param props.onDigit - Recibe el dígito pulsado ('0'-'9').
 * @param props.onBackspace - Borrar el último dígito.
 * @param [props.onBiometric] - Sin él, el hueco inferior izquierdo queda vacío.
 * @param [props.biometricIcon] - Icono de la tecla biométrica (huella / Face ID).
 * @param [props.biometricLabel] - Etiqueta de accesibilidad de esa tecla.
 * @param [props.disabled=false] - Ignora las pulsaciones (p. ej. verificando).
 */
const QPPinPad = memo(({ onDigit, onBackspace, onBiometric, biometricIcon, biometricLabel, disabled = false }: QPPinPadProps) => {

	const { t } = useTranslation()
	const { theme } = useTheme()

	const tap = useCallback(() => {
		if (Platform.OS === 'ios') { Vibration.vibrate(VIBRATION_DURATION) }
	}, [])

	const handleDigit = useCallback((digit: string) => {
		tap()
		onDigit(digit)
	}, [tap, onDigit])

	const handleBackspace = useCallback(() => {
		tap()
		onBackspace()
	}, [tap, onBackspace])

	const handleBiometric = useCallback(() => {
		tap()
		onBiometric?.()
	}, [tap, onBiometric])

	// En claro las teclas necesitan borde para separarse del fondo; en oscuro
	// una superficie elevada sin borde (los bordes en dark ensucian la tarjeta)
	const keyStyle = [
		styles.key,
		{ backgroundColor: theme.colors.elevation },
		!theme.isDark && { borderWidth: 1, borderColor: theme.colors.border },
	]

	return (
		<View style={styles.pad}>

			{DIGIT_ROWS.map((row) => (
				<View key={row[0]} style={styles.row}>
					{row.map((digit) => (
						<QPPressable
							key={digit}
							style={keyStyle}
							onPress={() => handleDigit(digit)}
							disabled={disabled}
							accessibilityRole="button"
							accessibilityLabel={t('keypad.a11y.numberKeyLabel', { digit })}
						>
							<Text style={[styles.digit, { color: theme.colors.primaryText, fontSize: theme.typography.fontSize.xxl, fontFamily: theme.typography.fontFamily.medium }]}>
								{digit}
							</Text>
						</QPPressable>
					))}
				</View>
			))}

			<View style={styles.row}>

				{/* Atajo biométrico — tintado con el acento porque es el camino rápido */}
				{onBiometric ? (
					<QPPressable
						style={[styles.key, { backgroundColor: hexToRgba(theme.colors.primary, theme.isDark ? 0.18 : 0.12) }]}
						onPress={handleBiometric}
						disabled={disabled}
						accessibilityRole="button"
						accessibilityLabel={biometricLabel}
					>
						{biometricIcon}
					</QPPressable>
				) : (<View style={styles.key} />)}

				<QPPressable
					style={keyStyle}
					onPress={() => handleDigit('0')}
					disabled={disabled}
					accessibilityRole="button"
					accessibilityLabel={t('keypad.a11y.numberKeyLabel', { digit: '0' })}
				>
					<Text style={[styles.digit, { color: theme.colors.primaryText, fontSize: theme.typography.fontSize.xxl, fontFamily: theme.typography.fontFamily.medium }]}>
						0
					</Text>
				</QPPressable>

				<QPPressable
					style={keyStyle}
					onPress={handleBackspace}
					disabled={disabled}
					accessibilityRole="button"
					accessibilityLabel={t('keypad.a11y.deleteKeyLabel')}
					accessibilityHint={t('keypad.a11y.deleteKeyHint')}
				>
					<FontAwesome6 name="delete-left" size={22} color={theme.colors.secondaryText} iconStyle="solid" />
				</QPPressable>

			</View>

		</View>
	)
})

QPPinPad.displayName = 'QPPinPad'

const styles = StyleSheet.create({
	pad: {
		gap: 12,
		width: '100%',
		maxWidth: 340,
		alignSelf: 'center',
	},
	row: {
		flexDirection: 'row',
		gap: 12,
	},
	key: {
		flex: 1,
		height: 62,
		alignItems: 'center',
		justifyContent: 'center',
		borderRadius: 16,
		borderCurve: 'continuous',
	},
	digit: {
		includeFontPadding: false,
	},
})

export default QPPinPad
