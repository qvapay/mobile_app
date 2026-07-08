import { StyleSheet, View, TextInput } from 'react-native'

// Theme
import { useTheme } from '../../theme/ThemeContext'

// Icons
import FontAwesome6 from '@react-native-vector-icons/fontawesome6'

/**
 * Hero-sized money entry field where color signals direction: `type="add"`
 * paints digits, placeholder and prefix icon in success green; anything else
 * uses danger red (withdrawals). Centered, black-weight typography at ~display
 * size, hard-capped at 8 characters. React 19: `ref` arrives as a regular prop
 * and is forwarded to the TextInput; remaining props pass through.
 *
 * @param {object} props
 * @param {'add'|string} [props.type] - 'add' renders green; otherwise red.
 * @param {string} [props.prefixIconName] - Optional FontAwesome6 icon before the amount.
 */
const QPInput = ({ ref, ...props }) => {

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
}

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