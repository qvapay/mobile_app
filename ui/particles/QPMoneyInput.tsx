import { StyleSheet, View, TextInput } from 'react-native'
import type { StyleProp, TextInputProps, TextStyle, ViewStyle } from 'react-native'
import type { ComponentType, Ref } from 'react'

// Theme
import { useTheme } from '../../theme/ThemeContext'

// Icons
import FontAwesome6Icon from '@react-native-vector-icons/fontawesome6'

// Los tipos de FontAwesome6 exigen uniones literales de nombres por iconStyle;
// aquí el nombre llega como prop libre, así que se relaja el tipo del
// componente en local (cast de tipos, cero cambio de runtime).
const FontAwesome6 = FontAwesome6Icon as ComponentType<{
	name?: string
	size?: number
	color?: string
	iconStyle?: 'solid' | 'regular' | 'brand'
	style?: StyleProp<TextStyle>
}>

type QPMoneyInputProps = TextInputProps & {
	ref?: Ref<TextInput>
	type?: 'add' | string
	prefixIconName?: string
}

/**
 * Hero-sized money entry field where color signals direction: `type="add"`
 * paints digits, placeholder and prefix icon in success green; anything else
 * uses danger red (withdrawals). Centered, black-weight typography at ~display
 * size, hard-capped at 8 characters. React 19: `ref` arrives as a regular prop
 * and is forwarded to the TextInput; remaining props pass through.
 *
 * @param props
 * @param [props.type] - 'add' renders green; otherwise red.
 * @param [props.prefixIconName] - Optional FontAwesome6 icon before the amount.
 */
const QPInput = ({ ref, ...props }: QPMoneyInputProps) => {

    // Theme variables, dark and light modes
    const { theme } = useTheme()

    const { style, prefixIconName, type } = props
    const hasPrefix = prefixIconName !== undefined
    const color = type === 'add' ? theme.colors.successText : theme.colors.danger

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
                // @ts-expect-error placeholderStyle no existe en TextInputProps (prop no estándar); se conserva tal cual
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

// OJO (bug latente pre-TS): el JSX referencia styles.prefixContainer y
// styles.icon, que NO existen en esta hoja — en runtime son undefined y el
// estilo es un no-op. Se tipa laxo para conservar ese runtime tal cual.
const styles: Record<string, ViewStyle | TextStyle | undefined> = StyleSheet.create({
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