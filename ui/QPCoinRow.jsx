import { StyleSheet, Text, View } from 'react-native'
import { useTheme } from '../theme/ThemeContext'
import { createTextStyles } from '../theme/themeUtils'
import QPCoin from './particles/QPCoin'
import { formatCoinAmount, formatCoinPrice } from '../helpers/coinFormat'

/**
 * Fila de moneda del selector (QPCoinPicker y la pantalla Add).
 *
 * Estructura de dos columnas, como en los selectores de activo de la industria
 * (Revolut/Binance): a la izquierda la identidad (logo, nombre, red y las
 * condiciones en una línea legible) y a la derecha el número que decide —
 * cuánto vas a recibir — con el precio unitario debajo. Sustituye a la tabla
 * de cuatro columnas ("MIN IN / FEE IN / PRECIO / APROX."), que apretaba
 * cuatro cifras del mismo tamaño y usaba jerga en inglés.
 *
 * @param {object} props
 * @param {object} props.coin - Coin from `coinsApi` (name, logo, price, network, fee_in/out, min_in/out).
 * @param {string} [props.amount] - Importe a convertir para la cifra de la derecha.
 * @param {'in'|'out'} [props.direction='in'] - Selecciona fee_in/min_in vs fee_out/min_out.
 * @param {boolean} [props.showFees=true] - Oculta condiciones y conversión (modo P2P: solo identidad).
 */
const QPCoinRow = ({ coin, amount = '', direction = 'in', showFees = true }) => {

	const { theme } = useTheme()
	const textStyles = createTextStyles(theme)

	const min = direction === 'in' ? coin.min_in : coin.min_out
	const fee = direction === 'in' ? coin.fee_in : coin.fee_out

	const amountNum = parseFloat(amount) || 0
	const priceNum = parseFloat(coin.price) || 0
	const converted = priceNum > 0 ? amountNum / priceNum : 0

	// Condiciones en una sola línea y en español, en vez de dos columnas con
	// etiquetas tipo "FEE IN" / "MIN OUT"
	const terms = []
	if (Number(fee) > 0) terms.push(`${fee}% comisión`)
	if (Number(min) > 0) terms.push(`mín. $${min}`)

	// El precio solo aporta cuando la moneda no va 1:1 con el dólar: en los
	// raíles fiat (banco, Transfermóvil…) mostrar "$1.0000" era puro ruido
	const priceLabel = priceNum > 0 && Math.abs(priceNum - 1) > 0.0001 ? formatCoinPrice(coin.price) : null

	return (
		<View style={styles.container}>
			<QPCoin coin={coin.logo} size={40} />

			<View style={styles.info}>
				<View style={styles.nameRow}>
					<Text style={[textStyles.h5, { fontFamily: theme.typography.fontFamily.medium }]} numberOfLines={1}>
						{coin.name}
					</Text>
					{coin.network && (
						<View style={[styles.networkBadge, { backgroundColor: theme.colors.elevation }]}>
							<Text style={{ color: theme.colors.secondaryText, fontSize: theme.typography.fontSize.xs, fontFamily: theme.typography.fontFamily.medium }}>
								{coin.network}
							</Text>
						</View>
					)}
				</View>

				{showFees && terms.length > 0 && (
					<Text style={[textStyles.caption, { color: theme.colors.tertiaryText }]} numberOfLines={1}>
						{terms.join(' · ')}
					</Text>
				)}
			</View>

			{/* Lo que decide la elección: cuánto recibes */}
			{showFees && (
				<View style={styles.trailing}>
					{amountNum > 0 && converted > 0 ? (
						<Text style={[textStyles.h5, { color: theme.colors.primaryText, fontFamily: theme.typography.fontFamily.semiBold }]} numberOfLines={1}>
							{formatCoinAmount(converted)}
						</Text>
					) : null}
					{priceLabel && (
						<Text style={[textStyles.caption, { color: theme.colors.tertiaryText }]} numberOfLines={1}>
							{priceLabel}
						</Text>
					)}
				</View>
			)}
		</View>
	)
}

const styles = StyleSheet.create({
	container: {
		flexDirection: 'row',
		alignItems: 'center',
		flex: 1,
		gap: 12,
	},
	info: {
		flex: 1,
		gap: 2,
	},
	nameRow: {
		flexDirection: 'row',
		alignItems: 'center',
		gap: 6,
	},
	networkBadge: {
		paddingHorizontal: 7,
		paddingVertical: 2,
		borderRadius: 6,
		borderCurve: 'continuous',
	},
	trailing: {
		alignItems: 'flex-end',
		gap: 2,
	},
})

export default QPCoinRow
