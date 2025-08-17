import React, { forwardRef, useState } from 'react'
import { StyleSheet, View, TextInput, Pressable } from 'react-native'

// Theme
import { useTheme } from '../../theme/ThemeContext'

// Icons
import FontAwesome6 from '@react-native-vector-icons/fontawesome6'

// Custom Input Component
const QPInput = forwardRef((props, ref) => {

    const { style, multiline } = props
    const hasPrefix = props.prefixIconName !== undefined
    const hasSuffix = props.suffixIconName !== undefined

    // States
    const [isSecure, setIsSecure] = useState(props.secureTextEntry)
    const [suffixIconName, setSuffixIconName] = useState(props.suffixIconName)

    // Theme variables, dark and light modes
    const { theme } = useTheme()

    // Icon style
    const iconStyle = props.iconStyle || 'solid'

    // Change the TextInput between password and text
    const handleSuffixPress = () => {
        if (props.suffixIconName === 'eye' || props.suffixIconName === 'eye-slash') {
            setIsSecure(!isSecure);
            setSuffixIconName(isSecure ? 'eye' : 'eye-slash');
        }
    }

    return (
        <View style={[styles.container, { backgroundColor: theme.colors.surface }]}>

            {hasPrefix && (
                <View style={styles.prefixContainer}>
                    <FontAwesome6 size={18} color={theme.colors.secondaryText} name={props.prefixIconName} style={styles.icon} iconStyle={iconStyle} />
                </View>
            )}

            <TextInput
                ref={ref}
                {...props}
                secureTextEntry={isSecure}
                placeholderStyle={{ fontFamily: 'Rubik-Regular' }}
                placeholderTextColor={theme.colors.tertiaryText}
                style={[
                    styles.input,
                    {
                        color: theme.colors.primaryText,
                        height: multiline ? 100 : 50,
                        paddingLeft: hasPrefix ? 0 : 15,
                        paddingRight: hasSuffix ? 0 : 15,
                    },
                    style
                ]}
            />

            {hasSuffix && (
                <Pressable onPress={handleSuffixPress}>
                    <View style={styles.suffixContainer}>
                        <FontAwesome6 size={18} color={theme.colors.secondaryText} name={suffixIconName} style={styles.icon} iconStyle="solid" />
                    </View>
                </Pressable>
            )}

        </View>
    )
})

const styles = StyleSheet.create({
    container: {
        borderRadius: 10,
        marginVertical: 5,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        // borderWidth: 0.5,
    },
    prefixContainer: {
        width: 50,
        height: 50,
        alignItems: 'center',
        justifyContent: 'center',
        borderTopLeftRadius: 10,
        borderBottomLeftRadius: 10,
    },
    suffixContainer: {
        width: 50,
        height: 50,
        alignItems: 'center',
        justifyContent: 'center',
        borderTopRightRadius: 10,
        borderBottomRightRadius: 10,
    },
    icon: {
        marginHorizontal: 10
    },
    input: {
        fontSize: 16,
        flex: 1,
        fontFamily: 'Rubik-Regular',
        paddingVertical: 12,
    }
})

export default QPInput