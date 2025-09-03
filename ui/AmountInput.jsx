import React, { useState } from 'react'
import { View, Text, TouchableOpacity, TextInput } from 'react-native'
import { useTheme } from '../theme/ThemeContext'
import { createTextStyles, createContainerStyles } from '../theme/themeUtils'
import FontAwesome6 from '@react-native-vector-icons/fontawesome6'

const AmountInput = ({
    amount,
    onAmountChange,
    balance,
    currency = 'QUSD',
    onCurrencyChange,
    placeholder = 'Enter Amount',
    style = {}
}) => {

    const { theme } = useTheme()
    const textStyles = createTextStyles(theme)
    const containerStyles = createContainerStyles(theme)

    // Common amounts for quick selection
    const commonAmounts = [25, 50, 75, 100, 125, 150]

    // Format balance for display
    const formatBalance = (balance) => {
        if (!balance) return '0.00'
        return parseFloat(balance).toFixed(2)
    }

    // Handle amount selection from badges
    const handleAmountSelect = (selectedAmount) => {
        onAmountChange(selectedAmount.toString())
    }

    return (
        <View style={[{ marginVertical: 10 }, style]}>

            {/* Main Amount Input Container */}
            <View style={{ backgroundColor: theme.colors.primary + '18', borderRadius: 16, padding: 20, borderWidth: 2, borderColor: theme.colors.primary }}>

                {/* Amount Input Row */}
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>

                    <Text style={[textStyles.h6, { color: theme.colors.tertiaryText, marginBottom: 4 }]}>
                        {placeholder}:
                    </Text>

                    {/* Currency Selector */}
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 2 }}>
                        <Text style={[textStyles.h7, { color: theme.colors.tertiaryText }]}>
                            Balance:
                        </Text>
                        <Text style={[textStyles.h7, { color: theme.colors.primary, fontWeight: '600' }]}>
                            {formatBalance(balance)} {currency}
                        </Text>
                    </View>
                </View>

                <View style={{ marginTop: 4, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                    <TextInput
                        value={amount}
                        onChangeText={onAmountChange}
                        placeholder="0.00"
                        placeholderTextColor={theme.colors.placeholder}
                        keyboardType="numeric"
                        style={[textStyles.h2, { color: theme.colors.primaryText, fontSize: 28, fontWeight: '600', padding: 0, margin: 0, }]}
                    />
                    <View style={{ backgroundColor: theme.colors.primary + '22', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4, marginLeft: 8 }}>
                        <Text style={[textStyles.h5, { color: theme.colors.primary, fontWeight: 'bold' }]}>QUSD</Text>
                    </View>
                </View>

            </View>

            {/* Common Amount Badges - 3x2 Grid */}
            <View style={{ marginTop: 8, gap: 8 }}>
                {/* First Row */}
                <View style={{ flexDirection: 'row', gap: 8, justifyContent: 'space-between' }}>
                    {commonAmounts.slice(0, 3).map((commonAmount) => (
                        <TouchableOpacity
                            key={commonAmount}
                            onPress={() => handleAmountSelect(commonAmount)}
                            style={{
                                flex: 1,
                                backgroundColor: amount === commonAmount.toString()
                                    ? theme.colors.primary
                                    : theme.colors.elevation,
                                paddingVertical: 12,
                                borderRadius: 20,
                                borderWidth: 1,
                                borderColor: amount === commonAmount.toString()
                                    ? theme.colors.primary
                                    : theme.colors.border,
                                alignItems: 'center',
                                justifyContent: 'center',
                            }}
                        >
                            <Text style={[textStyles.h6, { color: amount === commonAmount.toString() ? theme.colors.buttonText : theme.colors.primaryText, fontWeight: '600' }]}>
                                ${commonAmount}.00
                            </Text>
                        </TouchableOpacity>
                    ))}
                </View>

                {/* Second Row */}
                <View style={{ flexDirection: 'row', gap: 8, justifyContent: 'space-between' }}>
                    {commonAmounts.slice(3, 6).map((commonAmount) => (
                        <TouchableOpacity
                            key={commonAmount}
                            onPress={() => handleAmountSelect(commonAmount)}
                            style={{
                                flex: 1,
                                backgroundColor: amount === commonAmount.toString()
                                    ? theme.colors.primary
                                    : theme.colors.elevation,
                                paddingVertical: 12,
                                borderRadius: 20,
                                borderWidth: 1,
                                borderColor: amount === commonAmount.toString()
                                    ? theme.colors.primary
                                    : theme.colors.border,
                                alignItems: 'center',
                                justifyContent: 'center',
                            }}
                        >
                            <Text style={[textStyles.h6, { color: amount === commonAmount.toString() ? theme.colors.buttonText : theme.colors.primaryText, fontWeight: '600' }]}>
                                ${commonAmount}.00
                            </Text>
                        </TouchableOpacity>
                    ))}
                </View>
            </View>
        </View>
    )
}

export default AmountInput
