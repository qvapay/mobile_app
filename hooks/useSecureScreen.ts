import { useEffect } from 'react'
import { NativeModules, TurboModuleRegistry, type TurboModule } from 'react-native'

interface ScreenshotPreventModule extends TurboModule {
	enabled(enable: boolean): void
}

/**
 * El módulo nativo se resuelve AQUÍ, no con el default export de
 * react-native-screenshot-prevent: la librería lo construye con
 * `{ ...nativeModule }`, y en la nueva arquitectura los métodos de un
 * TurboModule viven en el prototipo — el spread los pierde, `enabled` queda
 * undefined y el bloqueo nunca se activaba (el catch se lo tragaba).
 */
const getNativeModule = (): ScreenshotPreventModule | null =>
	TurboModuleRegistry.get<ScreenshotPreventModule>('RNScreenshotPrevent')
	?? NativeModules.RNScreenshotPrevent
	?? null

/**
 * Bloquea capturas mientras `active` sea true (pantallas con la frase
 * secreta). Android: FLAG_SECURE (captura y grabación en negro, y la vista
 * previa del selector de apps también). iOS: solo difumina la app en el
 * selector de apps — iOS no permite bloquear capturas, y el truco del campo
 * seguro de la librería (`enableSecureView`) reparenta la capa raíz de React
 * y crashea al desactivarse; queda fuera hasta tener una vista segura propia.
 *
 * Se desactiva al salir de la pantalla o al ocultar la frase.
 */
export const useSecureScreen = (active: boolean): void => {
	useEffect(() => {
		if (!active) return
		const native = getNativeModule()
		if (!native) {
			if (__DEV__) console.warn('useSecureScreen: módulo RNScreenshotPrevent ausente, capturas SIN bloquear')
			return
		}
		native.enabled(true)
		return () => native.enabled(false)
	}, [active])
}

export default useSecureScreen
