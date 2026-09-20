import { useEffect } from 'react'
import { Platform } from 'react-native'
import RNScreenshotPrevent from 'react-native-screenshot-prevent'

/**
 * Bloquea capturas mientras `active` sea true (pantallas con la frase
 * secreta). Android: FLAG_SECURE (captura y grabación en negro, y la vista
 * previa del selector de apps también). iOS no permite bloquear: el truco
 * del campo seguro oculto hace que la captura y la grabación salgan en
 * negro, y `enabled` difumina la app en el selector de apps.
 *
 * Se desactiva al salir de la pantalla o al ocultar la frase.
 */
export const useSecureScreen = (active: boolean): void => {
	useEffect(() => {
		if (!active) return
		try {
			RNScreenshotPrevent.enabled(true)
			if (Platform.OS === 'ios') RNScreenshotPrevent.enableSecureView()
		} catch { /* módulo nativo ausente (tests, build sin pod install): sin bloqueo, sin crash */ }
		return () => {
			try {
				RNScreenshotPrevent.enabled(false)
				if (Platform.OS === 'ios') RNScreenshotPrevent.disableSecureView()
			} catch { /* idem */ }
		}
	}, [active])
}

export default useSecureScreen
