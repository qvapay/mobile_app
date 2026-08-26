import { View, Text, ScrollView, Platform, Alert } from 'react-native'
import React, { useState, useEffect, useCallback, useReducer } from 'react'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useTranslation } from 'react-i18next'
import { getDateLocale } from '../../../i18n'

// Lottie
import LottieView from 'lottie-react-native'

// Theme
import { useTheme } from '../../../theme/ThemeContext'
import { createTextStyles, createContainerStyles } from '../../../theme/themeUtils'

// User AuthContext
import { useAuth } from '../../../auth/AuthContext'

// UI Components
import GoldUpsell from './gold/GoldUpsell'

// Icons
import FontAwesome6 from '@react-native-vector-icons/fontawesome6'

// API
import { userApi } from '../../../api/userApi'

// Toast
import { toast } from 'sonner-native'

// IAP
import { useIAP } from 'react-native-iap'
import { IAP_SKUS, getProductId, getAndroidOfferToken, getIAPErrorMessage } from '../../../helpers/iap'

// Tipos
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import type { Purchase } from 'react-native-iap'
import type { GoldPlan, IapErrorLike } from '../../../helpers/iap'
import type { SettingsStackParamList } from '../../../types/navigation'

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

// Plans — label/period viven como claves de i18n (settings.goldCheck.plans.*)
// y las resuelve GoldUpsell en render por la clave de cada entrada
const plans: Record<GoldPlan, { value: number }> = {
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

const GoldCheck = ({ navigation: _navigation }: NativeStackScreenProps<SettingsStackParamList, 'GoldCheck'>) => {

	// Idioma activo
	const { t } = useTranslation()

	// User AuthContext
	const { user, updateUser } = useAuth()

	// Contexts
	const { theme } = useTheme()
	const textStyles = createTextStyles(theme)
	const containerStyles = createContainerStyles(theme)
	const insets = useSafeAreaInsets()

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
				const p = purchase as Purchase & { transactionReceipt?: string, purchaseToken?: string, id?: string }
				const receipt = Platform.OS === 'ios'
					? p.transactionReceipt
					: p.purchaseToken

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
					const { finishTransaction: finish } = require('react-native-iap')
					await finish({ purchase })
					setGoldCheckStatus(true)
					setGoldCheckExpire(payload!.golden_expire)
					updateUser({ ...user, gold_check: true, gold_expire: payload!.golden_expire })
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

	// Fetch gold status
	useEffect(() => {
		let cancelled = false
		const getGoldCheckStatus = async () => {
			setIsLoading(true)
			try {
				const result = await userApi.getGoldCheckStatus()
				if (cancelled) return
				if (result.success && result.data) {
					const status = result.data as GoldPayload
					setGoldCheckStatus(status.golden_check as boolean)
					setGoldCheckExpire(status.golden_expire)
				}
			} catch (error) { /* error fetching gold check status */ }
			finally { if (!cancelled) setIsLoading(false) }
		}
		getGoldCheckStatus()
		return () => { cancelled = true }
	}, [goldCheckStatus])

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
								setGoldCheckStatus(true)
								setGoldCheckExpire(purchased!.golden_expire)
								updateUser({ ...user, gold_check: true, gold_expire: purchased!.golden_expire })
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
			const latest = purchases[purchases.length - 1] as { transactionReceipt?: string, purchaseToken?: string, productId?: string, transactionId?: string, id?: string }
			const receipt = Platform.OS === 'ios'
				? latest.transactionReceipt
				: latest.purchaseToken

			const result = await userApi.validateGoldReceipt({
				receipt: receipt as string,
				platform: Platform.OS,
				productId: latest.productId as string,
				transactionId: (latest.transactionId || latest.id || latest.purchaseToken) as string,
			})

			// Los módulos de gold declaran `ApiResult<unknown>`: forma local del envelope.
			const payload = (result as { data?: unknown }).data as GoldPayload | undefined
			if (result.success && payload?.success) {
				setGoldCheckStatus(true)
				setGoldCheckExpire(payload!.golden_expire)
				updateUser({ ...user, gold_check: true, gold_expire: payload!.golden_expire })
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
	}, [user, updateUser, t])

	return (
		<ScrollView style={[containerStyles.container, { paddingHorizontal: theme.spacing.md }]}>

			<View style={containerStyles.scrollContainer}>

				{goldCheckStatus ? (
					<View style={containerStyles.center}>
						<FontAwesome6 name="crown" size={120} color={theme.colors.gold} iconStyle="solid" />
					</View>
				) : (
					<View style={containerStyles.center}>
						<LottieView source={require('../../../assets/lotties/gold.json')} autoPlay loop={false} style={{ width: 180, height: 180 }} />
					</View>
				)}

				<Text style={[textStyles.h1, { textAlign: 'center', marginBottom: theme.spacing.lg, lineHeight: 36 }]}>
					{goldCheckStatus ? t('settings.goldCheck.alreadyGold') : t('settings.goldCheck.unlockTitle')}
				</Text>

				{/* Gold Status Display */}
				{goldCheckStatus && (
					<View style={{
						backgroundColor: theme.colors.gold + '20',
						borderRadius: theme.borderRadius.lg,
						padding: theme.spacing.lg,
						marginBottom: theme.spacing.lg,
						borderWidth: 1,
						borderColor: theme.colors.gold + '40'
					}}>
						<View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}>
							<FontAwesome6 name="crown" size={18} color={theme.colors.gold} iconStyle="solid" style={{ marginRight: theme.spacing.sm }} />
							<Text style={[textStyles.h3, { textAlign: 'center', color: theme.colors.gold }]}>
								{t('settings.goldCheck.activeSubscription')}
							</Text>
						</View>

						{goldCheckExpire && (
							<Text style={[textStyles.text, { textAlign: 'center', color: theme.colors.primaryText }]}>
								{t('settings.goldCheck.expires', { date: new Date(goldCheckExpire).toLocaleDateString(getDateLocale()) })}
							</Text>
						)}
					</View>
				)}

				<GoldUpsell
					plans={plans}
					selectedPlan={selectedPlan}
					onSelectPlan={setSelectedPlan}
					subscriptions={subscriptions}
					connected={connected}
					busy={busy}
					isLoading={isLoading}
					onSubscribeBalance={handleSubscribe}
					onSubscribeIAP={handleSubscribeIAP}
					onRestore={handleRestore}
					insets={insets}
					theme={theme}
					textStyles={textStyles}
				/>
			</View>
		</ScrollView>
	)
}

export default GoldCheck