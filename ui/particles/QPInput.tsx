import { useState } from 'react'
import type { ComponentType, Ref } from 'react'
import { StyleSheet, View, TextInput, Pressable, Text } from 'react-native'
import type { StyleProp, TextInputProps, TextStyle } from 'react-native'

// Theme
import { useTheme } from '../../theme/ThemeContext'

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
	ref?: Ref<TextInput>
	prelabel?: string
	prefixIconName?: string
	suffixIconName?: string
	iconStyle?: 'solid' | 'regular' | 'brand'
	/** Campo de dirección de wallet: resalta sus extremos y apaga autocorrección/mayúsculas. */
	highlightAddress?: boolean
}

/**
 * Themed text input with optional prelabel and prefix/suffix FontAwesome6 icons.
 * Passing `suffixIconName` as 'eye'/'eye-slash' turns the suffix into a password
 * visibility toggle that flips `secureTextEntry`. Light mode adds a hairline
 * primary border; dark surfaces stay borderless per house style. React 19: `ref`
 * arrives as a regular prop and is forwarded straight to the TextInput (no
 * forwardRef). All unrecognized props pass through to the TextInput.
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

	// States
	const [isSecure, setIsSecure] = useState(props.secureTextEntry)
	const [suffixIconName, setSuffixIconName] = useState(props.suffixIconName)

	// Theme variables, dark and light modes
	const { theme } = useTheme()

	// Dirección resaltada: el TextInput acepta Text anidado en lugar de `value`.
	// Un campo de dirección va SIEMPRE por children (resaltado o no): cambiar de
	// `value` a children a mitad de escribir movía el cursor en iOS
	const addressParts = highlightAddress ? splitAddress(props.value) : null

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
		<View>

			{prelabel && (<Text style={[styles.label, { color: theme.colors.secondaryText, fontSize: theme.typography.fontSize.sm, fontFamily: theme.typography.fontFamily.regular }]}>{prelabel}</Text>)}

			<View style={[styles.container, { backgroundColor: theme.colors.surface }, !theme.isDark ? { borderColor: theme.colors.primary, borderWidth: 0.3 } : {}, style]}>

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
					// @ts-expect-error placeholderStyle no existe en TextInputProps (prop no estándar); se conserva tal cual
					placeholderStyle={{ fontFamily: theme.typography.fontFamily.regular }}
					placeholderTextColor={theme.colors.tertiaryText}
					style={[
						styles.input,
						{
							color: theme.colors.primaryText, fontSize: theme.typography.fontSize.md, fontFamily: theme.typography.fontFamily.regular,
							height: multiline ? 100 : 50,
							paddingLeft: hasPrefix ? 0 : 15,
							paddingRight: hasSuffix ? 0 : 15,
						}
					]}
				>
					{highlightAddress ? <Text>{addressParts ? <AddressSpans parts={addressParts} color={theme.colors.primary} /> : props.value}</Text> : null}
				</TextInput>

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
		// borderWidth: 0.5,
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
	input: {
		flex: 1,
		paddingVertical: 12,
		// fontSize and fontFamily set inline via theme
	}
})

export default QPInput