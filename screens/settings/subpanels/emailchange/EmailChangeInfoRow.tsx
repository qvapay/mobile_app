import { StyleSheet, Text, View } from 'react-native'

// Theme
import { useTheme } from '../../../../theme/ThemeContext'
import { scaleType, useTextStyles } from '../../../../theme/themeUtils'

// Icons
import FontAwesome6 from '@react-native-vector-icons/fontawesome6'

// Tipos
import type { FontAwesome6SolidIconName } from '@react-native-vector-icons/fontawesome6'

type Props = {
	icon: FontAwesome6SolidIconName
	text: string
	/** Segunda línea más tenue (p. ej. desde cuándo se podrá). */
	detail?: string
	/** Tinte del tile; por defecto el primario. */
	tint?: string
	/** Texto en el color principal en vez del secundario (cuando la fila ES el mensaje). */
	strong?: boolean
}

/**
 * Fila de aviso del cambio de correo: el tile tintado de 30×30 de los ajustes y el texto al
 * lado. El ancho fijo del tile alinea todos los textos aunque cada icono mida distinto, y el
 * centrado vertical lo mantiene a la altura de un texto de una o de varias líneas.
 */
const EmailChangeInfoRow = ({ icon, text, detail, tint, strong = false }: Props) => {

	const { theme } = useTheme()
	const textStyles = useTextStyles(theme)
	const color = tint ?? theme.colors.primary
	const lineHeight = scaleType(theme, 20)

	return (
		<View style={styles.row}>
			<View style={[styles.tile, { backgroundColor: color + '1F' }]}>
				<FontAwesome6 name={icon} size={14} color={color} iconStyle="solid" />
			</View>
			<View style={styles.texts}>
				<Text style={[textStyles.body, { color: strong ? theme.colors.primaryText : theme.colors.secondaryText, lineHeight }]}>{text}</Text>
				{!!detail && <Text style={[textStyles.body, styles.detail, { color: theme.colors.secondaryText, lineHeight }]}>{detail}</Text>}
			</View>
		</View>
	)
}

const styles = StyleSheet.create({
	row: {
		flexDirection: 'row',
		alignItems: 'center',
		gap: 12,
	},
	tile: {
		width: 30,
		height: 30,
		borderRadius: 9,
		borderCurve: 'continuous',
		alignItems: 'center',
		justifyContent: 'center',
	},
	texts: {
		flex: 1,
	},
	detail: {
		marginTop: 4,
	},
})

export default EmailChangeInfoRow
