import { View } from 'react-native'

// Theme Context
import { useTheme } from '../theme/ThemeContext'
import { useContainerStyles } from '../theme/themeUtils'

// Particles
import QPSkeleton from './particles/QPSkeleton'

type TransactionSkeletonProps = {
	index?: number
	totalItems?: number
}

/**
 * Loading skeleton row mirroring QPTransaction's layout (avatar + two text
 * lines + amount), shown on Home while the transaction list loads. Applies
 * the same position-based corner rounding as the real rows — only the first
 * row rounds its top corners and only the last rounds the bottom — so the
 * skeleton group reads as one card.
 *
 * @param props
 * @param [props.index=0] - Row position within the skeleton group.
 * @param [props.totalItems=0] - Total skeleton rows rendered.
 */
const TransactionSkeleton = ({ index = 0, totalItems = 0 }: TransactionSkeletonProps) => {

	// Context
	const { theme } = useTheme()
	const containerStyles = useContainerStyles(theme)

	// Same position-based corner rounding as QPTransaction
	const isFirst = index === 0
	const isLast = index === totalItems - 1
	const containerStyle = {
		borderRadius: 0,
		borderTopLeftRadius: isFirst ? 10 : 0,
		borderTopRightRadius: isFirst ? 10 : 0,
		borderBottomLeftRadius: isLast ? 10 : 0,
		borderBottomRightRadius: isLast ? 10 : 0,
		marginBottom: isLast ? 10 : 0,
		// Mismo aire por fila que QPTransaction para que no salte al hidratar
		paddingHorizontal: 12,
		paddingVertical: 12,
	}

	return (
		<View style={[containerStyles.box, { justifyContent: 'space-between' }, containerStyle]}>
			<View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
				<QPSkeleton width={40} height={40} borderRadius={20} />
				<View style={{ gap: 6 }}>
					<QPSkeleton width={130} height={14} />
					<QPSkeleton width={80} height={10} />
				</View>
			</View>
			<QPSkeleton width={56} height={14} />
		</View>
	)
}

export default TransactionSkeleton
