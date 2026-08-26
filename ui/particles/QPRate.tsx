import { useState } from 'react'
import { View } from 'react-native'
import QPPressable from './QPPressable'

// Theme
import { useTheme } from '../../theme/ThemeContext'

// Icons
import FontAwesome6 from '@react-native-vector-icons/fontawesome6'

/**
 * FontAwesome6 star rating row, used both as display and input (P2P offer rating).
 * Press-and-hold previews the selection: `onPressIn` lights every star up to the
 * touched one before `onRate` commits on release. Active/previewed stars render
 * solid, the rest as regular outlines. `readOnly` freezes it into a pure display.
 *
 * @param props
 * @param props.value - Current rating (0 to maxRating).
 * @param props.onRate - Called with the selected rating (1-based).
 * @param props.readOnly - Display-only; disables interaction.
 * @param props.size - Star size in px.
 * @param props.color - Active star color (default: theme gold).
 * @param props.inactiveColor - Inactive star color (default: theme border).
 * @param props.spacing - Gap between stars in px.
 * @param props.maxRating - Number of stars.
 */
type Props = {
	value?: number
	onRate?: (rating: number) => void
	readOnly?: boolean
	size?: number
	color?: string | null
	inactiveColor?: string | null
	spacing?: number
	maxRating?: number
}

const QPRate = ({
	value = 0,
	onRate = () => { },
	readOnly = false,
	size = 20,
	color = null,
	inactiveColor = null,
	spacing = 4,
	maxRating = 5
}: Props) => {

	const { theme } = useTheme()
	const [hoveredStar, setHoveredStar] = useState<number | null>(null)

	// Colores por defecto del tema
	const activeColor = color || theme.colors.gold
	const inactiveColorFinal = inactiveColor || theme.colors.border

	// Manejar la selección de estrella
	const handleStarPress = (starIndex: number) => {
		if (!readOnly && onRate) {
			const newRating = starIndex + 1
			onRate(newRating);
		}
	}

	// Renderizar una estrella individual
	const renderStar = (index: number) => {
		const isActive = index < value
		const isHovered = hoveredStar !== null && index <= hoveredStar
		const starColor = (isActive || isHovered) ? activeColor : inactiveColorFinal

		return (
			<QPPressable
				key={index}
				onPress={() => handleStarPress(index)}
				onPressIn={() => !readOnly && setHoveredStar(index)}
				onPressOut={() => !readOnly && setHoveredStar(null)}
				style={{
					marginRight: index < maxRating - 1 ? spacing : 0,
				}}
				disabled={readOnly}
			>
				<FontAwesome6 name="star" size={size} color={starColor} iconStyle={(isActive || isHovered) ? "solid" : "regular"} />
			</QPPressable>
		);
	};

	return (
		<View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-start' }}>
			{Array.from({ length: maxRating }, (_, index) => renderStar(index))}
		</View>
	)
}

export default QPRate
