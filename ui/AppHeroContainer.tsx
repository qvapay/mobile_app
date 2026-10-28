import { View, Text, StyleSheet, Platform } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { useTheme } from '../theme/ThemeContext'
import { useTextStyles } from '../theme/themeUtils'
import QPAppLogo from './particles/QPAppLogo'
import type { TxApp } from '../types/domain'

/** Alto del header nativo; espejo de `ProfileContainer` (sin portada ambos dejan este hueco). */
const HEADER_HEIGHT = Platform.OS === 'ios' ? 44 : 56

/**
 * Cabecera del detalle de una transacción hecha con una App (cobro de un
 * comercio o mini-app, o pago de la App al usuario): logo del comercio,
 * nombre, descripción y web. Hermano de `ProfileContainer`, que es para
 * personas: aquí la contraparte es el comercio, como en la web, y el dueño
 * de la App sigue en las filas «Pagado por / Para» de abajo.
 */
const AppHeroContainer = ({ app }: { app: TxApp }) => {

	const { theme } = useTheme()
	const textStyles = useTextStyles(theme)
	const insets = useSafeAreaInsets()

	return (
		<View style={styles.container} testID="app-hero">
			{/* La pantalla pinta desde el borde físico (header transparente): hueco para barra + header */}
			<View style={{ height: insets.top + HEADER_HEIGHT }} />
			<QPAppLogo app={app} size={120} />
			<Text style={[textStyles.h1, styles.name]} numberOfLines={2}>{app.name}</Text>
			{app.desc ? <Text style={[textStyles.h4, styles.desc, { color: theme.colors.secondaryText }]} numberOfLines={2}>{app.desc}</Text> : null}
			{app.url ? <Text style={[textStyles.caption, { color: theme.colors.tertiaryText }]} numberOfLines={1}>{app.url}</Text> : null}
		</View>
	)
}

const styles = StyleSheet.create({
	container: { alignItems: 'center', gap: 6, paddingHorizontal: 24 },
	name: { marginTop: 10, textAlign: 'center' },
	desc: { textAlign: 'center' },
})

export default AppHeroContainer
