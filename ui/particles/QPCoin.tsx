import { useState, useEffect } from 'react'
import { View, Text, StyleSheet } from 'react-native'

// Image components
import { SvgXml, SvgUri } from 'react-native-svg'

// Caché de SVGs compartida (memoria + AsyncStorage + dedup)
import { getCachedSvgSync, loadSvg } from '../../helpers/svgCache'

// Theme
import { useTheme } from '../../theme/ThemeContext'

const SVG_CACHE_PREFIX = 'svg_cache_'

type QPCoinProps = {
	// Opcional en tipos: el runtime tolera tick vacío/undefined pintando el placeholder
	coin?: string | null
	size?: number
}

/**
 * Circular coin / payment-method logo, fetched as SVG from
 * `media.qvapay.com/coins/{tick}.svg`. The raw SVG XML goes through the shared
 * svgCache (module memory → remounts paint synchronously without flicker,
 * AsyncStorage `svg_cache_` prefix → cold starts, in-flight dedup → one fetch
 * per URL); while the first fetch of the session is in flight, SvgUri streams
 * the same URL as a stopgap. A missing tick or failed/invalid fetch degrades
 * to a lettered placeholder showing the first 3 characters of the tick.
 *
 * @param props
 * @param props.coin - Coin tick or payment-method key (case-insensitive).
 * @param [props.size=32] - Diameter in px.
 */
const QPCoin = ({ coin, size = 32 }: QPCoinProps) => {

	const { theme } = useTheme()

	const coinKey = (coin || '').toLowerCase()
	const coin_image_path = `https://media.qvapay.com/coins/${coinKey}.svg`

	const [svgXml, setSvgXml] = useState<string | null>(() => (coinKey ? getCachedSvgSync(coin_image_path) : null))
	const [failed, setFailed] = useState(false)

	useEffect(() => {
		if (!coinKey) return
		const cached = getCachedSvgSync(coin_image_path)
		if (cached) {
			setSvgXml(cached)
			return
		}
		let cancelled = false
		loadSvg(coin_image_path, `${SVG_CACHE_PREFIX}${coinKey}`).then((xml: string | null) => {
			if (cancelled) return
			if (xml) setSvgXml(xml)
			else setFailed(true)
		})
		return () => { cancelled = true }
	}, [coinKey, coin_image_path])

	// Placeholder while loading or on failure
	if (!coinKey || (!svgXml && failed)) {
		return (
			<View style={[styles.container, styles.placeholder, { width: size, height: size, backgroundColor: theme.colors.elevation }]}>
				<Text style={[styles.placeholderText, { color: theme.colors.secondaryText, fontSize: size * 0.4 }]}>
					{(coin || '?').substring(0, 3).toUpperCase()}
				</Text>
			</View>
		)
	}

	// Cached SVG ready
	if (svgXml) {
		return (
			<View style={[styles.container, { width: size, height: size }]}>
				<SvgXml xml={svgXml} width={size} height={size} style={styles.svg} />
			</View>
		)
	}

	// Loading state — use SvgUri as fallback during first load
	return (
		<View style={[styles.container, { width: size, height: size }]}>
			<SvgUri uri={coin_image_path} width={size} height={size} style={styles.svg} />
		</View>
	)
}

const styles = StyleSheet.create({
	container: {
		borderRadius: 50,
		overflow: 'hidden',
		justifyContent: 'center',
		alignItems: 'center',
	},
	svg: {
		borderRadius: 50,
	},
	placeholder: {
		borderRadius: 50,
	},
	placeholderText: {
		fontWeight: '600',
	},
})

export default QPCoin
