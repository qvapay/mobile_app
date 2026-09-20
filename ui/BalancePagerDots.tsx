import { StyleSheet, View } from 'react-native'

// Theme
import { useTheme } from '../theme/ThemeContext'

type Props = {
	count: number
	activeIndex?: number
}

/**
 * Puntos de paginación bajo el héroe de saldo. Con una sola página no pinta
 * puntos pero RESERVA su fila: así el bloque saldo + botonera mide lo mismo
 * en el Home (pager de 2) y en la wallet (1 página).
 */
const BalancePagerDots = ({ count, activeIndex = 0 }: Props) => {

	const { theme } = useTheme()

	return (
		<View style={styles.container}>
			{count > 1 && Array.from({ length: count }, (_, i) => (
				<View key={i} style={[styles.dot, { backgroundColor: activeIndex === i ? theme.colors.primaryText : theme.colors.tertiaryText + '40' }]} />
			))}
		</View>
	)
}

const styles = StyleSheet.create({
	container: {
		flexDirection: 'row',
		justifyContent: 'center',
		alignItems: 'center',
		gap: 6,
		height: 6,
		marginBottom: 4,
	},
	dot: {
		width: 6,
		height: 6,
		borderRadius: 3,
	},
})

export default BalancePagerDots
