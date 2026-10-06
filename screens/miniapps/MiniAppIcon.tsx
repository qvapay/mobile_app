import { View, Text, StyleSheet } from 'react-native'
import FastImage from '@d11/react-native-fast-image'

import QPSvgUri from '../../ui/particles/QPSvgUri'
import { useTheme } from '../../theme/ThemeContext'
import { mediaUrl } from '../../helpers/mediaUrl'
import type { MiniApp } from '../../types/domain'

/**
 * Icono de una mini-app: squircle (es una acción, se abre) con su imagen o,
 * si no tiene, la inicial del nombre sobre el color primario.
 * SVG por `QPSvgUri` (caché de 3 capas), el resto por FastImage.
 */
const MiniAppIcon = ({ app, size = 52 }: { app: Pick<MiniApp, 'name' | 'icon'>, size?: number }) => {

	const { theme } = useTheme()
	const uri = app.icon ? mediaUrl(app.icon) : null
	const radius = Math.round(size * 0.27)
	const box = { width: size, height: size, borderRadius: radius }

	if (uri) {
		return (
			<View style={[styles.clip, box, { backgroundColor: theme.colors.surface }]}>
				{/\.svg($|\?)/i.test(uri)
					? <QPSvgUri uri={uri} width={size} height={size} />
					: <FastImage source={{ uri }} style={box} resizeMode={FastImage.resizeMode.cover} />}
			</View>
		)
	}

	return (
		<View style={[styles.clip, styles.center, box, { backgroundColor: theme.colors.primary }]}>
			<Text style={{ color: theme.colors.buttonText, fontSize: size * 0.42, fontFamily: theme.typography.fontFamily.medium }}>
				{(app.name || '?').trim().charAt(0).toUpperCase()}
			</Text>
		</View>
	)
}

const styles = StyleSheet.create({
	clip: { overflow: 'hidden', borderCurve: 'continuous' },
	center: { alignItems: 'center', justifyContent: 'center' },
})

export default MiniAppIcon
