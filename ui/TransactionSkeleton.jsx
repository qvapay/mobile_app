import { View } from 'react-native'

// Theme Context
import { useTheme } from '../theme/ThemeContext'
import { useContainerStyles } from '../theme/themeUtils'

// Particles
import QPSkeleton from './particles/QPSkeleton'

// Skeleton row mirroring QPTransaction's layout (avatar + two lines + amount)
const TransactionSkeleton = ({ index = 0, totalItems = 0 }) => {

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
	}

	return (
		<View style={[containerStyles.box, { justifyContent: 'space-between' }, containerStyle]}>
			<View style={{ flexDirection: 'row', alignItems: 'center', gap: 15 }}>
				<QPSkeleton width={48} height={48} borderRadius={24} />
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
