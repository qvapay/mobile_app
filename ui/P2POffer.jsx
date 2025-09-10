import { View, Text, StyleSheet } from 'react-native'

// Theme Context
import { useTheme } from '../theme/ThemeContext'
import { createTextStyles, createContainerStyles } from '../theme/themeUtils'

// UI Components
import QPCoin from './particles/QPCoin'
import QPButton from './particles/QPButton'

// Icons
import FontAwesome6 from '@react-native-vector-icons/fontawesome6'
import ProfileContainerHorizontal from './ProfileContainerHorizontal'

// P2P Offer Component
const P2POffer = ({ offer }) => {

    // Contexts
    const { theme } = useTheme()
    const textStyles = createTextStyles(theme)
    const containerStyles = createContainerStyles(theme)

    const getTypeColor = (type) => { return type === 'buy' ? theme.colors.success : theme.colors.error }
    const getTypeText = (type) => { return type === 'buy' ? 'COMPRA' : 'VENDE' }

    console.log(offer)

    return (
        <View style={[styles.offerCard, { backgroundColor: theme.colors.surface }]}>

            {/* Header with Type and Coin */}
            <View style={styles.offerHeader}>
                <View style={styles.typeContainer}>
                    <Text style={[styles.typeText, { color: theme.colors.primaryText }]}>{getTypeText(offer.type)}</Text>
                </View>
                <Text style={[textStyles.caption, { color: theme.colors.primaryText }]}>
                    {new Date(offer.created_at).toLocaleDateString()}
                </Text>
            </View>

            {/* Amount and Receive */}
            <View style={{ marginBottom: 6 }}>
                <View style={[styles.amountRow, { marginLeft: 2 }]}>
                    <Text style={[textStyles.h2, { color: theme.colors.primary, fontWeight: '800' }]}>${offer.amount}</Text>
                    <Text style={[textStyles.h6, { color: theme.colors.primaryText, fontWeight: '200' }]}>x</Text>
                    <Text style={[textStyles.h3, { color: theme.colors.primaryText }]}>{offer.receive}</Text>
                </View>
                <View style={styles.coinRow}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
                        <QPCoin coin={offer.Coin?.logo} size={20} />
                        <Text style={[textStyles.h5, { color: theme.colors.primaryText }]}>{offer.Coin?.name}</Text>
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
                        <FontAwesome6 name="money-bill-transfer" size={12} color={theme.colors.primaryText} iconStyle="solid" />
                        <Text style={[textStyles.h6, { color: theme.colors.primaryText, fontWeight: '400' }]}>{Number(offer.receive / offer.amount).toFixed(2)}</Text>
                    </View>
                </View>
            </View>

            {/* User Info */}
            <View style={{ marginVertical: 4 }}>
                <ProfileContainerHorizontal user={offer.User} size={40} showUsername={false} />
                {/* <View style={styles.userStats}>
                    <Text style={[textStyles.caption, { color: theme.colors.primaryText }]}>
                        P2P: {offer.User?._count?.P2P || 0}
                    </Text>
                    <Text style={[textStyles.caption, { color: theme.colors.primaryText, marginLeft: 8 }]}>
                        Peer: {offer.User?._count?.P2P_Peer || 0}
                    </Text>
                </View> */}
            </View>

            {/* Message and Action in one row */}
            <View style={styles.messageRow}>
                {offer.message ? (
                    <Text style={[textStyles.caption, styles.messageText, { color: theme.colors.primaryText }]} numberOfLines={1} ellipsizeMode='tail' >
                        {offer.message}
                    </Text>
                ) : (
                    <View style={styles.messageText} />
                )}
                <QPButton
                    title={offer.type === 'buy' ? 'Vender' : 'Comprar'}
                    style={{
                        backgroundColor: offer.type === 'buy' ? theme.colors.danger : theme.colors.success,
                        width: 75,
                        height: 30,
                        borderRadius: 5,
                        paddingHorizontal: 5,
                        paddingVertical: 5,
                    }}
                    textStyle={{ color: offer.type === 'buy' ? theme.colors.almostWhite : theme.colors.almostBlack, fontSize: 13, fontWeight: '400' }}
                />
            </View>

        </View>
    )
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        paddingHorizontal: 20,
    },
    centerContent: {
        justifyContent: 'center',
        alignItems: 'center',
    },
    header: {
        paddingVertical: 20,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(0,0,0,0.1)',
        marginBottom: 16,
    },
    listContainer: {
        paddingBottom: 20,
    },
    emptyContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        paddingVertical: 40,
    },
    offerCard: {
        borderRadius: 12,
        paddingHorizontal: 12,
        paddingVertical: 8,
        marginBottom: 8,
        position: 'relative'
    },
    offerHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 12,
    },
    typeContainer: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    typeBadge: {
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 6,
    },
    typeText: {
        fontSize: 10,
        fontWeight: 'bold',
        textTransform: 'uppercase',
    },
    amountRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
    },
    coinRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    userInfo: {
        marginBottom: 4,
    },
    userStats: {
        flexDirection: 'row',
    },
    badgesContainer: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        marginBottom: 8,
    },
    badge: {
        paddingHorizontal: 6,
        paddingVertical: 2,
        borderRadius: 4,
        marginRight: 6,
        marginBottom: 4,
    },
    badgeText: {
        fontSize: 10,
        fontWeight: 'bold',
    },
    messageContainer: {
        marginTop: 8,
        paddingTop: 8,
        overflow: 'hidden',
    },
    messageRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingTop: 4,
    },
    messageText: {
        flex: 1,
        marginRight: 12
    }
})

export default P2POffer