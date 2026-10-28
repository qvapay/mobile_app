import { Platform } from 'react-native'

/**
 * Android: handler de mensajes en segundo plano de FCM. Se registra desde
 * index.js ANTES de `AppRegistry.registerComponent` (lo exige Firebase). No
 * hace nada a propósito: las push de QvaPay llevan bloque `notification` y
 * con la app en segundo plano o cerrada las pinta el sistema; registrarlo
 * evita el aviso de Firebase y deja el gancho para cuando haga falta
 * procesar una push de solo datos.
 */
export const registerPushBackgroundHandler = (): void => {
	if (Platform.OS !== 'android') return
	try {
		const { getApps } = require('@react-native-firebase/app') as typeof import('@react-native-firebase/app')
		if (!getApps().length) return
		const { getMessaging, setBackgroundMessageHandler } = require('@react-native-firebase/messaging') as typeof import('@react-native-firebase/messaging')
		setBackgroundMessageHandler(getMessaging(), async () => { /* el sistema ya la mostró */ })
	} catch { /* sin Firebase en este build */ }
}
