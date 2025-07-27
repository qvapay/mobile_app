import { useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'

// Theme
import { useTheme } from '../../theme/ThemeContext'
import { createContainerStyles } from '../../theme/themeUtils'

// UI
import QPButton from '../../ui/particles/QPButton'
import QPMoneyInput from '../../ui/particles/QPMoneyInput'

const Withdraw = () => {

    // States
    const [amount, setAmount] = useState('')

    // Theme variables, dark and light modes
    const { theme } = useTheme()
    const containerStyles = createContainerStyles(theme)

    return (
        <View style={[containerStyles.subContainer]}>
            <QPMoneyInput
                placeholder="0.00"
                value={amount}
                onChangeText={setAmount}
                keyboardType="numeric"
                prefixIconName="minus"
                type="withdraw"
            />
        </View>
    )
}

const styles = StyleSheet.create({})

export default Withdraw