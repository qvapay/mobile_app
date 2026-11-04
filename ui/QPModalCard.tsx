import { Pressable } from 'react-native'
import type { PressableProps, StyleProp, ViewStyle } from 'react-native'
import type { ReactNode } from 'react'

// Theme
import { useTheme } from '../theme/ThemeContext'
import { useContainerStyles } from '../theme/themeUtils'
import { SurfaceHost } from './SurfaceContext'

type QPModalCardProps = Omit<PressableProps, 'style' | 'children'> & {
	style?: StyleProp<ViewStyle>
	children: ReactNode
}

/**
 * La tarjeta centrada de los modales (`containerStyles.modalCard`, patrón de CLAUDE.md)
 * hecha componente: un Pressable que traga el toque (sin él, tocar dentro llegaría al
 * backdrop y cerraría el modal) y que DECLARA su tono `surface` hacia dentro, para que
 * los campos que aloja (QPInput, QPCodeInput, QPAssetPill, QPAmountCard) se hundan a
 * `background` en vez de desaparecer surface sobre surface. Todo modal con inputs va
 * por aquí; los que no tienen campos pueden seguir con `containerStyles.modalCard`.
 *
 * @param props - Props del Pressable; `style` se funde DESPUÉS de `modalCard`.
 */
const QPModalCard = ({ style, children, onPress = () => { }, ...rest }: QPModalCardProps) => {

	const { theme } = useTheme()
	const containerStyles = useContainerStyles(theme)

	return (
		<Pressable style={[containerStyles.modalCard, style]} onPress={onPress} accessible={false} {...rest}>
			<SurfaceHost tone="surface">{children}</SurfaceHost>
		</Pressable>
	)
}

export default QPModalCard
