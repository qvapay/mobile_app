import { useState, useEffect } from 'react'
import { View, Text, StyleSheet, FlatList } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

// Contexts
import { useTheme } from '../../theme/ThemeContext'
import { createTextStyles, createContainerStyles } from '../../theme/themeUtils'

// Routes
import { ROUTES } from '../../routes'

// API
import { transferApi } from '../../api/transferApi'

// UI
import QPButton from '../../ui/particles/QPButton'
import QPTransaction from '../../ui/particles/QPTransaction'

const Transactions = ({ navigation }) => {

    // States
    const [transactions, setTransactions] = useState([])

    // Contexts
    const { theme } = useTheme()
    const textStyles = createTextStyles(theme)
    const containerStyles = createContainerStyles(theme)
    const insets = useSafeAreaInsets()

    // Get latest transactions
    useEffect(() => {
        const fetchTransactions = async () => {
            try {
                const result = await transferApi.getLatestTransactions()
                if (result.success) {
                    setTransactions(result.data)
                }
            } catch (error) {
                console.log("Error getting latest transactions", error)
            }
        }
        fetchTransactions()
    }, [])

    console.log("Transactions", transactions)

    // Render
    return (
        <View style={[containerStyles.subContainer, { paddingBottom: insets.bottom }]}>

            {/** TODO: Add a filter component */}
            {/** TODO: Retrieve more transactions on last item scroll */}

            <FlatList
                // ListHeaderComponent={<Text style={textStyles.h1}>Transacciones</Text>}
                data={transactions}
                renderItem={({ item, index }) => <QPTransaction transaction={item} navigation={navigation} index={index} totalItems={transactions.length} />}
                keyExtractor={(item) => item.uuid}
                ListEmptyComponent={<Text style={textStyles.h2}>No hay transacciones</Text>}
            />

        </View>
    )
}

const styles = StyleSheet.create({

})

export default Transactions