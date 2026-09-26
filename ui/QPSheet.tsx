import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import Animated, { Easing, SlideInDown, runOnJS } from 'react-native-reanimated'
import FontAwesome6 from '@react-native-vector-icons/fontawesome6'
import { useTranslation } from 'react-i18next'

// Theme
import { useTheme } from '../theme/ThemeContext'
import { useTextStyles } from '../theme/themeUtils'

/**
 * Cuánto de la pantalla puede ocupar una hoja. UN número, aquí.
 *
 * Antes había cuatro repartidos por la app —80, 90, 92 y un `maxHeight: 400` en píxeles
 * fijos— para el mismo gesto, así que la misma lista subía distinto según desde dónde se
 * abriera. Lo que consume la cabecera de cada hoja se descuenta de este tope, nunca se
 * inventa otra fracción.
 */
export const SHEET_MAX_RATIO = 0.92

const SHEET_DURATION = 280

/**
 * Cómo entra una hoja: SOLO ella sube; el velo oscuro lo pone el `fade` del Modal en su
 * sitio. Con `animationType="slide"` subía el overlay entero como un bloque. No hay
 * `exiting`: un Modal desmonta al instante con `visible=false`, así que el cierre es el
 * fundido del Modal. Mismo timing que `ChargeSheet`. Fábrica y no constante: los builders
 * de Reanimated MUTAN al encadenar (`withCallback`), y una constante compartida acabaría
 * con el callback de otra hoja colgado.
 */
export const sheetEntering = () => SlideInDown.duration(SHEET_DURATION).easing(Easing.out(Easing.cubic))

/**
 * Si la hoja ya terminó de subir. Patrón Uniswap/Revolut: lo caro de montar (listas con
 * logos SVG) espera a que acabe la animación, porque montarlo en el mismo frame en que
 * arranca le roba los primeros cuadros y la hoja sube a tirones. Fuera de una hoja es
 * `true`: quien lo consulta nunca se queda esperando.
 */
const SheetReadyContext = createContext(true)
export const useSheetReady = () => useContext(SheetReadyContext)

/**
 * `children` cuando la hoja terminó de subir, `fallback` (un esqueleto ligero) mientras
 * tanto. Componente y no solo hook porque quien monta la hoja está FUERA de su contexto.
 */
export const SheetDeferred = ({ fallback, children }: { fallback: React.ReactNode, children: React.ReactNode }) => (
	<>{useSheetReady() ? children : fallback}</>
)

/**
 * Margen sobre la duración por si el callback de la animación no llega (movimiento
 * reducido, Android sin animaciones de layout, jest): la hoja no se queda en esqueleto.
 */
const READY_FALLBACK_MS = SHEET_DURATION + 120

/**
 * LA hoja inferior de la app: overlay que cierra al tocar fuera, tirador, cabecera con
 * título y aspa, y el contenido debajo.
 *
 * Existe porque el patrón estaba copiado en cuatro sitios con cuatro alturas y dos radios
 * distintos. Quien necesite una hoja monta esta; lo único que cambia es lo que va dentro.
 */
const QPSheet = ({ visible, title, onClose, children, dismissable = true, avoidKeyboard = false, headerRight }: {
	visible: boolean
	/** Sin título, la cabecera se reduce al aspa (o desaparece si tampoco se puede cerrar). */
	title?: string
	onClose: () => void
	children: React.ReactNode
	/** Mientras se firma o se envía no se deja cerrar tocando fuera. */
	dismissable?: boolean
	/** La hoja sube con el teclado (entradas de PIN, búsquedas). */
	avoidKeyboard?: boolean
	headerRight?: React.ReactNode
}) => {

	const { t } = useTranslation()
	const { theme } = useTheme()
	const textStyles = useTextStyles(theme)
	const insets = useSafeAreaInsets()
	const close = () => { if (dismissable) { onClose() } }

	const [ready, setReady] = useState(false)
	useEffect(() => {
		if (!visible) { setReady(false); return }
		const timer = setTimeout(() => setReady(true), READY_FALLBACK_MS)
		return () => clearTimeout(timer)
	}, [visible])
	const entering = useMemo(() => sheetEntering().withCallback((finished: boolean) => {
		'worklet'
		if (finished) { runOnJS(setReady)(true) }
	}), [])

	const body = (
		<Pressable style={styles.overlay} onPress={close}>
			{/* El responder absorbe los toques: sin él, tocar el tirador o cualquier hueco de la
			    hoja caía al overlay y la cerraba. Animated.View y no Pressable: animar un
			    Pressable revienta en Fabric */}
			<Animated.View entering={entering} onStartShouldSetResponder={() => true} style={[styles.sheet, { backgroundColor: theme.colors.background, paddingBottom: Math.max(insets.bottom, 16) }]}>
				<View style={[styles.grabber, { backgroundColor: theme.colors.border }]} />
				{(!!title || dismissable) && (
					<View style={styles.header}>
						<Text style={[textStyles.h3, { color: theme.colors.primaryText }]} numberOfLines={1}>{title ?? ''}</Text>
						<View style={styles.headerRight}>
							{headerRight}
							{dismissable && (
								<Pressable onPress={onClose} hitSlop={10} accessibilityRole="button" accessibilityLabel={t('common.actions.close')}>
									<FontAwesome6 name="xmark" size={20} color={theme.colors.secondaryText} iconStyle="solid" />
								</Pressable>
							)}
						</View>
					</View>
				)}
				<SheetReadyContext.Provider value={ready}>{children}</SheetReadyContext.Provider>
			</Animated.View>
		</Pressable>
	)

	return (
		<Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={close}>
			{avoidKeyboard
				? <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.flex}>{body}</KeyboardAvoidingView>
				: body}
		</Modal>
	)
}

const styles = StyleSheet.create({
	flex: { flex: 1 },
	overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' },
	sheet: {
		borderTopLeftRadius: 22, borderTopRightRadius: 22, borderCurve: 'continuous',
		maxHeight: `${SHEET_MAX_RATIO * 100}%`, paddingHorizontal: 20, overflow: 'hidden',
	},
	grabber: { width: 40, height: 4, borderRadius: 2, alignSelf: 'center', marginTop: 8, marginBottom: 6 },
	header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 10, gap: 12 },
	headerRight: { flexDirection: 'row', alignItems: 'center', gap: 16 },
})

export default QPSheet
