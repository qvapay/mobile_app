import React, { useState, useEffect, useCallback } from 'react'
import { View, Text, ScrollView, Pressable, Image, Alert, Platform, ActivityIndicator } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import LottieView from 'lottie-react-native'

// Theme
import { useTheme } from '../../../theme/ThemeContext'
import { createTextStyles, createContainerStyles } from '../../../theme/themeUtils'

// User AuthContext
import { useAuth } from '../../../auth/AuthContext'

// UI Components
import QPButton from '../../../ui/particles/QPButton'

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

// Benefits
const benefits = [
    'Check dorado en tu perfil',
    'Mejor tasa de interés en tu saldo',
    'Más operaciones simultáneas en el P2P',
    `Subdominio exclusivo (xxx.qvapay.com)`,
    'Acceso anticipado a ofertas P2P',
	'0% de comisión en P2P',
    'Acceso anticipado a funciones nuevas',
    'Cashback en compras de recargas',
    'Soporte prioritario'
]

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
    const [goldCheckStatus, setGoldCheckStatus] = useState(false)
    const [goldCheckExpire, setGoldCheckExpire] = useState('2025-09-08')
    const [isLoading, setIsLoading] = useState(false)
    const [isPurchasing, setIsPurchasing] = useState(false)
    const [isPurchasingIAP, setIsPurchasingIAP] = useState(false)
    const [isRestoringPurchases, setIsRestoringPurchases] = useState(false)

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
                    productId: purchase.productId,
                    transactionId: purchase.transactionId,
                })

                if (result.success) {
                    const { finishTransaction: finish } = require('react-native-iap')
                    await finish({ purchase })
                    setGoldCheckStatus(true)
                    setGoldCheckExpire(result.data.golden_expire)
                    updateUser({ ...user, gold_check: true, gold_expire: result.data.golden_expire })
                    toast.success('Suscripción Gold activada')
                } else {
                    toast.error(result.error || 'No se pudo validar la compra')
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
            const purchaseRequest = {
                type: 'subs',
                request: Platform.OS === 'ios'
                    ? { apple: { sku: productId } }
                    : {
                        google: {
                            skus: [productId],
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
    }, [selectedPlan, subscriptions, requestPurchase])

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
                transactionId: latest.transactionId,
            })

            if (result.success) {
                setGoldCheckStatus(true)
                setGoldCheckExpire(result.data.golden_expire)
                updateUser({ ...user, gold_check: true, gold_expire: result.data.golden_expire })
                toast.success('Suscripción restaurada')
            } else {
                toast.error(result.error || 'No se pudo restaurar la suscripción')
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

                {/* Subscription Plans */}
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: theme.spacing.xl, gap: theme.spacing.md }}>
                    {Object.entries(plans).map(([key, plan]) => (
                        <Pressable
                            key={key}
                            style={[
                                {
                                    flex: 1,
                                    backgroundColor: theme.colors.surface,
                                    borderRadius: theme.borderRadius.lg,
                                    padding: theme.spacing.lg,
                                    borderWidth: 2,
                                    borderColor: selectedPlan === key ? theme.colors.primary : theme.colors.border,
                                    position: 'relative'
                                },
                                selectedPlan === key && {
                                    borderColor: theme.colors.primary,
                                    shadowColor: theme.colors.primary,
                                    shadowOffset: { width: 0, height: 0 },
                                    shadowOpacity: 0.3,
                                    shadowRadius: 8,
                                    elevation: 8
                                }
                            ]}
                            onPress={() => setSelectedPlan(key)}
                        >
                            {key === 'yearly' && (
                                <View style={{ position: 'absolute', top: -8, right: 8, backgroundColor: theme.colors.primary, paddingHorizontal: theme.spacing.sm, paddingVertical: 4, borderRadius: theme.borderRadius.sm }}>
                                    <Text style={[textStyles.caption, { color: theme.colors.buttonText, fontSize: theme.typography.fontSize.xs, fontFamily: theme.typography.fontFamily.medium }]}>
                                        Más eficiente
                                    </Text>
                                </View>
                            )}

                            <Text style={[textStyles.h4, { textAlign: 'center', marginBottom: theme.spacing.sm, color: theme.colors.primaryText }]}>
                                {plan.label}
                            </Text>

                            <View style={containerStyles.center}>
                                <Text style={[textStyles.amount, { fontSize: theme.typography.fontSize.xxl, color: theme.colors.primaryText, marginBottom: 4 }]}>
                                    ${plan.value}
                                </Text>
                                <Text style={[textStyles.caption, { color: theme.colors.secondaryText, fontSize: theme.typography.fontSize.xs }]}>
                                    {plan.period}
                                </Text>
                            </View>
                        </Pressable>
                    ))}
                </View>

                {/* Benefits Section */}
                <View style={{ marginBottom: theme.spacing.xl }}>
                    <Text style={[textStyles.h3, { marginBottom: theme.spacing.lg, color: theme.colors.primaryText }]}>
                        Beneficios GOLD:
                    </Text>

                    {benefits.map((benefit, index) => (
                        <View key={index} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: theme.spacing.md, paddingLeft: theme.spacing.sm }}>
                            <Image source={require('../../../assets/images/ui/qvapay-logo-gold.png')} style={{ width: 20, height: 20, marginRight: theme.spacing.md }} resizeMode="contain" />
                            <Text style={[textStyles.text, { flex: 1, color: theme.colors.primaryText, lineHeight: 22 }]}>
                                {benefit}
                            </Text>
                        </View>
                    ))}
                </View>

                {/* Subscribe Buttons */}
                <View style={{ gap: theme.spacing.md }}>
                        {/* Pay with QvaPay balance */}
                        <QPButton
                            title={isPurchasing ? "Procesando..." : `Pagar con saldo QvaPay $${plans[selectedPlan].value}`}
                            onPress={handleSubscribe}
                            disabled={isPurchasing || isLoading || isPurchasingIAP}
                            loading={isPurchasing}
                        />

                        {/* Pay with App Store / Play Store */}
                        {subscriptions?.length > 0 ? (
                            <QPButton
                                icon={Platform.OS === 'ios' ? 'apple' : 'google-play'}
                                iconStyle="brand"
                                iconColor={theme.colors.primaryText}
                                title={isPurchasingIAP
                                    ? "Procesando..."
                                    : `Pagar con ${Platform.OS === 'ios' ? 'App Store' : 'Play Store'}${(() => {
                                        const productId = getProductId(selectedPlan)
                                        const sub = subscriptions.find(s => s.productId === productId)
                                        if (Platform.OS === 'ios') {
                                            return sub?.localizedPrice ? ` ${sub.localizedPrice}` : ''
                                        }
                                        const offerToken = getAndroidOfferToken(selectedPlan, subscriptions)
                                        const offer = sub?.subscriptionOfferDetails?.find(o => o.offerToken === offerToken)
                                        const price = offer?.pricingPhases?.pricingPhaseList?.[0]?.formattedPrice
                                        return price ? ` ${price}` : ''
                                    })()}`
                                }
                                onPress={handleSubscribeIAP}
                                disabled={isPurchasingIAP || isPurchasing || isLoading}
                                loading={isPurchasingIAP}
                                style={{ backgroundColor: 'transparent', borderWidth: 1.5, borderColor: theme.colors.border }}
                                textStyle={{ color: theme.colors.primaryText }}
                            />
                        ) : connected ? (
                            <View style={{ alignItems: 'center', paddingVertical: theme.spacing.sm }}>
                                <ActivityIndicator size="small" color={theme.colors.secondaryText} />
                                <Text style={[textStyles.caption, { color: theme.colors.secondaryText, marginTop: 4 }]}>
                                    Cargando precios de la tienda...
                                </Text>
                            </View>
                        ) : null}

                        {/* Restore Purchases */}
                        <Pressable onPress={handleRestore} disabled={isRestoringPurchases} style={{ alignItems: 'center', paddingVertical: theme.spacing.sm }}>
                            <Text style={[textStyles.text, { color: theme.colors.primary, fontSize: theme.typography.fontSize.sm }]}>
                                {isRestoringPurchases ? 'Restaurando...' : 'Restaurar compras'}
                            </Text>
                        </Pressable>
                    </View>

                {/* Disclaimer */}
                <Text style={[textStyles.caption, { textAlign: 'center', marginTop: theme.spacing.sm, marginBottom: insets.bottom + theme.spacing.sm, color: theme.colors.secondaryText, lineHeight: 18 }]}>
                    La suscripción se renueva automáticamente. Puedes cancelar en cualquier momento desde la configuración de tu cuenta.
                </Text>
            </View>
        </ScrollView>
    )
}

export default GoldCheck