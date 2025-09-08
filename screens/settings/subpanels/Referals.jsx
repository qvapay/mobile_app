import { useState, useEffect } from 'react'
import { StyleSheet, Text, View, ScrollView, Share, RefreshControl } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

// Theme Context
import { useTheme } from '../../../theme/ThemeContext'
import { createTextStyles, createContainerStyles } from '../../../theme/themeUtils'

// Auth Context
import { useAuth } from '../../../auth/AuthContext'

// API
import { userApi } from '../../../api/userApi'

// UI Components
import QPButton from '../../../ui/particles/QPButton'
import QPLoader from '../../../ui/particles/QPLoader'
import QPBalance from '../../../ui/particles/QPBalance'
import ProfileContainerHorizontal from '../../../ui/ProfileContainerHorizontal'

// Icons
import FontAwesome6 from '@react-native-vector-icons/fontawesome6'

// Toast
import Toast from 'react-native-toast-message'

// Helpers
import { copyTextToClipboard } from '../../../helpers'

// Referals Component
const Referals = () => {

    // Contexts
    const { user } = useAuth()
    const { theme } = useTheme()
    const textStyles = createTextStyles(theme)
    const containerStyles = createContainerStyles(theme)
    const insets = useSafeAreaInsets()

    // State
    const [referrals, setReferrals] = useState([])
    const [totalEarnings, setTotalEarnings] = useState(0)
    const [referralLink, setReferralLink] = useState('')
    const [loading, setLoading] = useState(true)
    const [refreshing, setRefreshing] = useState(false)

    // Load referral data
    const loadReferralData = async () => {
        try {
            setLoading(true)
            // Fetch referrals and earnings
            const referralsResponse = await userApi.getReferrals()
            if (referralsResponse.success) {
                setReferrals(referralsResponse.data.referrals || [])
                setTotalEarnings(referralsResponse.data.total_earnings || 0)
            }
            setReferralLink(`https://qvapay.com/register/${user.username}`)
        } catch (error) { Toast.show({ type: 'error', text1: 'Error', text2: 'No se pudieron cargar los datos de referidos' }) }
        finally { setLoading(false) }
    }

    // Refresh data
    const onRefresh = async () => {
        setRefreshing(true)
        await loadReferralData()
        setRefreshing(false)
    }

    // Load data on component mount
    useEffect(() => {
        loadReferralData()
    }, [])

    // Share referral link
    const handleShare = async () => {
        try {
            if (!referralLink) {
                Toast.show({ type: 'error', text1: 'Error', text2: 'No se pudo obtener el enlace de referido' })
                return
            }
            const result = await Share.share({
                message: `¡Únete a QvaPay usando mi enlace de referido y gana premios únicos! ${referralLink}`,
                url: referralLink,
                title: 'Invita a tus amigos a QvaPay'
            })
            if (result.action === Share.sharedAction) { Toast.show({ type: 'success', text1: 'Éxito', text2: 'Enlace de referido compartido correctamente' }) }
        } catch (error) { Toast.show({ type: 'error', text1: 'Error', text2: 'No se pudo compartir el enlace' }) }
    }

    // Copy referral link to clipboard
    const handleCopyLink = async () => {
        try {
            copyTextToClipboard(referralLink)
            Toast.show({ type: 'success', text1: 'Éxito', text2: 'Enlace de referido copiado al portapapeles' })
        } catch (error) { Toast.show({ type: 'error', text1: 'Error', text2: 'No se pudo copiar el enlace' }) }
    }

    if (loading) { return (<QPLoader />) }

    return (
        <ScrollView style={containerStyles.subContainer}
            refreshControl={
                <RefreshControl
                    refreshing={refreshing}
                    onRefresh={onRefresh}
                    colors={[theme.colors.primary]}
                    tintColor={theme.colors.primary}
                />
            }
        >

            {/* Header Section */}
            <Text style={textStyles.h1}>Programa de Referidos</Text>
            <Text style={[textStyles.h3, { color: theme.colors.secondaryText }]}>Invita amigos y gana dinero por cada referido exitoso</Text>

            {/* Earnings Card */}
            <View style={[containerStyles.card, { marginBottom: 10 }]}>

                <Text style={[textStyles.h3, { color: theme.colors.secondaryText, marginBottom: 5 }]}>
                    Ganancias Totales
                </Text>

                <QPBalance formattedAmount={totalEarnings} fontSize={32} theme={theme} />

                <View style={[containerStyles.row, { justifyContent: 'space-between', marginBottom: 10 }]}>
                    <View style={[containerStyles.center, { flex: 1 }]}>
                        <Text style={[textStyles.h2, { color: theme.colors.primary }]}>
                            {referrals.length}
                        </Text>
                        <Text style={[textStyles.caption, { textAlign: 'center' }]}>
                            Referidos
                        </Text>
                    </View>
                    <View style={[containerStyles.center, { flex: 1 }]}>
                        <Text style={[textStyles.h2, { color: theme.colors.success }]}>
                            {referrals.filter(ref => ref.status === 'active').length}
                        </Text>
                        <Text style={[textStyles.caption, { textAlign: 'center' }]}>
                            Activos
                        </Text>
                    </View>
                </View>

            </View>

            {/* Share Section */}
            <View style={[containerStyles.card, { marginBottom: 10 }]}>
                <Text style={[textStyles.h3, { marginBottom: 15, color: theme.colors.secondaryText }]}>
                    Compartir Enlace
                </Text>
                <View style={[containerStyles.box, { marginBottom: 15 }]}>
                    <FontAwesome6 name="link" size={20} color={theme.colors.primary} iconStyle="solid" />
                    <Text style={[textStyles.caption, { flex: 1, marginLeft: 10 }]} numberOfLines={2}>
                        {referralLink || 'Generando enlace...'}
                    </Text>
                </View>
                <View style={[containerStyles.row, { gap: 10 }]}>
                    <QPButton
                        title="Compartir"
                        onPress={handleShare}
                        icon="share"
                        style={{ flex: 1 }}
                        textStyle={{ color: theme.colors.almostWhite }}
                    />
                    <QPButton
                        title="Copiar"
                        onPress={handleCopyLink}
                        icon="copy"
                        style={{ flex: 1, backgroundColor: theme.colors.secondaryText }}
                        textStyle={{ color: theme.colors.almostWhite }}
                    />
                </View>
            </View>

            {/* Referrals List */}
            <View style={{ marginTop: 10 }}>

                <Text style={[textStyles.h3, { marginBottom: 15, color: theme.colors.secondaryText }]}>
                    Mis Referidos ({referrals.length})
                </Text>

                {referrals.length === 0 ? (
                    <View style={[containerStyles.center, { paddingVertical: 40 }]}>
                        <FontAwesome6 name="users" size={48} color={theme.colors.secondaryText} iconStyle="solid" />
                        <Text style={[textStyles.h4, { color: theme.colors.secondaryText, marginTop: 15 }]}>
                            Aún no tienes referidos
                        </Text>
                        <Text style={[textStyles.caption, { marginTop: 5 }]}>
                            Comparte tu enlace para empezar a ganar
                        </Text>
                    </View>
                ) : (
                    referrals.map((referral, index) => (
                        <View key={referral.id || index} style={styles.referralItem}>
                            <ProfileContainerHorizontal user={referral} />
                            <View style={[containerStyles.center, { marginLeft: 10 }]}>
                                <Text style={[textStyles.h5, { color: theme.colors.success, marginBottom: 2 }]}>
                                    +{referral.earnings || 0}
                                </Text>
                            </View>
                        </View>
                    ))
                )}
            </View>

            {/* Bottom spacing */}
            <View style={{ height: insets.bottom + 20 }} />

        </ScrollView>
    )
}

const styles = StyleSheet.create({
    referralItem: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between'
    },
    statusBadge: {
        paddingHorizontal: 8,
        paddingVertical: 2,
        borderRadius: 10,
    },
})

export default Referals