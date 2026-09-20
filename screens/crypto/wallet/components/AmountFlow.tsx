import { StyleSheet, Text } from 'react-native'
import type { StyleProp, TextStyle } from 'react-native'
import { NumberFlow } from 'number-flow-react-native'

// Wallet
import { displayAmount } from '../../../../wallet/chains/units'

type Props = {
	/** Decimal humano exacto ('12.5'), como `AssetView.amount`. */
	amount: string
	style: StyleProp<TextStyle>
	/** '$' para valores USD (2 decimales fijos). */
	prefix?: string
	suffix?: string
	/** Decimales fijos (USD); por defecto los de `displayAmount` según magnitud. */
	fractionDigits?: number
}

/**
 * Cantidad de una fila con el MISMO odómetro que el héroe (QPBalance): al
 * refrescar saldos cada 30s los dígitos ruedan en vez de saltar. Se trunca
 * ANTES con `displayAmount` (nunca hacia arriba) y se pinta con los decimales
 * que quedaron, así el número es idéntico al del detalle, solo que animado.
 * El polvo ("<0.000001") no es un número: Text plano.
 */
const AmountFlow = ({ amount, style, prefix, suffix, fractionDigits }: Props) => {

	const label = fractionDigits === undefined ? displayAmount(amount) : Number(amount).toFixed(fractionDigits)
	if (label.startsWith('<') || !Number.isFinite(Number(label.replace(/,/g, '')))) {
		return <Text style={style} numberOfLines={1}>{prefix}{label}{suffix}</Text>
	}
	const digits = fractionDigits ?? (label.split('.')[1]?.length ?? 0)

	return (
		<NumberFlow
			value={Number(label.replace(/,/g, ''))}
			locales="en-US"
			format={{ minimumFractionDigits: digits, maximumFractionDigits: digits }}
			prefix={prefix}
			suffix={suffix}
			continuous
			// NumberFlow no aplana arrays de estilos: se le entrega un TextStyle plano
			style={StyleSheet.flatten(style) as TextStyle}
		/>
	)
}

export default AmountFlow
