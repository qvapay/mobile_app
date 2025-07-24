import { StyleSheet, View, Text, Pressable } from 'react-native'

// Helpers
import { getShortDateTime, timeSince, reduceString } from '../../helpers'

// Theme Context
import { useTheme } from '../../theme/ThemeContext'
import { useContainerStyles, useTextStyles } from '../../theme/themeUtils'

// Routes
import { ROUTES } from '../../routes'

// Imagecomponents
import FastImage from "@d11/react-native-fast-image"

// QPTransaction component
const QPTransaction = ({ transaction, navigation }) => {


    // Contexts
    const { theme } = useTheme()
    const containerStyles = useContainerStyles(theme)
    const textStyles = useTextStyles(theme)

    // Transaction data
    const { uuid, amount, description, owner, paid_by, updated_at, status } = transaction
    const updatedDate = new Date(updated_at)
    const positive = theme.colors.success
    const negative = theme.colors.danger
    const amountFloat = parseFloat(amount)
    const isNegative = amountFloat < 0
    const color = isNegative ? negative : positive
    const amountSign = isNegative || "+"
    const amountFixed = amountFloat.toFixed(2)
    const sourceUri = isNegative ? owner.logo : paid_by.logo

    // Navigate to transaction
    const navigateToTransaction = () => navigation.navigate(ROUTES.TRANSACTION_STACK, { screen: 'TransactionShow', params: { uuid } })

    return (
        <Pressable onPress={navigateToTransaction}>
            <View style={[containerStyles.box, { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }]}>
                <View>
                    <Text style={textStyles.h4}>{reduceString(description)}</Text>
                    <Text style={textStyles.h4}>{getShortDateTime(updated_at)}</Text>
                    <Text style={textStyles.h4}>{timeSince(updated_at)}</Text>
                </View>
                <View>
                    <Text style={textStyles.h4}>{amountSign}{amountFixed}</Text>
                </View>
            </View>
        </Pressable>
    )
}

const styles = StyleSheet.create({

})

export default QPTransaction