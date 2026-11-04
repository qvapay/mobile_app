import { useState } from 'react'
import type { ComponentType, Ref } from 'react'
import { StyleSheet, View, TextInput, Pressable, Text, type TextInputInstance } from 'react-native'
import type { StyleProp, TextInputProps, TextStyle } from 'react-native'

// Theme
import { useTheme } from '../../theme/ThemeContext'
import { useFieldFill } from '../SurfaceContext'

import { splitAddress } from '../../helpers/addressHighlight'
import { AddressSpans } from './QPAddress'

// Icons
import FontAwesome6Icon from '@react-native-vector-icons/fontawesome6'

// Los tipos de FontAwesome6 exigen uniones literales de nombres por iconStyle;
// aquí los nombres llegan como props libres, así que se relaja el tipo del
// componente en local (cast de tipos, cero cambio de runtime).
const FontAwesome6 = FontAwesome6Icon as ComponentType<{
	name?: string
	size?: number
	color?: string
	iconStyle?: 'solid' | 'regular' | 'brand'
	style?: StyleProp<TextStyle>
}>

type QPInputProps = TextInputProps & {
	ref?: Ref<TextInputInstance>
	prelabel?: string
	prefixIconName?: string
	suffixIconName?: string
	/** Texto fijo pegado al final del campo, a la altura del texto tecleado (p. ej. `@qvpay.me`); con `textAlign="right"` el texto se lee seguido. */
	suffixText?: string
	iconStyle?: 'solid' | 'regular' | 'brand'
	/** Campo de dirección de wallet: resalta sus extremos y apaga autocorrección/mayúsculas. */
	highlightAddress?: boolean
}

/**
 * Themed text input with optional prelabel and prefix/suffix FontAwesome6 icons.
 * Passing `suffixIconName` as 'eye'/'eye-slash' turns the suffix into a password
 * visibility toggle that flips `secureTextEntry`. The fill comes from the host
 * (`useFieldFill`: surface on a page, background inside a surface card/modal — the
 * sunken-well rule of `ui/SurfaceContext`). The border is a constant 1pt so focusing
 * never shifts layout: primary while focused (both modes), transparent at rest in
 * dark (house style: no borders on dark surfaces), `border` at rest in light.
 * React 19: `ref` arrives as a regular prop and is forwarded straight to the
 * TextInput (no forwardRef). All unrecognized props pass through to the TextInput.
 *
 * @param props
 * @param [props.prelabel] - Small muted label rendered above the field.
 * @param [props.prefixIconName] - FontAwesome6 icon on the left.
 * @param [props.suffixIconName] - FontAwesome6 icon on the right ('eye' enables the toggle).
 * @param [props.highlightAddress] - Wallet-address field: the first/last 6 chars of a
 *   typed or pasted address render in the primary color (Text children instead of `value`).
 */
const QPInput = ({ ref, highlightAddress, ...props }: QPInputProps) => {

	const { multiline, prelabel } = props
	// Cast al caso objeto: los reads de radios de abajo solo aplican cuando
	// `style` es un objeto plano (con array serían undefined, igual que en runtime)
	const style = props.style as TextStyle | undefined
	const hasPrefix = !!props.prefixIconName
	const hasSuffix = !!props.suffixIconName
	const hasSuffixText = !!props.suffixText

	// Ocultar/mostrar es estado PROPIO del campo: se toma de la prop una sola vez
	const [isSecure, setIsSecure] = useState(props.secureTextEntry)
	// Anillo de foco: el borde SIEMPRE mide 1 (cambiar el ancho al enfocar movería el layout)
	const [focused, setFocused] = useState(false)
	// El icono del ojo se DERIVA de isSecure (antes era un segundo estado que se
	// actualizaba con el isSecure viejo y quedaba un toque desfasado). Cualquier otro
	// sufijo se lee de la prop en cada render, así sigue sus cambios
	const isEyeToggle = props.suffixIconName === 'eye' || props.suffixIconName === 'eye-slash'
	const suffixIconName = isEyeToggle ? (isSecure ? 'eye' : 'eye-slash') : props.suffixIconName

	// Theme variables, dark and light modes
	const { theme } = useTheme()
	const fill = useFieldFill()
	const borderColor = focused ? theme.colors.primary : theme.isDark ? 'transparent' : theme.colors.border

	// Dirección resaltada: el TextInput acepta Text anidado en lugar de `value`.
	// Un campo de dirección va SIEMPRE por children (resaltado o no): cambiar de
	// `value` a children a mitad de escribir movía el cursor en iOS
	const addressParts = highlightAddress ? splitAddress(props.value) : null

	// Icon style
	const iconStyle = props.iconStyle || 'solid'

	// Change the TextInput between password and text
	const handleSuffixPress = () => {
		if (isEyeToggle) { setIsSecure(secure => !secure) }
	}

	return (
		<View>

			{prelabel && (<Text style={[styles.label, { color: theme.colors.secondaryText, fontSize: theme.typography.fontSize.sm, fontFamily: theme.typography.fontFamily.regular }]}>{prelabel}</Text>)}

			<View style={[styles.container, { backgroundColor: fill, borderColor }, style]}>

				{hasPrefix && (
					<View style={[
						styles.prefixContainer,
						style?.borderTopLeftRadius !== undefined && { borderTopLeftRadius: style.borderTopLeftRadius },
						style?.borderBottomLeftRadius !== undefined && { borderBottomLeftRadius: style.borderBottomLeftRadius }
					]}>
						<FontAwesome6 size={18} color={theme.colors.secondaryText} name={props.prefixIconName} style={styles.icon} iconStyle={iconStyle} />
					</View>
				)}

				<TextInput
					ref={ref}
					{...(highlightAddress ? { autoCapitalize: 'none', autoCorrect: false, spellCheck: false } as const : null)}
					{...props}
					value={highlightAddress ? undefined : props.value}
					secureTextEntry={isSecure}
					onFocus={(e) => { setFocused(true); props.onFocus?.(e) }}
					onBlur={(e) => { setFocused(false); props.onBlur?.(e) }}
					// @ts-expect-error placeholderStyle no existe en TextInputProps (prop no estándar); se conserva tal cual
					placeholderStyle={{ fontFamily: theme.typography.fontFamily.regular }}
					placeholderTextColor={theme.colors.tertiaryText}
					style={[
						styles.input,
						{
							// Campo de dirección: mono desde la primera tecla (cambiar de fuente al cruzar los 12 caracteres saltaría)
							color: theme.colors.primaryText, fontSize: theme.typography.fontSize.md, fontFamily: highlightAddress ? theme.typography.fontFamily.mono : theme.typography.fontFamily.regular,
							height: multiline ? 100 : 50,
							paddingLeft: hasPrefix ? 0 : 15,
							paddingRight: hasSuffix || hasSuffixText ? 0 : 15,
						}
					]}
				>
					{highlightAddress ? <Text>{addressParts ? <AddressSpans parts={addressParts} color={theme.colors.primary} /> : props.value}</Text> : null}
				</TextInput>

				{hasSuffixText && (
					<Text style={[styles.suffixText, { color: theme.colors.secondaryText, fontSize: theme.typography.fontSize.md, fontFamily: theme.typography.fontFamily.medium }]}>
						{props.suffixText}
					</Text>
				)}

				{hasSuffix && (
					<Pressable onPress={handleSuffixPress}>
						<View style={[
							styles.suffixContainer,
							style?.borderTopRightRadius !== undefined && { borderTopRightRadius: style.borderTopRightRadius },
							style?.borderBottomRightRadius !== undefined && { borderBottomRightRadius: style.borderBottomRightRadius }
						]}>
							<FontAwesome6 size={18} color={theme.colors.secondaryText} name={suffixIconName} style={styles.icon} iconStyle="solid" />
						</View>
					</Pressable>
				)}

			</View>

		</View>
	)
}

const styles = StyleSheet.create({
	container: {
		borderRadius: 10,
		marginVertical: 5,
		flexDirection: 'row',
		alignItems: 'center',
		justifyContent: 'space-between',
		borderWidth: 1,
	},
	label: {
		marginBottom: 5,
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
	suffixText: {
		paddingRight: 15,
	},
	input: {
		flex: 1,
		paddingVertical: 12,
		// fontSize and fontFamily set inline via theme
	}
})

export default QPInput