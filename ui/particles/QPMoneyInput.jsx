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
                placeholderStyle={{ fontFamily: 'Rubik-Regular' }}
                placeholderTextColor={theme.colors.tertiaryText}
                style={[
                    styles.input,
                    { color: color },
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
        justifyContent: 'center',
        marginBottom: 20,
        height: 120,
    },
    input: {
        fontFamily: 'Rubik-Black',
        textAlign: 'center',
        fontSize: 50,
    }
})

export default QPInput