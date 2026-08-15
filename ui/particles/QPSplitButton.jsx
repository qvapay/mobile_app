import { useState, useEffect } from 'react'
import { Text, View, ActivityIndicator } from 'react-native'
import Animated, {
	FadeIn,
	useAnimatedStyle,
	useSharedValue,
	withSpring,
} from 'react-native-reanimated'

// Theme Context
import { useTheme } from '../../theme/ThemeContext'

// Press animation wrapper (Reanimated)
import QPPressable from './QPPressable'

// Icons
import FontAwesome6 from '@react-native-vector-icons/fontawesome6'

/**
 * QPSplitButton — botonera de wizard estilo split-button (patrón de
 * reactiive.io/demos/steps), usada por Onboard y el wizard de Register.
 * El botón primario ocupa toda la fila (`flex: 1`) y le cede el 25% al botón
 * Atrás animando el width del slot con overflow hidden; el botón interno
 * mantiene ancho fijo para que su texto no refluya durante la transición.
 * Con `check` un ícono se desliza dentro del botón primario (último paso).
 * Springs sobreamortiguados (dampingRatio 1.5): sin rebote.
 *
 * IMPORTANTE: para que la apertura/cierre del Atrás se vea, el componente debe
 * PERSISTIR entre pasos del wizard — renderízalo una sola vez y cambia sus
 * props, no lo montes/desmontes dentro de un switch por paso.
 *
 * @param {object} props
 * @param {string} props.title - Label del botón primario.
 * @param {function} props.onPress - Handler del botón primario.
 * @param {boolean} [props.showBack=false] - Abre el slot del botón Atrás.
 * @param {function} [props.onBack] - Handler del botón Atrás.
 * @param {string} [props.backLabel='Atrás'] - Label del botón Atrás.
 * @param {boolean} [props.check=false] - Desliza el check dentro del primario.
 * @param {boolean} [props.disabled=false] - Deshabilita y atenúa el primario.
 * @param {boolean} [props.loading=false] - Spinner en el primario, bloquea ambos.
 * @param {number} [props.backRatio=0.25] - Fracción de la fila que ocupa el secundario (los modales de filtros usan 0.5 para repartir a partes iguales).
 * @param {string} [props.backColor] - Fondo del secundario (default `theme.colors.secondary`).
 * @param {string} [props.backTextColor] - Tinta del secundario (default `theme.colors.buttonText`).
 */

const DEFAULT_BACK_RATIO = 0.25
const GAP = 10
const BUTTON_HEIGHT = 56
const CHECK_WIDTH = 20
const SPLIT_SPRING = { duration: 300, dampingRatio: 1.5 }

const QPSplitButton = ({ title, onPress, showBack = false, onBack, backLabel = 'Atrás', check = false, disabled = false, loading = false, backRatio = DEFAULT_BACK_RATIO, backColor, backTextColor }) => {

	// Contexts
	const { theme } = useTheme()

	// Ancho real de la fila (medido, no derivado de la ventana) → ancho del Atrás
	const [rowWidth, setRowWidth] = useState(0)
	const backWidth = rowWidth > 0 ? (rowWidth - GAP) * backRatio : 0

	const backProgress = useSharedValue(showBack ? 1 : 0)
	const checkProgress = useSharedValue(check ? 1 : 0)

	useEffect(() => {
		backProgress.value = withSpring(showBack ? 1 : 0, SPLIT_SPRING)
	}, [showBack, backProgress])

	useEffect(() => {
		checkProgress.value = withSpring(check ? 1 : 0, SPLIT_SPRING)
	}, [check, checkProgress])

	const backSlotStyle = useAnimatedStyle(() => ({
		width: backProgress.value * backWidth,
		marginRight: backProgress.value * GAP,
		opacity: backProgress.value,
	}), [backWidth])

	const checkStyle = useAnimatedStyle(() => ({
		width: checkProgress.value * CHECK_WIDTH,
		marginRight: checkProgress.value * 8,
		opacity: checkProgress.value,
	}))

	const labelStyle = {
		fontSize: theme.typography.fontSize.md,
		fontFamily: theme.typography.fontFamily.semiBold,
		color: theme.colors.buttonText,
	}

	return (
		<View style={styles.row} onLayout={(e) => setRowWidth(e.nativeEvent.layout.width)}>

			{/* Atrás — slot que se abre/cierra */}
			<Animated.View style={[styles.backSlot, backSlotStyle]}>
				<QPPressable
					onPress={onBack}
					disabled={!showBack || loading}
					accessibilityLabel={backLabel}
					style={[styles.button, { width: backWidth, backgroundColor: backColor || theme.colors.secondary }]}>
					<Text style={[labelStyle, backTextColor && { color: backTextColor }]}>{backLabel}</Text>
				</QPPressable>
			</Animated.View>

			{/* Primario — flex 1, se achica solo cuando el slot se abre */}
			<QPPressable
				onPress={onPress}
				disabled={disabled || loading}
				style={[
					styles.button,
					styles.primary,
					{ backgroundColor: disabled ? theme.colors.secondaryText : theme.colors.primary },
					{ opacity: disabled ? 0.5 : 1 },
				]}>
				{loading ? (<ActivityIndicator size="small" color={theme.colors.almostWhite} />) : (
					<>
						<Animated.View style={[styles.checkSlot, checkStyle]}>
							<FontAwesome6 name="circle-check" size={16} color={theme.colors.buttonText} iconStyle="solid" />
						</Animated.View>
						<Animated.Text key={title} entering={FadeIn.duration(200)} style={labelStyle}>
							{title}
						</Animated.Text>
					</>
				)}
			</QPPressable>
		</View>
	)
}

const styles = {
	row: {
		flexDirection: 'row',
		alignItems: 'center',
		width: '100%',
		marginVertical: 5,
	},
	backSlot: {
		overflow: 'hidden',
	},
	button: {
		height: BUTTON_HEIGHT,
		borderRadius: BUTTON_HEIGHT / 2,
		borderCurve: 'continuous',
		flexDirection: 'row',
		alignItems: 'center',
		justifyContent: 'center',
	},
	primary: {
		flex: 1,
	},
	checkSlot: {
		alignItems: 'center',
		justifyContent: 'center',
		overflow: 'hidden',
	},
}

export default QPSplitButton
