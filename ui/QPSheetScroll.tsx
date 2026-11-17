import { useRef } from 'react'
import { ScrollView, type ScrollViewInstance } from 'react-native'
import type { ReactNode } from 'react'
import type { StyleProp, ViewStyle } from 'react-native'

import { useKeyboardHeight } from '../hooks/useKeyboardHeight'

type Props = { children: ReactNode, contentContainerStyle?: StyleProp<ViewStyle> }

/**
 * El contenido con scroll de una hoja (`QPSheet` con `avoidKeyboard`) que termina en un campo
 * y su botón: el PIN/OTP de una confirmación.
 *
 * Con el teclado abierto la hoja sube y se encoge, y lo último del contenido, que es justo
 * donde se escribe, quedaba fuera de la vista: se tecleaba el PIN sin ver las cajas. Cuando
 * el teclado le cambia el alto, el scroll va al final.
 *
 * @param props.contentContainerStyle - Estilo del contenido (separación entre bloques, etc.).
 */
const QPSheetScroll = ({ children, contentContainerStyle }: Props) => {

	const ref = useRef<ScrollViewInstance>(null)
	const { keyboardVisible } = useKeyboardHeight()

	// En `onLayout` y no al llegar el evento del teclado: para entonces el alto nuevo aún no
	// está puesto y «el final» sería el de antes. Sin teclado no se mueve nada
	const revealEnd = () => { if (keyboardVisible) { ref.current?.scrollToEnd({ animated: true }) } }

	return (
		<ScrollView ref={ref} onLayout={revealEnd} contentContainerStyle={contentContainerStyle} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
			{children}
		</ScrollView>
	)
}

export default QPSheetScroll
