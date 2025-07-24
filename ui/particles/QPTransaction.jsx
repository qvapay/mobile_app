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

// Imagecomponents
import FastImage from "@d11/react-native-fast-image"

// QPTransaction component
const QPTransaction = ({ transaction, navigation, firstItem = false, lastItem = false }) => {

    // My user
    const { user } = useAuth()

    // Contexts
    const { theme } = useTheme()
    const containerStyles = useContainerStyles(theme)
    const textStyles = useTextStyles(theme)

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
            <View style={[containerStyles.box, { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }]}>
                <View>
                    <Text style={textStyles.h4}>{reduceString(description)}</Text>
                    {/* <Text style={textStyles.h4}>{getShortDateTime(updated_at)}</Text> */}
                    <Text style={[textStyles.h4, { color: theme.colors.secondaryText }]}>{timeSince(updated_at)}</Text>
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