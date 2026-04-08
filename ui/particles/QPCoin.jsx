import { useState, useEffect } from 'react'
import { View, Text, StyleSheet } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'

// Image components
import { SvgXml, SvgUri } from 'react-native-svg'

// Theme
import { useTheme } from '../../theme/ThemeContext'

const SVG_CACHE_PREFIX = 'svg_cache_'

const QPCoin = ({ coin, size = 32 }) => {

	const { theme } = useTheme()
	const [svgXml, setSvgXml] = useState(null)
	const [failed, setFailed] = useState(false)

	const coinKey = (coin || '').toLowerCase()
	const coin_image_path = `https://media.qvapay.com/coins/${coinKey}.svg`

	useEffect(() => {

		if (!coinKey) return
		let cancelled = false
		const cacheKey = `${SVG_CACHE_PREFIX}${coinKey}`

		const loadSvg = async () => {
			// Check cache first
			try {
				const cached = await AsyncStorage.getItem(cacheKey)
				if (cached && !cancelled) {
					setSvgXml(cached)
					return
				}
			} catch { /* cache miss */ }

			// Fetch from network
			try {
				const response = await fetch(coin_image_path)
				const xml = await response.text()
				if (!cancelled && xml && xml.includes('<svg')) {
					setSvgXml(xml)
					AsyncStorage.setItem(cacheKey, xml)
				} else if (!cancelled) { setFailed(true) }
			} catch { if (!cancelled) setFailed(true) }
		}

		loadSvg()
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
