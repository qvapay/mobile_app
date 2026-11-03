import { View, Text, StyleSheet, type StyleProp, type ViewStyle } from 'react-native'
import FontAwesome6 from '@react-native-vector-icons/fontawesome6'

import { useTheme } from '../../theme/ThemeContext'
import { useTextStyles } from '../../theme/themeUtils'
import MiniAppIcon from './MiniAppIcon'

type Props = {
	/** Nombre REGISTRADO de la mini-app: la mini-app no puede cambiarlo (anti-suplantación). */
	name: string
	icon: string | null
	/** El que pone la mini-app con `ui.header.set`; vacío = una sola línea. */
	subtitle?: string | null
	/** Tinta sobre una barra teñida por la mini-app (`ui.colors.set`); sin ella, los colores del tema. */
	ink?: string | null
	style?: StyleProp<ViewStyle>
}

/**
 * Identidad de la mini-app en su barra: logo y nombre registrados con el check y, debajo, el
 * subtítulo de la mini-app. La comparten la barra propia (Android, iOS < 26) y la nativa de
 * iOS 26+, donde va como item `custom` junto al botón de cerrar/atrás.
 */
const MiniAppHeaderTitle = ({ name, icon, subtitle, ink, style }: Props) => {
	const { theme } = useTheme()
	const textStyles = useTextStyles(theme)
	return (
		<View style={[styles.wrap, style]}>
			<MiniAppIcon app={{ name, icon }} size={22} />
			<View style={styles.text}>
				<View style={styles.row}>
					<Text style={[textStyles.h5, styles.name, { color: ink ?? theme.colors.primaryText }]} numberOfLines={1}>{name}</Text>
					<FontAwesome6 name="circle-check" size={12} color={ink ?? theme.colors.primary} iconStyle="solid" style={styles.verified} />
				</View>
				{subtitle ? (
					<Text style={[textStyles.h7, ink ? { color: ink, opacity: 0.7 } : { color: theme.colors.secondaryText }]} numberOfLines={1}>{subtitle}</Text>
				) : null}
			</View>
		</View>
	)
}

const styles = StyleSheet.create({
	wrap: { flexDirection: 'row', alignItems: 'center' },
	text: { flexShrink: 1, marginLeft: 8 },
	row: { flexDirection: 'row', alignItems: 'center' },
	name: { flexShrink: 1 },
	verified: { marginLeft: 6 },
})

export default MiniAppHeaderTitle
