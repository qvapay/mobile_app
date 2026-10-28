// Centralizes the app-root navigation side effects: splash timing, store-update
// prompt, auth → navigation reconciliation, deep-link capture and push
// listeners. Extracted from AppNavigator so the component itself only declares
// routes (see App.tsx).
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Linking } from 'react-native'
import { useNavigation } from '@react-navigation/native'

// Push propias (FCM en Android, APNs en iOS): suscripciones y eventos de entrega
import { subscribeForegroundPush, subscribeOpenedPush, takeInitialPush, trackPushOpened, trackPushReceived } from '../push'

// Toast
import { toast } from 'sonner-native'

// Contexts
import { useAuth } from '../auth/AuthContext'
import { useSettings } from '../settings/SettingsContext'
import { useWallet } from '../wallet/WalletContext'

// Routes
import { ROUTES } from '../routes'
import { resolveRootRoute } from './rootRoute'

// Helpers
import playSound from '../helpers/playSound'
import { markIncomingSoundPlayed } from './useIncomingMoneySound'
import { isMoneyInPush, isMoneySoundPush, pushTransactionUuid, resolvePushNavigation } from '../helpers/pushRouting'
import { resolveDeepLinkTarget } from '../helpers/deepLinkTarget'
import { maybePromptUpdate } from '../helpers/versionCheck'
import { consumeInstallReferrer } from '../helpers/installReferrer'
import { isDeepLinkRoute } from './deepLinkRoutes'

// i18n (fuera de render: los toasts se disparan en efectos/listeners)
import i18n from '../i18n'

// Caché de servidor (el cliente singleton: este hook vive fuera del árbol de queries)
import { queryClient } from '../api/queryClient'
import { trimToFirstPage } from '../api/queryUtils'

// Tipos
import type { PushData } from '../helpers/pushRouting'
import type { DeepLinkTarget } from '../helpers/deepLinkTarget'
import type { PushMessage } from '../push/transport'

/** Resultado de helpers/versionCheck.maybePromptUpdate consumido por el modal. */
type UpdateInfo = { needsUpdate: boolean, currentVersion?: string, latestVersion?: string, storeUrl?: string }

/**
 * Clave del toast "inicia sesión primero" que corresponde a un deep link que
 * llega SIN sesión, o null si la URL no es un destino con sesión que la app
 * sepa abrir (esos se pierden sin más, como hasta ahora).
 */
const loginToastKeyFor = (url: string): string | null => {
	switch (resolveDeepLinkTarget(url)?.name) {
		case ROUTES.PAY_SCREEN: return 'hooks.appNavigation.toasts.loginToPay'
		case ROUTES.P2P_OFFER_SCREEN: return 'hooks.appNavigation.toasts.loginToSeeOffer'
		case ROUTES.MARKET_STORE:
		case ROUTES.MARKET_PRODUCT: return 'hooks.appNavigation.toasts.loginToSeeStore'
		case ROUTES.MINIAPP_HOST: return 'hooks.appNavigation.toasts.loginToOpenApp'
		default: return null
	}
}

/**
 * Estado de navegación que deja el destino encima de MainStack (atrás cae en
 * Home). Una pestaña (`/home`, `/p2p`…) ES MainStack con la pestaña como param.
 * Los nombres llegan como string en runtime, así que no casan con
 * RootStackParamList en compilación: el que llama lo pasa como `never`.
 */
const stateForTarget = (target: DeepLinkTarget) => {
	const route = { name: target.name, ...(target.params ? { params: target.params } : {}) }
	return target.name === ROUTES.MAIN_STACK
		? { index: 0, routes: [route] }
		: { index: 1, routes: [{ name: ROUTES.MAIN_STACK }, route] }
}

/**
 * Drives the app-root navigation flow: minimum 2s splash, store-update check
 * (helpers/versionCheck → UpdatePromptModal), auth ↔ navigation reconciliation,
 * deep-link capture while unauthenticated, and push foreground/tap listeners
 * (toast + optional sound; tap navigates to the right screen, or waits for
 * the reconciliation when the app is still booting or logged out).
 *
 * Deep links (/pay/:uuid, /p2p/:p2p_uuid, /store/:slug, /apps/:slug) that
 * arrive while logged out are stashed in `pendingDeepLinkRef` with a localized
 * "log in first" toast; once authenticated the stack is reset to MainStack +
 * the target screen, so back lands on Home instead of exiting. A cold start
 * WITH a session mounts the target as the only root route (React Navigation
 * builds the initial state from the URL): it gets MainStack put underneath
 * instead of being thrown away.
 *
 * @param pendingDeepLinkRef - App-root ref holding a deep link URL captured pre-auth.
 * @returns State AppNavigator needs to render the splash gate, the initial
 *   route and the update modal (`navigation`, `user`, flags de carga,
 *   `updateInfo`/`dismissUpdate`) — tipo exacto por inferencia; `navigation`
 *   llega tipado por la declaración global de types/navigation.ts.
 */
export function useAppNavigation(pendingDeepLinkRef: { current: string | null }) {
	const navigation = useNavigation()
	const { user, isAuthenticated, isLoading: authLoading } = useAuth()
	const { appearance, sounds, isLoading: settingsLoading } = useSettings()
	const firstTime = appearance.firstTime
	const { isReady: walletReady, hasWallet } = useWallet()

	// hasWallet por ref y NO en deps: crear la wallet desde Welcome la flipea a
	// mitad del quiz de backup, y un reset ahí sacaría al usuario del flujo. El
	// paso a WalletOnly lo hace el propio flujo al terminar (finishWalletSetup);
	// aquí solo cuenta en arranque, login y logout
	const hasWalletRef = useRef(hasWallet)
	useEffect(() => { hasWalletRef.current = hasWallet }, [hasWallet])

	// State to control minimum splash screen time
	const [splashReady, setSplashReady] = useState(false)

	// Update prompt state
	const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null)

	// Destino de una push tocada que aún no se puede abrir (arranque en frío
	// antes de reconciliar, o sin sesión): lo consume la reconciliación de abajo
	const pendingPushRef = useRef<DeepLinkTarget | null>(null)
	const isAuthenticatedRef = useRef(isAuthenticated)
	useEffect(() => { isAuthenticatedRef.current = isAuthenticated }, [isAuthenticated])
	// Mientras auth hidrata el Keychain, «sin sesión» aún no significa nada
	const authLoadingRef = useRef(authLoading)
	useEffect(() => { authLoadingRef.current = authLoading }, [authLoading])

	useEffect(() => {
		const timer = setTimeout(() => {
			setSplashReady(true)
		}, 2000)
		return () => clearTimeout(timer)
	}, [])

	// Deferred deep link (Android Install Referrer): on the first launch after a
	// Play install, the campaign link may carry a destination (`qp_link`). It is
	// queued in pendingDeepLinkRef so the auth reconciliation below opens it
	// after login/registration — same path a pre-auth universal link takes.
	useEffect(() => {
		(async () => {
			const attribution = await consumeInstallReferrer()
			if (attribution?.qpLink && !pendingDeepLinkRef.current) { pendingDeepLinkRef.current = `https://www.qvapay.com${attribution.qpLink}` }
		})()
	}, [pendingDeepLinkRef])

	// Check for store update on app launch
	useEffect(() => {
		(async () => {
			const info = (await maybePromptUpdate()) as UpdateInfo | null
			if (info?.needsUpdate) setUpdateInfo(info)
		})()
	}, [])

	// Navigation handler for auth state changes.
	// Reconciles the navigation tree with auth state, which can flip from many
	// sources outside this tree (login screen, logout, background token expiry,
	// app launch) — so this is a genuine reactive effect, not a faked handler.
	useEffect(() => {
		if (splashReady && !authLoading && !settingsLoading && walletReady) {
			const state = navigation.getState()
			const current = state?.routes[state?.index || 0]
			const currentRoute = current?.name
			if (isAuthenticated && !firstTime && currentRoute !== ROUTES.MAIN_STACK) {
				// Check for a pending deep link after login (the URL wins over a
				// pending push tap; both are consumed so nothing stale survives)
				const pendingUrl = pendingDeepLinkRef.current
				const pendingPush = pendingPushRef.current
				pendingDeepLinkRef.current = null
				pendingPushRef.current = null
				const target = resolveDeepLinkTarget(pendingUrl) ?? pendingPush
				if (target) {
					navigation.reset(stateForTarget(target) as never)
					return
				}
				// Arranque en frío CON sesión desde un deep link: React Navigation montó
				// el destino como ÚNICA ruta raíz. Se conserva encima de MainStack para
				// que «atrás» caiga en Home y no cierre la app. El nombre llega como
				// string en runtime, así que no casa con RootStackParamList en compilación
				if (current && isDeepLinkRoute(currentRoute)) {
					navigation.reset({
						index: 1,
						routes: [
							{ name: ROUTES.MAIN_STACK },
							{ name: currentRoute, params: current.params } as never,
						],
					})
					return
				}
				navigation.reset({ index: 0, routes: [{ name: ROUTES.MAIN_STACK }] })
			} else if (!isAuthenticated && !firstTime) {
				// Sin sesión: Welcome, o el modo wallet si la seed vive en el teléfono
				const target = resolveRootRoute({ firstTime, isAuthenticated, hasWallet: hasWalletRef.current })
				if (currentRoute === target) return
				// Una push tocada con auth aún hidratando se guardó sin avisar (podía
				// haber sesión); ahora que se sabe que no la hay, se avisa
				if (pendingPushRef.current) toast.info(i18n.t('hooks.appNavigation.toasts.loginToOpenNotification'))
				// Capture the current deep link URL before resetting to Welcome
				Linking.getInitialURL().then((url) => {
					if (!url) return
					const toastKey = loginToastKeyFor(url)
					if (!toastKey) return
					pendingDeepLinkRef.current = url
					toast.info(i18n.t(toastKey))
				})
				navigation.reset({ index: 0, routes: [{ name: target }] })
			}
		}
	}, [splashReady, authLoading, settingsLoading, walletReady, isAuthenticated, firstTime, navigation, pendingDeepLinkRef])

	// Listen for foreground deep links while unauthenticated
	useEffect(() => {
		const subscription = Linking.addEventListener('url', ({ url }) => {
			if (!isAuthenticated && url) {
				const toastKey = loginToastKeyFor(url)
				if (!toastKey) return
				pendingDeepLinkRef.current = url
				toast.info(i18n.t(toastKey))
			}
		})
		return () => subscription.remove()
	}, [isAuthenticated, pendingDeepLinkRef])

	// Push tocada: abre su destino (deeplink del backend o enrutado por tipo).
	// Con la app ya reconciliada (MainStack en la raíz) navega en el acto; en un
	// arranque en frío o sin sesión se guarda y lo consume la reconciliación.
	// Por ref: lo llaman efectos sin deps (la push inicial se consume una vez).
	// Se asigna en un layout effect, no en el render (React puede repetir o
	// descartar un render; el efecto corre antes que cualquier promesa que la use)
	const openPushRef = useRef<(message: PushMessage) => void>(() => {})
	const openPush = (message: PushMessage) => {
		const data = message.data as PushData
		trackPushOpened(message.data)
		const resolved = resolvePushNavigation(data)
		if (!resolved) return
		const target: DeepLinkTarget = { name: resolved.screen, params: resolved.params }
		const settled = isAuthenticatedRef.current && !!navigation.getState()?.routes.some(route => route.name === ROUTES.MAIN_STACK)
		if (settled) {
			// El par ruta/params se resuelve en RUNTIME desde el payload, así que
			// no hay forma de casarlo con RootStackParamList en compilación
			const navigate = navigation.navigate as unknown as (screen: string, params?: Record<string, unknown>) => void
			if (target.params) { navigate(target.name, target.params) } else { navigate(target.name) }
			return
		}
		pendingPushRef.current = target
		// Con auth cargando (arranque en frío) se calla: la reconciliación abre
		// el destino si hay sesión y avisa si no la hay
		if (!isAuthenticatedRef.current && !authLoadingRef.current) toast.info(i18n.t('hooks.appNavigation.toasts.loginToOpenNotification'))
	}
	useLayoutEffect(() => { openPushRef.current = openPush })

	// La push que ARRANCÓ la app (cerrada): se consume una sola vez
	useEffect(() => {
		let cancelled = false
		takeInitialPush().then(message => { if (message && !cancelled) openPushRef.current(message) }).catch(() => {})
		return () => { cancelled = true }
	}, [])

	// Push listeners
	useEffect(() => {
		// Foreground notification: show as toast
		const onForeground = (message: PushMessage) => {
			const data = message.data as PushData
			const moneyIn = isMoneyInPush(data)
			// Play sound based on notification type
			if (sounds?.enabled) {
				if (sounds?.transactionSound && moneyIn) {
					// El refresco de la lista traerá la misma transacción: se marca
					// para que useIncomingMoneySound no vuelva a sonar por ella
					markIncomingSoundPlayed(pushTransactionUuid(data))
					playSound('money_in')
				} else if (!isMoneySoundPush(data)) {
					// El dinero que SALE ya sonó en la pantalla que lo mandó
					// (SendSuccess): su push no vuelve a sonar con la app delante
					playSound('notification')
				}
			}
			// Un cobro con la app delante: saldo e histórico al día sin esperar a
			// que el usuario tire de la pantalla (el recorte a página 1 deja el
			// refresco del histórico infinito en UNA petición)
			if (moneyIn) {
				queryClient.invalidateQueries({ queryKey: ['home'] })
				queryClient.setQueriesData({ queryKey: ['transactions'] }, trimToFirstPage)
				queryClient.invalidateQueries({ queryKey: ['transactions'] })
			}
			// Con la app delante la push NO va a la bandeja (ni en Android, donde
			// FCM no la pinta en primer plano, ni en iOS, donde QPPush no la
			// presenta): el toast es la presentación en primer plano, y una push
			// de dinero publicada sonaría OTRA VEZ con el sonido de su canal
			toast.info(message.title || 'QvaPay', { description: message.body || undefined })
			trackPushReceived(message.data)
		}

		// Notification tapped with the app alive (foreground or background)
		const onOpened = (message: PushMessage) => { openPushRef.current(message) }

		const unsubscribeForeground = subscribeForegroundPush(onForeground)
		const unsubscribeOpened = subscribeOpenedPush(onOpened)

		return () => {
			unsubscribeForeground()
			unsubscribeOpened()
		}
	}, [sounds?.enabled, sounds?.transactionSound])

	const dismissUpdate = () => setUpdateInfo(null)

	return {
		navigation,
		user,
		isAuthenticated,
		authLoading,
		settingsLoading,
		firstTime,
		splashReady,
		walletReady,
		hasWallet,
		updateInfo,
		dismissUpdate,
	}
}
