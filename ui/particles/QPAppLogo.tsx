import { View, StyleSheet } from 'react-native'
import FastImage from '@d11/react-native-fast-image'
import FontAwesome6 from '@react-native-vector-icons/fontawesome6'

import { useTheme } from '../../theme/ThemeContext'
import { mediaUrl } from '../../helpers/mediaUrl'
import type { TxApp } from '../../types/domain'

type QPAppLogoProps = {
	app?: Pick<TxApp, 'name' | 'logo'> | null
	size?: number
}

/**
 * Logo de un comercio (App) en squircle, el mismo recorte que `MiniAppIcon`:
 * una App es algo que se abre o cobra, no una persona (los avatares son redondos).
 * `logo` llega como ruta relativa del CDN (`mediaUrl` la resuelve); sin logo,
 * el glifo de tienda sobre la superficie. Lo usan las filas de transacciones,
 * el héroe del detalle y la pantalla Pay.
 */
const QPAppLogo = ({ app, size = 40 }: QPAppLogoProps) => {

	const { theme } = useTheme()
	const uri = mediaUrl(app?.logo)
	const box = { width: size, height: size, borderRadius: Math.round(size * 0.27) }

	return (
		<View style={[styles.clip, box, { backgroundColor: theme.colors.surface }]} accessibilityLabel={app?.name}>
			{uri
				? <FastImage source={{ uri, priority: FastImage.priority.normal, cache: FastImage.cacheControl.immutable }} style={box} resizeMode={FastImage.resizeMode.cover} />
				: <FontAwesome6 name="store" size={Math.round(size * 0.4)} color={theme.colors.primary} iconStyle="solid" />}
		</View>
	)
}

const styles = StyleSheet.create({
	clip: { overflow: 'hidden', borderCurve: 'continuous', alignItems: 'center', justifyContent: 'center' },
})

export default QPAppLogo
