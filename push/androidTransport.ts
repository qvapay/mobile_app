import { PermissionsAndroid, Platform } from 'react-native'
import { getApps } from '@react-native-firebase/app'
import {
	AuthorizationStatus,
	getInitialNotification,
	getMessaging,
	getToken,
	hasPermission,
	onMessage,
	onNotificationOpenedApp,
	onTokenRefresh,
} from '@react-native-firebase/messaging'
import { normalizePushData } from './transport'
import type { PushMessage, PushPermission, PushTransport } from './transport'
import type { RemoteMessage } from '@react-native-firebase/messaging'

/**
 * Android: Firebase Cloud Messaging vía @react-native-firebase/messaging.
 *
 * Sin `google-services.json` en el build (un clon sin credenciales de
 * Firebase) la app arranca sin la app por defecto de Firebase: aquí todo
 * degrada a "sin token" en vez de lanzar. Con la app en segundo plano o
 * cerrada el SISTEMA pinta la notificación (bloque `notification` + canal +
 * icono/color del manifest); con la app delante llega por `onMessage` y la
 * app la presenta como toast (hooks/useAppNavigation).
 */
const POST_NOTIFICATIONS = 'android.permission.POST_NOTIFICATIONS' as const

const hasFirebaseApp = (): boolean => {
	try { return getApps().length > 0 } catch { return false }
}

const toMessage = (remote: RemoteMessage | null | undefined): PushMessage | null => {
	if (!remote) return null
	return {
		title: remote.notification?.title ?? undefined,
		body: remote.notification?.body ?? undefined,
		data: normalizePushData(remote.data),
	}
}

const isTiramisu = (): boolean => Platform.OS === 'android' && Number(Platform.Version) >= 33

/**
 * Android 13+: permiso de runtime. Sin él no se distingue "nunca preguntado"
 * de "denegado" (el sistema no lo cuenta), así que se devuelve `undetermined`
 * y es `requestPermission` quien lo resuelve: un rechazo permanente vuelve al
 * instante como NEVER_ASK_AGAIN → `blocked`. Antes de 13 el permiso es
 * implícito: solo cuenta que las notificaciones de la app no estén apagadas.
 */
const getPermission = async (): Promise<PushPermission> => {
	if (isTiramisu()) {
		try { if (await PermissionsAndroid.check(POST_NOTIFICATIONS)) return 'granted' } catch { /* sigue abajo */ }
		return 'undetermined'
	}
	if (!hasFirebaseApp()) return 'granted'
	try {
		const status = await hasPermission(getMessaging())
		return status === AuthorizationStatus.DENIED ? 'blocked' : 'granted'
	} catch {
		return 'granted'
	}
}

const requestPermission = async (): Promise<PushPermission> => {
	if (!isTiramisu()) return getPermission()
	try {
		const result = await PermissionsAndroid.request(POST_NOTIFICATIONS)
		if (result === PermissionsAndroid.RESULTS.GRANTED) return 'granted'
		return result === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN ? 'blocked' : 'denied'
	} catch {
		return 'denied'
	}
}

export const createAndroidTransport = (): PushTransport => ({
	getPermission,
	requestPermission,
	getToken: async () => {
		if (!hasFirebaseApp()) return null
		try {
			const token = await getToken(getMessaging())
			return token ? { token, provider: 'fcm' } : null
		} catch {
			return null
		}
	},
	onTokenRefresh: (listener) => {
		if (!hasFirebaseApp()) return () => {}
		return onTokenRefresh(getMessaging(), token => { if (token) listener({ token, provider: 'fcm' }) })
	},
	onMessage: (listener) => {
		if (!hasFirebaseApp()) return () => {}
		return onMessage(getMessaging(), remote => { const message = toMessage(remote); if (message) listener(message) })
	},
	onOpened: (listener) => {
		if (!hasFirebaseApp()) return () => {}
		return onNotificationOpenedApp(getMessaging(), remote => { const message = toMessage(remote); if (message) listener(message) })
	},
	getInitialMessage: async () => {
		if (!hasFirebaseApp()) return null
		try { return toMessage(await getInitialNotification(getMessaging())) } catch { return null }
	},
})
