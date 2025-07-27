import { View, Text, StyleSheet } from 'react-native'

const Transaction = ({ route }) => {

    const { transaction } = route.params

    console.log("Transaction", transaction)

    return (
        <View>
            <Text>Transaction</Text>
            <Text>{transaction.uuid}</Text>
        </View>
    )
}

const styles = StyleSheet.create({

})

export default Transaction