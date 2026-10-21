import { useEffect } from 'react'
import { NativeModules, TurboModuleRegistry, type TurboModule } from 'react-native'
import { useIsFocused } from '@react-navigation/native'

interface ScreenBrightnessModule extends TurboModule {
	boost(): Promise<boolean>
	restore(): Promise<boolean>
}

/**
 * Módulo nativo propio `ScreenBrightness` (ios/QvaPay/ScreenBrightness.swift y
 * android/.../bridge/ScreenBrightnessModule.kt). Se resuelve en call time, sin
 * spread: en la nueva arquitectura los métodos de un TurboModule viven en el
 * prototipo y un `{ ...module }` los pierde (ver useSecureScreen).
 */
const getNativeModule = (): ScreenBrightnessModule | null =>
	TurboModuleRegistry.get<ScreenBrightnessModule>('ScreenBrightness')
	?? NativeModules.ScreenBrightness
	?? null

/**
 * Brillo al máximo mientras `active` sea true Y la pantalla tenga el foco:
 * un QR se escanea mejor a plena luz. Se restaura al salir de la pantalla,
 * al empujar otra encima o al ocultar el QR (`active` a false). El paso a
 * segundo plano lo resuelve cada plataforma por su cuenta (iOS en el módulo,
 * Android porque el brillo es por ventana), así que aquí no hace falta AppState.
 *
 * Solo para pantallas bajo un navigator (usa `useIsFocused`).
 */
export const useMaxBrightness = (active: boolean = true): void => {
	const isFocused = useIsFocused()
	const on = active && isFocused
	useEffect(() => {
		if (!on) return
		const native = getNativeModule()
		if (!native) {
			if (__DEV__) console.warn('useMaxBrightness: módulo ScreenBrightness ausente, brillo SIN subir')
			return
		}
		native.boost().catch(() => {})
		return () => { native.restore().catch(() => {}) }
	}, [on])
}

export default useMaxBrightness
