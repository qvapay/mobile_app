import { StyleSheet, Text, Pressable, ActivityIndicator } from 'react-native'

// Theme Context
import { useTheme } from '../../theme/ThemeContext'

// Icons
import FontAwesome6 from '@react-native-vector-icons/fontawesome6'

// QPButton component
const QPButton = ({ title, onPress, style, textStyle, icon, disabled = false, loading = false }) => {

    // Contexts
    const { theme } = useTheme()

    const handlePress = () => {
        if (disabled) return
        onPress && onPress()
    }

    // Variables
    return (
        <Pressable
            onPress={handlePress}
            style={({ pressed }) => [
                styles.container,
                { backgroundColor: disabled ? theme.colors.secondaryText : theme.colors.primary },
                { transform: [{ scale: pressed ? 0.99 : 1 }] },
                { opacity: disabled ? 0.5 : 1 },
                style
            ]}>
            {loading ? (<ActivityIndicator size="small" color={theme.colors.almostWhite} />) : (
                <>
                    {icon && <FontAwesome6 name={icon} size={18} color={theme.colors.primaryText} iconStyle="solid" />}
                    {title && <Text style={[styles.text, textStyle, { marginLeft: icon ? 8 : 0 }]}>{title}</Text>}
                </>
            )}
        </Pressable>
    )
}

const styles = StyleSheet.create({
    container: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 10,
        height: 56,
        width: '100%',
        marginVertical: 5,
        paddingVertical: 10,
        alignItems: 'center',
    },
    text: {
        fontSize: 16,
        fontFamily: 'Rubik-SemiBold',
    },
})

export default QPButton