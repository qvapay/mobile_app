import { Text, ActivityIndicator } from 'react-native'

// Theme Context
import { useTheme } from '../../theme/ThemeContext'

// Press animation wrapper (Reanimated)
import QPPressable from './QPPressable'

// Icons
import FontAwesome6 from '@react-native-vector-icons/fontawesome6'

/**
 * The app's primary action button, used across ~50 screens. Builds on QPPressable
 * for Fabric-safe press-scale feedback. Variants derive from flags: default
 * (primary bg), `danger` (red bg), `danger + outlined` (transparent bg, red
 * border/text). `loading` swaps the content for an ActivityIndicator and blocks
 * presses; `disabled` also dims the button to 50% opacity.
 *
 * @param {object} props
 * @param {string} props.title - Button label.
 * @param {function} props.onPress - Press handler.
 * @param {string} [props.icon] - FontAwesome6 icon name rendered before the title.
 * @param {boolean} [props.loading=false] - Shows a spinner and disables presses.
 * @param {boolean} [props.danger=false] - Destructive styling.
 * @param {boolean} [props.outlined=false] - With `danger`, renders the outlined variant.
 */
const QPButton = ({ title, onPress, style, textStyle, icon, iconStyle = 'solid', iconColor, disabled = false, loading = false, loadingColor, danger = false, outlined = false }) => {

    // Contexts
    const { theme } = useTheme()

    const isDangerOutlined = danger && outlined

    const bgColor = isDangerOutlined ? 'transparent' : (disabled ? theme.colors.secondaryText : (danger ? theme.colors.danger : theme.colors.primary))

    const borderWidth = isDangerOutlined ? 1.5 : 0
    const borderColor = isDangerOutlined ? (disabled ? theme.colors.secondaryText : theme.colors.danger) : 'transparent'

    const textColor = isDangerOutlined ? (disabled ? theme.colors.secondaryText : theme.colors.danger) : theme.colors.buttonText

    return (
        <QPPressable
            onPress={onPress}
            disabled={disabled || loading}
            style={[
                styles.container,
                { backgroundColor: bgColor },
                { borderWidth, borderColor },
                { opacity: disabled ? 0.5 : 1 },
                style
            ]}>
            {loading ? (<ActivityIndicator size="small" color={loadingColor || (isDangerOutlined ? theme.colors.danger : theme.colors.almostWhite)} />) : (
                <>
                    {icon && <FontAwesome6 name={icon} size={18} color={iconColor || (isDangerOutlined ? theme.colors.danger : theme.colors.primaryText)} iconStyle={iconStyle} />}
                    {title && <Text style={[{ fontSize: theme.typography.fontSize.md, fontFamily: theme.typography.fontFamily.semiBold, color: textColor }, textStyle, { marginLeft: icon ? 8 : 0 }]}>{title}</Text>}
                </>
            )}
        </QPPressable>
    )
}

const styles = {
    container: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 25,
        height: 56,
        width: '100%',
        marginVertical: 5,
        paddingVertical: 10,
    },
}

export default QPButton