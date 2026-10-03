import { Text } from 'react-native'
import type { TextProps } from 'react-native'

// Theme
import { useTheme } from '../../theme/ThemeContext'

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
}

/**
 * Dirección de wallet con los 6 primeros y 6 últimos caracteres en el color
 * primario (estilo SafePal): son los que el usuario compara a ojo y los que
 * imita el address poisoning. Lo que no parece una dirección (texto libre de
 * un método de pago, Lightning address) se pinta tal cual.
 *
 * @param props.address - Dirección completa.
 * @param [props.visible] - Recorte del medio, p. ej. `{ head: 10, tail: 10 }`.
 */
const QPAddress = ({ address, visible, highlightColor, ...textProps }: QPAddressProps) => {

	const { theme } = useTheme()
	const parts = splitAddress(address, { visible })

	return (
		<Text {...textProps}>
			{parts ? <AddressSpans parts={parts} color={highlightColor ?? theme.colors.primary} /> : address}
		</Text>
	)
}

export default QPAddress
