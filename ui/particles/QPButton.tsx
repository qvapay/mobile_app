import { Text, ActivityIndicator } from 'react-native'
import type { StyleProp, TextStyle, ViewStyle } from 'react-native'
import type { ComponentType } from 'react'

// Theme Context
import { useTheme } from '../../theme/ThemeContext'

// Press animation wrapper (Reanimated)
import QPPressable from './QPPressable'

// Icons
import FontAwesome6Icon from '@react-native-vector-icons/fontawesome6'

// Los tipos de FontAwesome6 exigen uniones literales de nombres por iconStyle;
// aquí el nombre llega como prop libre desde ~50 pantallas, así que se relaja
// el tipo del componente en local (cast de tipos, cero cambio de runtime).
const FontAwesome6 = FontAwesome6Icon as ComponentType<{
	name: string
	size?: number
	color?: string
	iconStyle?: 'solid' | 'regular' | 'brand'
	style?: StyleProp<TextStyle>
}>

type QPButtonProps = {
	title?: string
	onPress?: () => void
	style?: StyleProp<ViewStyle>
	textStyle?: StyleProp<TextStyle>
	icon?: string
	iconStyle?: 'solid' | 'regular' | 'brand'
	iconColor?: string
	disabled?: boolean
	loading?: boolean
	loadingColor?: string
	danger?: boolean
	outlined?: boolean
}

/**
 * The app's primary action button, used across ~50 screens. Builds on QPPressable
 * for Fabric-safe press-scale feedback. Variants derive from flags: default
 * (primary bg), `danger` (red bg), `danger + outlined` (transparent bg, red
 * border/text). `loading` swaps the content for an ActivityIndicator and blocks
 * presses; `disabled` also dims the button to 50% opacity.
 *
 * @param props
 * @param props.title - Button label.
 * @param props.onPress - Press handler.
 * @param [props.icon] - FontAwesome6 icon name rendered before the title.
 * @param [props.loading=false] - Shows a spinner and disables presses.
 * @param [props.danger=false] - Destructive styling.
 * @param [props.outlined=false] - With `danger`, renders the outlined variant.
 */
const QPButton = ({ title, onPress, style, textStyle, icon, iconStyle = 'solid', iconColor, disabled = false, loading = false, loadingColor, danger = false, outlined = false }: QPButtonProps) => {

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

// Anotado (no StyleSheet.create) para que los literales no se ensanchen a string
const styles: { container: ViewStyle } = {
    container: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        // Squircle en vez de píldora: es el lenguaje de botón de la app
        // (borderCurve continuous da la curva real en iOS)
        borderRadius: 16,
        borderCurve: 'continuous',
        height: 56,
        width: '100%',
        marginVertical: 5,
        paddingVertical: 10,
    },
}

export default QPButton