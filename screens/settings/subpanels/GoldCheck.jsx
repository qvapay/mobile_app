import React, { useState, useEffect, useCallback, useReducer } from 'react'
import { View, Text, ScrollView, Platform, Alert } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
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

// Plans
const plans = {
    monthly: {
        value: 4.99,
        period: '/mes',
        label: 'Mensual'
    },
    yearly: {
        value: 49.99,
        period: '/año',
        label: 'Anual'
    }
}

// Gold subscription status + the various purchase loading flags
function setFieldReducer(state, action) {
    switch (action.type) {
        case 'set':
            return { ...state, [action.field]: action.value }
        default:
            return state
    }
}

const GoldCheck = ({ navigation }) => {

    // User AuthContext
    const { user, updateUser } = useAuth()

    // Contexts
    const { theme } = useTheme()
    const textStyles = createTextStyles(theme)
    const containerStyles = createContainerStyles(theme)
    const insets = useSafeAreaInsets()

    // States
    const [selectedPlan, setSelectedPlan] = useState('monthly')
    const [isLoading, setIsLoading] = useState(false)

    // Gold status (same-named setters keep every call site unchanged)
    const [gold, dispatchGold] = useReducer(setFieldReducer, { goldCheckStatus: false, goldCheckExpire: '2025-09-08' })
    const { goldCheckStatus, goldCheckExpire } = gold
    const setGoldCheckStatus = (value) => dispatchGold({ type: 'set', field: 'goldCheckStatus', value })
    const setGoldCheckExpire = (value) => dispatchGold({ type: 'set', field: 'goldCheckExpire', value })

    // Purchase loading flags (balance / IAP / restore) — passed to GoldUpsell as one `busy` object
    const [busy, dispatchBusy] = useReducer(setFieldReducer, { isPurchasing: false, isPurchasingIAP: false, isRestoringPurchases: false })
    const setIsPurchasing = (value) => dispatchBusy({ type: 'set', field: 'isPurchasing', value })
    const setIsPurchasingIAP = (value) => dispatchBusy({ type: 'set', field: 'isPurchasingIAP', value })
    const setIsRestoringPurchases = (value) => dispatchBusy({ type: 'set', field: 'isRestoringPurchases', value })

    // IAP hook with callbacks
    const {
        connected,
        subscriptions,
        fetchProducts,
        requestPurchase,
    } = useIAP({
        onPurchaseSuccess: async (purchase) => {
            try {
                const receipt = Platform.OS === 'ios'
                    ? purchase.transactionReceipt
                    : purchase.purchaseToken

                if (!receipt) return

                const result = await userApi.validateGoldReceipt({
                    receipt,
                    platform: Platform.OS,
                    // Android's orderId (transactionId) is absent on free trials / intro offers — fall back
                    // to the always-present purchase id / token so the backend never rejects for a missing id.
                    productId: purchase.productId,
                    transactionId: purchase.transactionId || purchase.id || purchase.purchaseToken,
                })

                if (result.success && result.data?.success) {
                    const { finishTransaction: finish } = require('react-native-iap')
                    await finish({ purchase })
                    setGoldCheckStatus(true)
                    setGoldCheckExpire(result.data.golden_expire)
                    updateUser({ ...user, gold_check: true, gold_expire: result.data.golden_expire })
                    toast.success('Suscripción Gold activada')
                } else if (result.data?.pending || result.status === 202) {
                    // Deferred payment (cash/carrier) not yet settled — do NOT finish; the store re-notifies on settle.
                    toast.info('Tu pago está pendiente de confirmación. Tu Gold se activará al completarse.')
                } else {
                    toast.error(result.error || result.data?.error || 'No se pudo validar la compra')
                }
            } catch (error) {
                toast.error('Error al validar la compra')
            } finally {
                setIsPurchasingIAP(false)
            }
        },
        onPurchaseError: (error) => {
            setIsPurchasingIAP(false)
            const message = getIAPErrorMessage(error)
            if (message) toast.error(message)
        },
    })

    // Fetch gold status
    useEffect(() => {
        const getGoldCheckStatus = async () => {
            setIsLoading(true)
            try {
                const result = await userApi.getGoldCheckStatus()
                if (result.success && result.data) {
                    setGoldCheckStatus(result.data.golden_check)
                    setGoldCheckExpire(result.data.golden_expire)
                }
            } catch (error) { /* error fetching gold check status */ }
            finally { setIsLoading(false) }
        }
        getGoldCheckStatus()
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
            toast.error('No se pudo obtener la información del usuario')
            return
        }

        const duration = selectedPlan === 'yearly' ? 12 : 1
        const plan = plans[selectedPlan]
        const durationText = selectedPlan === 'yearly' ? '12 meses' : '1 mes'

        setIsLoading(true)

        Alert.alert(
            'Confirmar Suscripción Gold',
            `¿Estás seguro de que quieres suscribirte a QvaPay Gold?\n\nUsuario: @${user.username || user.email}\nDuración: ${durationText}\n`,
            [
                {
                    text: 'Cancelar',
                    style: 'cancel',
                    onPress: () => setIsLoading(false)
                },
                {
                    text: `Pagar $${plan.value}`,
                    style: 'destructive',
                    onPress: async () => {

                        setIsPurchasing(true)

                        try {
                            const result = await userApi.purchaseGold({
                                uuid: user.uuid,
                                duration: duration
                            })

                            if (result.success) {
                                setGoldCheckStatus(true)
                                setGoldCheckExpire(result.data.golden_expire)
                                updateUser({ ...user, gold_check: true, gold_expire: result.data.golden_expire })
                                toast.success('Suscripción exitosa')
                            } else { toast.error(result.error || 'No se pudo procesar la suscripción') }

                        } catch (error) {
                            toast.error('Ocurrió un error al procesar la suscripción')
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
            await requestPurchase(purchaseRequest)
        } catch (error) {
            setIsPurchasingIAP(false)
            const message = getIAPErrorMessage(error)
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
                toast.info('No se encontraron compras anteriores')
                return
            }

            // Send the most recent purchase to backend for validation
            const latest = purchases[purchases.length - 1]
            const receipt = Platform.OS === 'ios'
                ? latest.transactionReceipt
                : latest.purchaseToken

            const result = await userApi.validateGoldReceipt({
                receipt,
                platform: Platform.OS,
                productId: latest.productId,
                transactionId: latest.transactionId || latest.id || latest.purchaseToken,
            })

            if (result.success && result.data?.success) {
                setGoldCheckStatus(true)
                setGoldCheckExpire(result.data.golden_expire)
                updateUser({ ...user, gold_check: true, gold_expire: result.data.golden_expire })
                toast.success('Suscripción restaurada')
            } else if (result.data?.pending || result.status === 202) {
                toast.info('Tu pago está pendiente de confirmación.')
            } else {
                toast.error(result.error || result.data?.error || 'No se pudo restaurar la suscripción')
            }
        } catch (error) {
            toast.error('Error al restaurar compras')
        } finally {
            setIsRestoringPurchases(false)
        }
    }, [user, updateUser])

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
                    {goldCheckStatus ? '¡Ya eres Gold!' : 'Desbloquea todo el poder de QvaPay'}
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
                                Suscripción Activa
                            </Text>
                        </View>

                        {goldCheckExpire && (
                            <Text style={[textStyles.text, { textAlign: 'center', color: theme.colors.primaryText }]}>
                                Vence: {new Date(goldCheckExpire).toLocaleDateString()}
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