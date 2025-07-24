import { StyleSheet, View, Text, Pressable } from 'react-native'


// Helpers
import { getShortDateTime, timeSince, reduceString } from '../../helpers'

// Auth Context
import { useAuth } from '../../auth/AuthContext'

// Theme Context
import { useTheme } from '../../theme/ThemeContext'
import { useContainerStyles, useTextStyles } from '../../theme/themeUtils'

// Routes
import { ROUTES } from '../../routes'

// Particles
import QPAvatar from './QPAvatar'

// QPTransaction component
const QPTransaction = ({ transaction, navigation, index = 0, totalItems = 0 }) => {

    // My user
    const { user } = useAuth()

    // Contexts
    const { theme } = useTheme()
    const containerStyles = useContainerStyles(theme)
    const textStyles = useTextStyles(theme)

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
    const { uuid, amount, description, owner, paid_by, updated_at, status } = transaction

    const amountFloat = parseFloat(amount)
    const amountFixed = amountFloat.toFixed(2)

    // My user is the owner of the transaction
    const isPaidByMe = user.uuid === paid_by.uuid
    const transactionSign = isPaidByMe ? '-' : '+'
    const transactionColor = isPaidByMe ? theme.colors.danger : theme.colors.success

    // Navigate to transaction
    const navigateToTransaction = () => navigation.navigate(ROUTES.TRANSACTION_STACK, { screen: 'TransactionShow', params: { uuid } })

    console.log(transaction)

    return (
        <Pressable onPress={navigateToTransaction}>
            <View style={[containerStyles.box, { justifyContent: 'space-between' }, containerStyle]}>

                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 15 }}>
                    <QPAvatar user={owner} size={48} />
                    <View style={{ flexDirection: 'column' }}>
                        <Text style={textStyles.h4}>{reduceString(description)}</Text>
                        <Text style={[textStyles.h5, { color: theme.colors.secondaryText }]}>{timeSince(updated_at)}</Text>
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