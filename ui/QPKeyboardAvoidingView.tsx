import { useEffect, useRef, useState } from 'react'
import { Keyboard, LayoutAnimation, Platform, View, type KeyboardEvent, type ViewInstance } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import type { ReactNode } from 'react'
import type { StyleProp, ViewStyle } from 'react-native'

import { useKeyboardHeight } from '../hooks/useKeyboardHeight'

type Props = { style?: StyleProp<ViewStyle>, children: ReactNode }

/**
 * Reemplazo de KeyboardAvoidingView que deja el footer (el botón de abajo) justo encima
 * del teclado en las dos plataformas.
 *
 * - **iOS**: el `KeyboardAvoidingView` de RN calcula cuánto tapa el teclado con el frame
 *   de `onLayout`, que es RELATIVO AL PADRE. Bajo una cabecera opaca de native-stack la
 *   vista empieza ~110 pt más abajo de lo que cree, así que reservaba el alto del
 *   teclado MENOS la cabecera y el botón quedaba entero debajo del teclado. Aquí se mide
 *   en la ventana (`measureInWindow`) y se anima con la curva del teclado, como el de RN.
 * - **Android**: con edge-to-edge (`edgeToEdgeEnabled`) la ventana ya no se encoge con el
 *   teclado — `adjustResize` no hace nada —, así que se reserva el alto a mano. El evento
 *   de RN lo da SIN la barra de navegación (`ime - systemBars`), y como la pantalla llega
 *   hasta el borde inferior se le suma el inset de abajo.
 *
 * @param props.style - Estilo del contenedor (normalmente `containerStyles.subContainer`).
 */
const QPKeyboardAvoidingView = (props: Props) => (Platform.OS === 'ios' ? <IOSAvoider {...props} /> : <AndroidAvoider {...props} />)

const IOSAvoider = ({ style, children }: Props) => {

	const ref = useRef<ViewInstance>(null)
	const [overlap, setOverlap] = useState(0)

	useEffect(() => {
		// La misma curva y duración que el teclado, como hace el KeyboardAvoidingView de RN
		const followKeyboard = (e: KeyboardEvent) => {
			if (!e.duration || !e.easing) return
			const duration = Math.max(e.duration, 10)
			LayoutAnimation.configureNext({ duration, update: { duration, type: LayoutAnimation.Types[e.easing] || 'keyboard' } })
		}
		const onFrame = (e: KeyboardEvent) => {
			const keyboardTop = e.endCoordinates.screenY
			ref.current?.measureInWindow((_x, y, _width, height) => {
				// El padding va por dentro: no mueve el frame que se acaba de medir
				const next = Math.max(0, Math.round(y + height - keyboardTop))
				followKeyboard(e)
				setOverlap(next)
			})
		}
		const onHide = (e: KeyboardEvent) => {
			followKeyboard(e)
			setOverlap(0)
		}
		const subs = [Keyboard.addListener('keyboardWillChangeFrame', onFrame), Keyboard.addListener('keyboardWillHide', onHide)]
		return () => subs.forEach(sub => sub.remove())
	}, [])

	return <View ref={ref} style={[style, overlap > 0 && { paddingBottom: overlap }]}>{children}</View>
}

const AndroidAvoider = ({ style, children }: Props) => {

	const insets = useSafeAreaInsets()
	const { keyboardHeight, keyboardVisible } = useKeyboardHeight()

	return <View style={[style, keyboardVisible && { paddingBottom: keyboardHeight + insets.bottom }]}>{children}</View>
}

export default QPKeyboardAvoidingView
