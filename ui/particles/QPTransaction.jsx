import { StyleSheet, View, Text, Pressable } from 'react-native'

// Helpers
import { timeSince, reduceString } from '../../helpers'

// Auth Context
import { useAuth } from '../../auth/AuthContext'

// Theme Context
import { useTheme } from '../../theme/ThemeContext'
import { useContainerStyles, useTextStyles } from '../../theme/themeUtils'

// Routes
import { ROUTES } from '../../routes'

// Particles
import QPCoin from './QPCoin'
import QPAvatar from './QPAvatar'

// QPTransaction component
const QPTransaction = ({ transaction, navigation, index = 0, totalItems = 0 }) => {

    // My user
    const { user } = useAuth()

    // Contexts
    const { theme } = useTheme()
    const textStyles = useTextStyles(theme)
    const containerStyles = useContainerStyles(theme)

    // Determine border radius based on position
    const isFirst = index === 0
    const isLast = index === totalItems - 1
    const containerStyle = {
        borderRadius: isFirst ? 10 : isLast ? 10 : 0,
        borderTopLeftRadius: isFirst ? 10 : 0,
        borderTopRightRadius: isFirst ? 10 : 0,
        borderBottomLeftRadius: isLast ? 10 : 0,
        borderBottomRightRadius: isLast ? 10 : 0,
        marginBottom: isLast ? 10 : 0,
    }

    // Transaction data
    const { uuid, amount, description, owner = {}, paid_by = {}, wallet = {}, updated_at, status } = transaction

    const amountFloat = parseFloat(amount)
    const amountFixed = amountFloat.toFixed(2)

    // Wallet coin
    const wallet_coin = wallet?.wallet_type || ''

    // My user is the owner of the transaction
    const user_uuid = user?.uuid || ''
    const paid_by_uuid = paid_by?.uuid || ''
    const isPaidByMe = user_uuid == paid_by_uuid
    const transactionSign = isPaidByMe ? '-' : '+'
    const transactionColor = isPaidByMe ? theme.colors.danger : theme.colors.successText

    // Navigate to transaction
    const navigateToTransaction = () => navigation.navigate(ROUTES.TRANSACTION, { transaction })

    return (
        <Pressable onPress={navigateToTransaction}>
            <View style={[containerStyles.box, { justifyContent: 'space-between' }, containerStyle]}>

                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 15 }}>

                    {wallet_coin ? (<QPCoin coin={wallet_coin} size={48} />) : (<QPAvatar user={isPaidByMe ? owner : paid_by} size={48} />)}

                    <View style={{ flexDirection: 'column' }}>
                        <Text style={textStyles.h4}>{reduceString(description, 16)}</Text>
                        <Text style={[textStyles.h6, { color: theme.colors.secondaryText }]}>{timeSince(updated_at)}</Text>
                    </View>
                </View>

                <View>
                    <Text style={[textStyles.h4, { color: transactionColor }]}>{transactionSign}{amountFixed}</Text>
                </View>
            </View>
        </Pressable>
    )
}

const styles = StyleSheet.create({

})

export default QPTransaction