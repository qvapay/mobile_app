import React from 'react'
import { StyleSheet, View, Text, Pressable } from 'react-native'

// Gradients
import LinearGradient from 'react-native-linear-gradient'

// Theme Context
import { useTheme } from '../../theme/ThemeContext'

// Icons
import FontAwesome6 from '@react-native-vector-icons/fontawesome6'

// QPButton component
const QPButton = ({ title, onPress, style, icon }) => {

    // Contexts
    const { theme } = useTheme()

    // Variables
    return (
        <Pressable onPress={onPress} style={[styles.container, { backgroundColor: theme.colors.primary }, style]}>
            {icon && <FontAwesome6 name={icon} size={24} color={theme.colors.primaryText} />}
            <Text style={[styles.text, { color: theme.colors.primaryText }]}>{title}</Text>
        </Pressable>
    )
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 12,
        minHeight: 48,
    },
    text: {
        fontSize: 16,
        fontFamily: 'Rubik-SemiBold',
        marginLeft: 8,
    },
})

export default QPButton