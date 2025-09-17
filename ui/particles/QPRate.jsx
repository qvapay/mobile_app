import { useState } from 'react'
import { View, TouchableOpacity } from 'react-native'

// Theme
import { useTheme } from '../../theme/ThemeContext'

// Icons
import FontAwesome6 from '@react-native-vector-icons/fontawesome6'

/**
 * Componente de rating con estrellas FontAwesome6
 * @param {Object} props - Las propiedades del componente
 * @param {number} props.value - Valor del rating (0-5)
 * @param {Function} props.onRate - Función callback que se ejecuta cuando se selecciona una estrella
 * @param {boolean} props.readOnly - Si es true, no permite interacción (solo muestra el rating)
 * @param {number} props.size - Tamaño de las estrellas (default: 20)
 * @param {string} props.color - Color de las estrellas activas (default: gold del tema)
 * @param {string} props.inactiveColor - Color de las estrellas inactivas (default: border del tema)
 * @param {number} props.spacing - Espaciado entre estrellas (default: 4)
 * @param {number} props.maxRating - Número máximo de estrellas (default: 5)
 */
const QPRate = ({
	value = 0,
	onRate = () => { },
	readOnly = false,
	size = 20,
	color = null,
	inactiveColor = null,
	spacing = 4,
	maxRating = 5
}) => {

	const { theme } = useTheme()
	const [hoveredStar, setHoveredStar] = useState(null)

	// Colores por defecto del tema
	const activeColor = color || theme.colors.gold
	const inactiveColorFinal = inactiveColor || theme.colors.border

	// Manejar la selección de estrella
	const handleStarPress = (starIndex) => {
		if (!readOnly && onRate) {
			const newRating = starIndex + 1
			onRate(newRating);
		}
	}

	// Renderizar una estrella individual
	const renderStar = (index) => {
		const isActive = index < value
		const isHovered = hoveredStar !== null && index <= hoveredStar
		const starColor = (isActive || isHovered) ? activeColor : inactiveColorFinal

		return (
			<TouchableOpacity
				key={index}
				onPress={() => handleStarPress(index)}
				onPressIn={() => !readOnly && setHoveredStar(index)}
				onPressOut={() => !readOnly && setHoveredStar(null)}
				activeOpacity={readOnly ? 1 : 0.7}
				style={{
					marginRight: index < maxRating - 1 ? spacing : 0,
				}}
				disabled={readOnly}
			>
				<FontAwesome6 name="star" size={size} color={starColor} solid={isActive || isHovered} />
			</TouchableOpacity>
		);
	};

	return (
		<View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-start' }}>
			{Array.from({ length: maxRating }, (_, index) => renderStar(index))}
		</View>
	)
}

export default QPRate
