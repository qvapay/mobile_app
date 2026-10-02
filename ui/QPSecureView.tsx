import React from 'react'
import { Platform, View, type ViewProps } from 'react-native'
import NativeQPSecureView from '../specs/QPSecureViewNativeComponent'

/**
 * Envuelve contenido que NO debe salir en capturas (la frase secreta).
 * iOS: componente nativo cuyo contenido sale en negro en capturas, grabación
 * y AirPlay. Android: View normal — ahí el bloqueo es de ventana entera
 * (FLAG_SECURE vía `useSecureScreen`), que las pantallas activan aparte.
 */
const QPSecureView = (props: ViewProps) =>
	Platform.OS === 'ios' ? <NativeQPSecureView {...props} /> : <View {...props} />

export default QPSecureView
