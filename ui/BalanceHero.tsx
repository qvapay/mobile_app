import type { ReactNode } from 'react'
import { Pressable, StyleSheet, View } from 'react-native'

// Theme
import { useTheme } from '../theme/ThemeContext'
import { createTextStyles } from '../theme/themeUtils'

// Particles
import QPBalance from './particles/QPBalance'
import QPFitText from './particles/QPFitText'
import QPSkeleton from './particles/QPSkeleton'

/** Alto del héroe de saldo (sin márgenes). Home y wallet lo comparten: no tocar en uno solo. */
export const BALANCE_HERO_HEIGHT = 120

type Props = {
	/** Importe crudo en USD (rueda con el odómetro de QPBalance). */
	amount: number
	showBalance: boolean
	onPress?: () => void
	/** Sin dato todavía: skeleton del mismo alto que las cifras, sin mover el layout. */
	loading?: boolean
	/** Ancho explícito (páginas del pager del Home); por defecto, el del contenedor. */
	width?: number
	/** Bajo la cifra (p. ej. la tasa de ahorro). */
	children?: ReactNode
}

/**
 * Héroe de saldo de la app: cifra de 60 con odómetro, centrada en una caja de
 * 120 de alto. Oculto (`privacy.showBalance`) pinta asteriscos del largo del
 * importe. Es LA pieza que comparten la cuenta del Home, su página de ahorros
 * y el total de la wallet self-custody: el mismo look, alto y comportamiento.
 */
const BalanceHero = ({ amount, showBalance, onPress, loading = false, width, children }: Props) => {

	const { theme } = useTheme()
	const textStyles = createTextStyles(theme)
	const hidden = '*'.repeat(Math.max(3, Math.abs(amount).toFixed(2).length))

	return (
		<Pressable onPress={onPress} style={[styles.page, width !== undefined && { width }]} disabled={!onPress}>
			{loading ? (
				<QPSkeleton width={200} height={60} borderRadius={14} />
			) : showBalance ? (
				<View style={styles.content}>
					<QPBalance amount={amount} fontSize={60} theme={theme} />
					{children}
				</View>
			) : (
				<QPFitText style={[textStyles.amount, { color: theme.colors.primaryText }]}>{hidden}</QPFitText>
			)}
		</Pressable>
	)
}

const styles = StyleSheet.create({
	page: {
		flexDirection: 'row',
		alignItems: 'center',
		justifyContent: 'center',
		height: BALANCE_HERO_HEIGHT,
		marginVertical: 10,
	},
	content: {
		alignItems: 'center',
	},
})

export default BalanceHero
