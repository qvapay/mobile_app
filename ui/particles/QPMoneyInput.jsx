import { forwardRef, useState } from 'react'
import { StyleSheet, View, TextInput } from 'react-native'

// Theme
import { useTheme } from '../../theme/ThemeContext'

// Icons
import FontAwesome6 from '@react-native-vector-icons/fontawesome6'

const QPInput = forwardRef((props, ref) => {

    // Theme variables, dark and light modes
    const { theme } = useTheme()

    const { style, prefixIconName, type } = props
    const hasPrefix = prefixIconName !== undefined
    const color = type === 'add' ? theme.colors.success : theme.colors.danger

    return (
        <View style={[styles.container]}>
            {hasPrefix && (
                <View style={styles.prefixContainer}>
                    <FontAwesome6 size={18} color={color} name={props.prefixIconName} style={styles.icon} iconStyle="solid" />
                </View>
            )}
            <TextInput
                ref={ref}
                {...props}
                placeholderStyle={{ fontFamily: theme.typography.fontFamily.regular }}
                placeholderTextColor={color}
                style={[
                    styles.input,
                    { color: color, fontFamily: theme.typography.fontFamily.black, fontSize: Math.round(theme.typography.fontSize.display * 0.83) },
                    style
                ]}
                maxLength={8}
            />
        </View>
    )
})

const styles = StyleSheet.create({
    container: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center'
    },
    input: {
        textAlign: 'center',
    }
})

export default QPInput