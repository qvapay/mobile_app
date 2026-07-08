// Centralizes the app-root navigation side effects: splash timing, store-update
// prompt, auth → navigation reconciliation, deep-link capture and OneSignal
// listeners. Extracted from AppNavigator so the component itself only declares
// routes (see App.tsx).
import { useEffect, useState } from 'react'
import { Linking } from 'react-native'
import { useNavigation } from '@react-navigation/native'
import { OneSignal } from 'react-native-onesignal'
import { toast } from 'sonner-native'

import { useAuth } from '../auth/AuthContext'
import { useSettings } from '../settings/SettingsContext'
import { ROUTES } from '../routes'
import playSound from '../helpers/playSound'
import { maybePromptUpdate } from '../helpers/versionCheck'

/**
 * Parses the P2P offer UUID out of a deep link URL.
 * Matches both https paths and the qvapay:// custom scheme.
 * @param {string} url - e.g. https://qvapay.com/p2p/<uuid> or qvapay://p2p/<uuid>
 * @returns {string|null} The UUID, or null when the URL is not a P2P link.
 */
const parseP2PUuid = (url) => {
	const match = url.match(/\/p2p\/([^/?#]+)/)
	if (match) return match[1]
	const schemeMatch = url.match(/qvapay:\/\/p2p\/([^/?#]+)/)
	if (schemeMatch) return schemeMatch[1]
	return null
}

/**
 * Parses the merchant-invoice UUID out of a Pay deep link URL.
 * @param {string} url - e.g. https://qvapay.com/pay/<uuid> or qvapay://pay/<uuid>
 * @returns {string|null} The UUID, or null when the URL is not a Pay link.
 */
const parsePayUuid = (url) => {
	const match = url.match(/\/pay\/([^/?#]+)/)
	if (match) return match[1]
	const schemeMatch = url.match(/qvapay:\/\/pay\/([^/?#]+)/)
	if (schemeMatch) return schemeMatch[1]
	return null
}

/**
 * Drives the app-root navigation flow: minimum 2s splash, store-update check
 * (helpers/versionCheck → UpdatePromptModal), auth ↔ navigation reconciliation,
 * deep-link capture while unauthenticated, and OneSignal foreground/click
 * listeners (toast + optional sound; tap navigates to the right screen).
 *
 * Deep links (/pay/:uuid, /p2p/:p2p_uuid) that arrive while logged out are
 * stashed in `pendingDeepLinkRef` with a Spanish "log in first" toast; once
 * authenticated the stack is reset to MainStack + the target screen, so back
 * lands on Home instead of exiting.
 *
 * @param {{ current: string|null }} pendingDeepLinkRef - App-root ref holding a deep link URL captured pre-auth.
 * @returns {object} State AppNavigator needs to render the splash gate, the
 *   initial route and the update modal: `{ navigation, user, isAuthenticated,
 *   authLoading, settingsLoading, firstTime, splashReady, updateInfo, dismissUpdate }`.
 */
export function useAppNavigation(pendingDeepLinkRef) {
	const navigation = useNavigation()
	const { user, isAuthenticated, isLoading: authLoading } = useAuth()
	const { appearance, sounds, isLoading: settingsLoading } = useSettings()
	const firstTime = appearance.firstTime

	// State to control minimum splash screen time
	const [splashReady, setSplashReady] = useState(false)

	// Update prompt state
	const [updateInfo, setUpdateInfo] = useState(
		/** @type {{ needsUpdate: boolean; currentVersion?: string; latestVersion?: string; storeUrl?: string } | null} */ (null),
	)

	useEffect(() => {
		const timer = setTimeout(() => {
			setSplashReady(true)
		}, 2000)
		return () => clearTimeout(timer)
	}, [])

	// Check for store update on app launch
	useEffect(() => {
		(async () => {
			const info = await maybePromptUpdate()
			if (info?.needsUpdate) setUpdateInfo(info)
		})()
	}, [])

	// Navigation handler for auth state changes.
	// Reconciles the navigation tree with auth state, which can flip from many
	// sources outside this tree (login screen, logout, background token expiry,
	// app launch) — so this is a genuine reactive effect, not a faked handler.
	useEffect(() => {
		if (splashReady && !authLoading && !settingsLoading) {
			const currentRoute = navigation.getState()?.routes[navigation.getState()?.index || 0]?.name
			if (isAuthenticated && !firstTime && currentRoute !== ROUTES.MAIN_STACK) {
				// Check for a pending deep link after login
				const pendingUrl = pendingDeepLinkRef.current
				if (pendingUrl) {
					pendingDeepLinkRef.current = null
					const payUuid = parsePayUuid(pendingUrl)
					if (payUuid) {
						navigation.reset({
							index: 1,
							routes: [
								{ name: ROUTES.MAIN_STACK },
								{ name: ROUTES.PAY_SCREEN, params: { uuid: payUuid } },
							],
						})
						return
					}
					const p2pUuid = parseP2PUuid(pendingUrl)
					if (p2pUuid) {
						navigation.reset({
							index: 1,
							routes: [
								{ name: ROUTES.MAIN_STACK },
								{ name: ROUTES.P2P_OFFER_SCREEN, params: { p2p_uuid: p2pUuid } },
							],
						})
						return
					}
				}
				navigation.reset({ index: 0, routes: [{ name: ROUTES.MAIN_STACK }] })
			} else if (!isAuthenticated && !firstTime && currentRoute !== ROUTES.WELCOME_SCREEN) {
				// Capture the current deep link URL before resetting to Welcome
				Linking.getInitialURL().then((url) => {
					if (!url) return
					if (parsePayUuid(url)) {
						pendingDeepLinkRef.current = url
						toast.info('Inicia sesión para pagar la factura')
					} else if (parseP2PUuid(url)) {
						pendingDeepLinkRef.current = url
						toast.info('Inicia sesión para ver la oferta P2P')
					}
				})
				navigation.reset({ index: 0, routes: [{ name: ROUTES.WELCOME_SCREEN }] })
			}
		}
	}, [splashReady, authLoading, settingsLoading, isAuthenticated, firstTime, navigation, pendingDeepLinkRef])

	// Listen for foreground deep links while unauthenticated
	useEffect(() => {
		const subscription = Linking.addEventListener('url', ({ url }) => {
			if (!isAuthenticated && url) {
				if (parsePayUuid(url)) {
					pendingDeepLinkRef.current = url
					toast.info('Inicia sesión para pagar la factura')
				} else if (parseP2PUuid(url)) {
					pendingDeepLinkRef.current = url
					toast.info('Inicia sesión para ver la oferta P2P')
				}
			}
		})
		return () => subscription.remove()
	}, [isAuthenticated, pendingDeepLinkRef])

	// OneSignal notification listeners
	useEffect(() => {
		// Foreground notification: show as toast
		const onForeground = (event) => {
			event.preventDefault()
			const notification = event.getNotification()
			const data = notification.additionalData
			// Play sound based on notification type
			if (sounds?.enabled) {
				if (sounds?.transactionSound && (data?.type === 'transaction' || data?.type === 'transfer')) {
					playSound('money_in')
				} else {
					playSound('notification')
				}
			}
			toast.info(notification.title || 'QvaPay', { description: notification.body || undefined })
			notification.display()
		}

		// Notification tapped: navigate to the right screen
		const onClicked = (event) => {
			const data = event.notification?.additionalData
			if (!data?.type || !isAuthenticated) return

			if (data.type === 'transaction' && data.uuid) {
				navigation.navigate(ROUTES.TRANSACTION, { uuid: data.uuid })
			} else if (data.type === 'p2p' && data.uuid) {
				navigation.navigate(ROUTES.P2P_OFFER_SCREEN, { p2p_uuid: data.uuid })
			} else if (data.type === 'transfer') {
				navigation.navigate(ROUTES.TRANSACTIONS)
			}
		}

		OneSignal.Notifications.addEventListener('foregroundWillDisplay', onForeground)
		OneSignal.Notifications.addEventListener('click', onClicked)

		return () => {
			OneSignal.Notifications.removeEventListener('foregroundWillDisplay', onForeground)
			OneSignal.Notifications.removeEventListener('click', onClicked)
		}
	}, [isAuthenticated, sounds?.enabled, sounds?.transactionSound, navigation])

	const dismissUpdate = () => setUpdateInfo(null)

	return {
		navigation,
		user,
		isAuthenticated,
		authLoading,
		settingsLoading,
		firstTime,
		splashReady,
		updateInfo,
		dismissUpdate,
	}
}
