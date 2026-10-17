import { KeyboardAvoidingView, Platform, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import type { ReactNode } from 'react'
import type { StyleProp, ViewStyle } from 'react-native'

import { useKeyboardHeight } from '../hooks/useKeyboardHeight'

/**
 * KeyboardAvoidingView que también levanta el footer en Android. Con edge-to-edge
 * (`edgeToEdgeEnabled`) la ventana ya no se encoge con el teclado — `adjustResize` no
 * hace nada —, así que el `behavior={undefined}` de Android dejaba el botón de abajo
 * TAPADO por el teclado. En Android se reserva el alto del teclado a mano; el evento de
 * RN lo da SIN la barra de navegación (`ime - systemBars`), y como la pantalla llega
 * hasta el borde inferior se le suma el inset de abajo.
 *
 * @param props.style - Estilo del contenedor (normalmente `containerStyles.subContainer`).
 */
const QPKeyboardAvoidingView = ({ style, children }: { style?: StyleProp<ViewStyle>, children: ReactNode }) => {

	const insets = useSafeAreaInsets()
	const { keyboardHeight, keyboardVisible } = useKeyboardHeight()

	if (Platform.OS === 'ios') return <KeyboardAvoidingView behavior="padding" style={style}>{children}</KeyboardAvoidingView>

	return <View style={[style, keyboardVisible && { paddingBottom: keyboardHeight + insets.bottom }]}>{children}</View>
}

export default QPKeyboardAvoidingView
