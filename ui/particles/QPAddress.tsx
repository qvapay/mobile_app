import { Text } from 'react-native'
import type { StyleProp, TextProps, TextStyle } from 'react-native'

// Theme
import { useTheme } from '../../theme/ThemeContext'
import { monoFont } from '../../theme/themeUtils'

import { splitAddress } from '../../helpers/addressHighlight'
import type { AddressParts } from '../../helpers/addressHighlight'

/**
 * Trozos resaltados de una dirección como hijos de un `<Text>` (o de un
 * `TextInput`, que acepta Text anidado en lugar de `value`). Hereda tamaño y
 * fuente del padre; solo cambia el color de los extremos.
 */
export const AddressSpans = ({ parts, color }: { parts: AddressParts, color: string }) => (
	<>
		<Text style={{ color }}>{parts.head}</Text>
		{parts.middle}
		<Text style={{ color }}>{parts.tail}</Text>
	</>
)

type QPAddressProps = TextProps & {
	address: string | null | undefined
	/** Recorte opcional del medio con `…` (mismos números que `shortAddress`). */
	visible?: { head: number, tail: number }
	/** Color de los extremos; por defecto el primary (acento) del tema. */
	highlightColor?: string
	/** false = sin extremos de color (filas de historial, hashes): solo mono y recorte. */
	highlight?: boolean
}

/**
 * Dirección de wallet en mono con los 6 primeros y 6 últimos caracteres en el
 * color primario (estilo SafePal): son los que el usuario compara a ojo y los
 * que imita el address poisoning. Lo que no parece una dirección (texto libre
 * de un método de pago, Lightning address) se pinta tal cual, en la fuente del
 * padre.
 *
 * @param props.address - Dirección completa (o hash).
 * @param [props.visible] - Recorte del medio, p. ej. `{ head: 10, tail: 10 }`.
 */
const QPAddress = ({ address, visible, highlightColor, highlight = true, style, ...textProps }: QPAddressProps) => {

	const { theme } = useTheme()
	const parts = splitAddress(address, { visible })

	if (!parts) return <Text {...textProps} style={style}>{address}</Text>

	return (
		<Text {...textProps} style={[style, monoFont(theme, style)]}>
			{highlight ? <AddressSpans parts={parts} color={highlightColor ?? theme.colors.primary} /> : parts.head + parts.middle + parts.tail}
		</Text>
	)
}

/** Hueco para la dirección en una frase traducida: `t(key, { address: ADDRESS_SLOT })`. */
export const ADDRESS_SLOT = '⁣'

/**
 * Frase traducida con una dirección dentro ("Para 0x12…ab"): solo la dirección
 * va en mono, el resto hereda la fuente del `<Text>` padre. Hijo de un Text.
 *
 * @param props.text - La frase, traducida con `{ address: ADDRESS_SLOT }`.
 * @param props.address - Dirección completa.
 * @param props.visible - Recorte del medio.
 * @param props.style - Estilo del Text padre: decide el peso de la mono.
 */
export const InlineAddress = ({ text, address, visible, style }: { text: string, address: string, visible?: { head: number, tail: number }, style?: StyleProp<TextStyle> }) => {

	const { theme } = useTheme()
	// Una traducción sin el hueco se pinta tal cual: nunca se añade la dirección por fuera
	if (!text.includes(ADDRESS_SLOT)) return <>{text}</>
	const [before, after = ''] = text.split(ADDRESS_SLOT)
	const parts = splitAddress(address, { visible })

	return (
		<>
			{before}
			{parts ? <Text style={monoFont(theme, style)}>{parts.head + parts.middle + parts.tail}</Text> : address}
			{after}
		</>
	)
}

export default QPAddress
