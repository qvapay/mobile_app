import React, { useState, useEffect } from 'react'
import { View, Text, ScrollView, Pressable, Image, Alert } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import LottieView from 'lottie-react-native'

// Theme
import { useTheme } from '../../../theme/ThemeContext'
import { createTextStyles, createContainerStyles } from '../../../theme/themeUtils'

// User AuthContext
import { useAuth } from '../../../auth/AuthContext'

// UI Components
import QPButton from '../../../ui/particles/QPButton'

// API
import { userApi } from '../../../api/userApi'

// Toast
import Toast from 'react-native-toast-message'

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

    // Handle Subscribe
    const handleSubscribe = async () => {

        if (!user?.uuid) {
            Toast.show({ type: 'error', text1: 'No se pudo obtener la información del usuario' })
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
                    style: 'cancel'
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
                                Toast.show({ type: 'success', text1: 'Suscripción exitosa' })
                            } else { Toast.show({ type: 'error', text1: result.error || 'No se pudo procesar la suscripción' }) }

                        } catch (error) {
                            // error purchasing gold
                            Toast.show({ type: 'error', text1: 'Ocurrió un error al procesar la suscripción' })
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

    return (
        <ScrollView style={[containerStyles.container, { paddingHorizontal: theme.spacing.md }]}>

            <View style={containerStyles.scrollContainer}>

                {goldCheckStatus ? (
                    <View style={containerStyles.center}>
                        <Image source={require('../../../assets/images/ui/gold-badge.png')} style={{ width: 180, height: 180 }} resizeMode="contain" />
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
                            <Image source={require('../../../assets/images/ui/gold-badge.png')} style={{ width: 20, height: 20, marginRight: theme.spacing.sm }} resizeMode="contain" />
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
                                    <Text style={[textStyles.caption, { color: theme.colors.buttonText, fontSize: 10, fontFamily: theme.typography.fontFamily.medium }]}>
                                        Más eficiente
                                    </Text>
                                </View>
                            )}

                            <Text style={[textStyles.h4, { textAlign: 'center', marginBottom: theme.spacing.sm, color: theme.colors.primaryText }]}>
                                {plan.label}
                            </Text>

                            <View style={containerStyles.center}>
                                <Text style={[textStyles.amount, { fontSize: 24, color: theme.colors.primaryText, marginBottom: 4 }]}>
                                    ${plan.value}
                                </Text>
                                <Text style={[textStyles.caption, { color: theme.colors.secondaryText, fontSize: 12 }]}>
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

                {/* Subscribe Button */}
                {!goldCheckStatus && (
                    <View style={containerStyles.bottomButtonContainer}>
                        <QPButton
                            title={isPurchasing ? "Procesando..." : "Suscribirme ahora"}
                            onPress={handleSubscribe}
                            disabled={isPurchasing || isLoading}
                            loading={isLoading}
                            style={{ backgroundColor: theme.colors.gold }}
                            loadingColor={theme.colors.almostBlack}
                        />
                    </View>
                )}

                {/* Disclaimer */}
                <Text style={[textStyles.caption, { textAlign: 'center', marginTop: theme.spacing.sm, marginBottom: insets.bottom + theme.spacing.sm, color: theme.colors.secondaryText, lineHeight: 18 }]}>
                    La suscripción se renueva automáticamente. Puedes cancelar en cualquier momento desde la configuración de tu cuenta.
                </Text>
            </View>
        </ScrollView>
    )
}

export default GoldCheck