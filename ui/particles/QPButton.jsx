import { Text, Pressable, ActivityIndicator } from 'react-native'

// Theme Context
import { useTheme } from '../../theme/ThemeContext'

// Icons
import FontAwesome6 from '@react-native-vector-icons/fontawesome6'

// QPButton component
const QPButton = ({ title, onPress, style, textStyle, icon, iconStyle = 'solid', iconColor, disabled = false, loading = false, loadingColor, danger = false, outlined = false }) => {

    // Contexts
    const { theme } = useTheme()

    const handlePress = () => {
        if (disabled) return
        onPress && onPress()
    }

    const isDangerOutlined = danger && outlined

    const bgColor = isDangerOutlined ? 'transparent' : (disabled ? theme.colors.secondaryText : (danger ? theme.colors.danger : theme.colors.primary))

    const borderWidth = isDangerOutlined ? 1.5 : 0
    const borderColor = isDangerOutlined ? (disabled ? theme.colors.secondaryText : theme.colors.danger) : 'transparent'

    const textColor = isDangerOutlined ? (disabled ? theme.colors.secondaryText : theme.colors.danger) : theme.colors.buttonText

    return (
        <Pressable
            onPress={handlePress}
            style={({ pressed }) => [
                styles.container,
                { backgroundColor: bgColor },
                { borderWidth, borderColor },
                { transform: [{ scale: pressed ? 0.99 : 1 }] },
                { opacity: disabled ? 0.5 : 1 },
                style
            ]}>
            {loading ? (<ActivityIndicator size="small" color={loadingColor || (isDangerOutlined ? theme.colors.danger : theme.colors.almostWhite)} />) : (
                <>
                    {icon && <FontAwesome6 name={icon} size={18} color={iconColor || (isDangerOutlined ? theme.colors.danger : theme.colors.primaryText)} iconStyle={iconStyle} />}
                    {title && <Text style={[{ fontSize: theme.typography.fontSize.md, fontFamily: theme.typography.fontFamily.semiBold, color: textColor }, textStyle, { marginLeft: icon ? 8 : 0 }]}>{title}</Text>}
                </>
            )}
        </Pressable>
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