/**
 * Toda la mecánica de la suscripción GOLD, fuera de la pantalla: estado de la
 * suscripción, banderas de compra, el puente con `react-native-iap` y las tres
 * vías de alta (saldo QvaPay, hoja nativa de la tienda y restaurar compras).
 *
 * Se extrajo de `GoldCheck.tsx` porque la pantalla era ~310 líneas de las que
 * ~215 eran este flujo: la vista se queda con la cabecera y `GoldUpsell`, y el
 * flujo de compra queda en un módulo que se puede leer (y testear) solo.
 *
 * Contrato de recibos (IDÉNTICO al de antes): solo un `success` del backend
 * cierra la transacción con `finishTransaction`; `pending`/202 (pago diferido
 * en efectivo o por operadora) NO se cierra — la tienda vuelve a notificar
 * cuando liquida.
 */

import { useState, useEffect, useCallback, useReducer, useRef } from 'react'
import { Platform, Alert } from 'react-native'
import { useTranslation } from 'react-i18next'
import { useQueryClient } from '@tanstack/react-query'

// User AuthContext
import { useAuth } from '../../../../auth/AuthContext'
import useProfileRefresh, { PROFILE_QUERY } from '../../../../hooks/useProfileRefresh'

// API
import { userApi } from '../../../../api/userApi'

// Toast
import { toast } from 'sonner-native'

// IAP
import { useIAP, getReceiptDataIOS } from 'react-native-iap'
import { IAP_SKUS, getProductId, getAndroidOfferToken, getIAPErrorMessage } from '../../../../helpers/iap'

// Tipos
import type { Purchase, ProductSubscription } from 'react-native-iap'
import type { GoldPlan, IapErrorLike } from '../../../../helpers/iap'
import type { User } from '../../../../types/domain'

/** Acción genérica de "setear un campo", compartida por los dos slices. */
type SetFieldAction = { type: 'set', field: string, value: unknown }

/** Estado de la suscripción GOLD. */
type GoldState = { goldCheckStatus: boolean, goldCheckExpire: string }

/** Banderas de compra en curso (saldo / IAP / restaurar). */
type BusyState = { isPurchasing: boolean, isPurchasingIAP: boolean, isRestoringPurchases: boolean }

/** Respuesta de `/user/gold` y `/user/gold/validate-receipt` (los módulos declaran `unknown`). */
type GoldPayload = {
	success?: boolean
	pending?: boolean
	error?: string
	golden_check?: boolean
	golden_expire?: string
}

/** Lo que la pantalla necesita para pintar cabecera y `GoldUpsell`. */
export type GoldSubscription = {
	selectedPlan: GoldPlan
	setSelectedPlan: (plan: GoldPlan) => void
	goldCheckStatus: boolean
	goldCheckExpire: string
	isLoading: boolean
	busy: BusyState
	connected: boolean
	subscriptions?: ProductSubscription[] | null
	handleSubscribe: () => void
	handleSubscribeIAP: () => void
	handleRestore: () => void
	/** Relee el estado de la suscripción (tirar para refrescar). */
	refreshStatus: () => Promise<void>
}

/**
 * El recibo que valida qpweb. En iOS es el de la app en base64, el que espera `verifyReceipt`:
 * `transactionReceipt` ya no existe en react-native-iap y `purchaseToken` es un JWS que ese
 * endpoint no acepta. Lee del dispositivo y lanza si el recibo no está.
 */
const storeReceiptFor = async (purchase: { purchaseToken?: string | null }) => (
	Platform.OS === 'ios' ? getReceiptDataIOS() : purchase.purchaseToken
)

// Plans — label/period viven como claves de i18n (settings.goldCheck.plans.*)
// y las resuelve GoldUpsell en render por la clave de cada entrada
export const plans: Record<GoldPlan, { value: number }> = {
	monthly: {
		value: 4.99
	},
	yearly: {
		value: 49.99
	}
}

// Gold subscription status + the various purchase loading flags
function setFieldReducer<S extends object>(state: S, action: SetFieldAction): S {
	switch (action.type) {
		case 'set':
			// La clave computada añade una firma de índice al spread: el cast la reduce a S.
			return { ...state, [action.field]: action.value } as S
		default:
			return state
	}
}

/**
 * Estado y acciones de la suscripción GOLD.
 *
 * @returns Estado de la suscripción, banderas de compra y los tres handlers.
 */
export default function useGoldSubscription(): GoldSubscription {

	// Idioma activo
	const { t } = useTranslation()

	// User AuthContext
	const { user, updateUser } = useAuth()

	// States
	const [selectedPlan, setSelectedPlan] = useState<GoldPlan>('monthly')
	const [isLoading, setIsLoading] = useState(false)

	// Gold status (same-named setters keep every call site unchanged)
	const [gold, dispatchGold] = useReducer(setFieldReducer<GoldState>, { goldCheckStatus: false, goldCheckExpire: '2025-09-08' })
	const { goldCheckStatus, goldCheckExpire } = gold
	const setGoldCheckStatus = (value: boolean) => dispatchGold({ type: 'set', field: 'goldCheckStatus', value })
	const setGoldCheckExpire = (value?: string) => dispatchGold({ type: 'set', field: 'goldCheckExpire', value })

	// Purchase loading flags (balance / IAP / restore) — passed to GoldUpsell as one `busy` object
	const [busy, dispatchBusy] = useReducer(setFieldReducer<BusyState>, { isPurchasing: false, isPurchasingIAP: false, isRestoringPurchases: false })
	const setIsPurchasing = (value: boolean) => dispatchBusy({ type: 'set', field: 'isPurchasing', value })
	const setIsPurchasingIAP = (value: boolean) => dispatchBusy({ type: 'set', field: 'isPurchasingIAP', value })
	const setIsRestoringPurchases = (value: boolean) => dispatchBusy({ type: 'set', field: 'isRestoringPurchases', value })

	// Compra confirmada. El resto de la app lee `golden_check` del AuthContext; el perfil se
	// relee además por lo demás que cambió con el cobro, como el saldo si se pagó con él
	const queryClient = useQueryClient()
	const refreshProfile = useProfileRefresh()
	const activateGold = useCallback(async (expire?: string) => {
		dispatchGold({ type: 'set', field: 'goldCheckStatus', value: true })
		dispatchGold({ type: 'set', field: 'goldCheckExpire', value: expire })
		// Una lectura del perfil ya en vuelo puede ser de antes de que el servidor activara GOLD.
		// La caché va primero: al cancelar la lectura, quien la esperaba recibe lo que haya en ella
		queryClient.setQueryData<User>(PROFILE_QUERY.queryKey, cached => cached && { ...cached, golden_check: true, golden_expire: expire })
		await queryClient.cancelQueries({ queryKey: PROFILE_QUERY.queryKey })
		// Primero se guarda: updateUser aplica su copia del usuario al terminar, y pisaría el perfil releído
		await updateUser({ golden_check: true, golden_expire: expire })
		refreshProfile()
	}, [queryClient, updateUser, refreshProfile])

	// IAP hook with callbacks
	const {
		connected,
		subscriptions,
		fetchProducts,
		requestPurchase,
	} = useIAP({
		onPurchaseSuccess: async (purchase) => {
			try {
				// `Purchase` es una unión iOS/Android: los campos por plataforma solo
				// existen en su rama, así que se leen por una forma local.
				const p = purchase as Purchase & { purchaseToken?: string, id?: string }
				const receipt = await storeReceiptFor(p)

				if (!receipt) return

				const result = await userApi.validateGoldReceipt({
					receipt,
					platform: Platform.OS,
					// Android's orderId (transactionId) is absent on free trials / intro offers — fall back
					// to the always-present purchase id / token so the backend never rejects for a missing id.
					productId: p.productId,
					transactionId: (p.transactionId || p.id || p.purchaseToken) as string,
				})

				// Los módulos de gold declaran `ApiResult<unknown>`: forma local del envelope.
				const payload = (result as { data?: unknown }).data as GoldPayload | undefined
				if (result.success && payload?.success) {
					activateGold(payload!.golden_expire)
					const { finishTransaction: finish } = require('react-native-iap')
					// El servidor ya activó GOLD: un fallo al cerrarla en la tienda no es un fallo de la compra
					try { await finish({ purchase }) } catch (error) { console.warn('[gold] finishTransaction failed', (error as { code?: string })?.code) }
					toast.success(t('settings.goldCheck.toasts.activated'))
				} else if (payload?.pending || result.status === 202) {
					// Deferred payment (cash/carrier) not yet settled — do NOT finish; the store re-notifies on settle.
					toast.info(t('settings.goldCheck.toasts.paymentPendingActivation'))
				} else {
					toast.error((result as { error?: string }).error || payload?.error || t('settings.goldCheck.toasts.validateFailed'))
				}
			} catch (error) {
				toast.error(t('settings.goldCheck.toasts.validateError'))
			} finally {
				setIsPurchasingIAP(false)
			}
		},
		onPurchaseError: (error) => {
			setIsPurchasingIAP(false)
			const message = getIAPErrorMessage(error as IapErrorLike)
			if (message) toast.error(message)
		},
	})

	// Estado de la suscripción. Lo que cambie fuera (una compra en la web) llega al releer
	const mountedRef = useRef(true)
	useEffect(() => () => { mountedRef.current = false }, [])
	const refreshStatus = useCallback(async () => {
		try {
			const result = await userApi.getGoldCheckStatus()
			if (!mountedRef.current) return
			if (result.success && result.data) {
				const status = result.data as GoldPayload
				setGoldCheckStatus(status.golden_check as boolean)
				setGoldCheckExpire(status.golden_expire)
			}
		} catch (error) { /* error fetching gold check status */ }
	}, [])

	// Fetch gold status
	useEffect(() => {
		setIsLoading(true)
		refreshStatus().finally(() => { if (mountedRef.current) setIsLoading(false) })
	}, [goldCheckStatus, refreshStatus])

	// Fetch IAP subscription products when connected
	useEffect(() => {
		if (connected && IAP_SKUS?.length) {
			fetchProducts({ skus: IAP_SKUS, type: 'subs' })
		}
	}, [connected, fetchProducts])

	// Handle Subscribe with QvaPay balance (existing flow)
	const handleSubscribe = async () => {

		if (!user?.uuid) {
			toast.error(t('settings.goldCheck.toasts.noUserInfo'))
			return
		}

		const duration = selectedPlan === 'yearly' ? 12 : 1
		const plan = plans[selectedPlan]
		const durationText = selectedPlan === 'yearly' ? t('settings.goldCheck.duration.yearly') : t('settings.goldCheck.duration.monthly')

		setIsLoading(true)

		Alert.alert(
			t('settings.goldCheck.alerts.confirmTitle'),
			t('settings.goldCheck.alerts.confirmBody', { username: user.username || user.email, duration: durationText }),
			[
				{
					text: t('common.actions.cancel'),
					style: 'cancel',
					onPress: () => setIsLoading(false)
				},
				{
					text: t('settings.goldCheck.alerts.payButton', { amount: plan.value }),
					style: 'destructive',
					onPress: async () => {

						setIsPurchasing(true)

						try {
							// OJO: `GoldPurchaseInput` declara `duration: string` pero aquí viaja un
							// NUMBER (1 | 12) — el backend lo acepta; se manda tal cual.
							const result = await userApi.purchaseGold({
								uuid: user.uuid as string,
								duration: duration as unknown as string
							})

							if (result.success) {
								const purchased = result.data as GoldPayload | undefined
								activateGold(purchased!.golden_expire)
								toast.success(t('settings.goldCheck.toasts.subscribed'))
							} else { toast.error(result.error || t('settings.goldCheck.toasts.subscribeFailed')) }

						} catch (error) {
							toast.error(t('settings.goldCheck.toasts.subscribeError'))
						}
						finally {
							setIsPurchasing(false)
							setIsLoading(false)
						}
					}
				}
			]
		)
	}

	// Handle Subscribe with IAP (native payment sheet)
	const handleSubscribeIAP = useCallback(async () => {
		const productId = getProductId(selectedPlan)
		const offerToken = getAndroidOfferToken(selectedPlan, subscriptions)

		setIsPurchasingIAP(true)

		try {
			// Bind the purchase to the QvaPay user so RTDN events can map back to the right account
			// when the IAPTransaction row doesn't exist yet (race between client validate and Google's webhook).
			const accountId = user?.uuid
			const purchaseRequest = {
				type: 'subs',
				request: Platform.OS === 'ios'
					? { apple: { sku: productId, ...(accountId && { appAccountToken: accountId }) } }
					: {
						google: {
							skus: [productId],
							...(accountId && { obfuscatedAccountId: accountId }),
							...(offerToken && {
								subscriptionOffers: [{ sku: productId, offerToken }],
							}),
						},
					},
			}
			await requestPurchase(purchaseRequest as Parameters<typeof requestPurchase>[0])
		} catch (error) {
			setIsPurchasingIAP(false)
			const message = getIAPErrorMessage(error as IapErrorLike)
			if (message) toast.error(message)
		}
	}, [selectedPlan, subscriptions, requestPurchase, user?.uuid])

	// Handle Restore Purchases
	const handleRestore = useCallback(async () => {
		setIsRestoringPurchases(true)
		try {
			// getAvailablePurchases from the hook updates internal state and returns void
			// We need to use the top-level function for a direct result
			const { getAvailablePurchases: getAvailablePurchasesDirect } = require('react-native-iap')
			const purchases = await getAvailablePurchasesDirect()
			if (!purchases?.length) {
				toast.info(t('settings.goldCheck.toasts.noPreviousPurchases'))
				return
			}

			// Send the most recent purchase to backend for validation
			// getAvailablePurchases llega por require() sin tipos: forma local.
			const latest = purchases[purchases.length - 1] as { purchaseToken?: string, productId?: string, transactionId?: string, id?: string }
			const receipt = await storeReceiptFor(latest)

			const result = await userApi.validateGoldReceipt({
				receipt: receipt as string,
				platform: Platform.OS,
				productId: latest.productId as string,
				transactionId: (latest.transactionId || latest.id || latest.purchaseToken) as string,
			})

			// Los módulos de gold declaran `ApiResult<unknown>`: forma local del envelope.
			const payload = (result as { data?: unknown }).data as GoldPayload | undefined
			if (result.success && payload?.success) {
				activateGold(payload!.golden_expire)
				toast.success(t('settings.goldCheck.toasts.restored'))
			} else if (payload?.pending || result.status === 202) {
				toast.info(t('settings.goldCheck.toasts.paymentPending'))
			} else {
				toast.error((result as { error?: string }).error || payload?.error || t('settings.goldCheck.toasts.restoreFailed'))
			}
		} catch (error) {
			toast.error(t('settings.goldCheck.toasts.restoreError'))
		} finally {
			setIsRestoringPurchases(false)
		}
	}, [activateGold, t])

	return {
		selectedPlan,
		setSelectedPlan,
		goldCheckStatus,
		goldCheckExpire,
		isLoading,
		busy,
		connected,
		subscriptions,
		handleSubscribe,
		handleSubscribeIAP,
		handleRestore,
		refreshStatus,
	}
}
