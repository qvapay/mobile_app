import { View, Text, StyleSheet } from 'react-native'
import FastImage from '@d11/react-native-fast-image'

import { useTheme } from '../../theme/ThemeContext'
import { mediaUrl } from '../../helpers/mediaUrl'

const SIZES = { sm: 32, md: 44, lg: 64 }

/**
 * Squircle brand/operator logo with a lettered fallback.
 * Renders the CDN logo (resolved through the mediaUrl helper) via FastImage
 * with immutable cache; without a logo it shows the brand's first letter.
 * Named sizes map to px (sm 32 / md 44 / lg 64) and the corner radius stays
 * proportional (`dim / 4`).
 *
 * @param {object} props
 * @param {string} props.brand - Brand name; its first letter is the fallback glyph.
 * @param {string} [props.logoUrl] - CDN path or URL for the logo.
 * @param {'sm'|'md'|'lg'} [props.size='md'] - Named size.
 * @param {string} [props.bgColor] - Background override (default: theme elevationLight).
 */
const OperatorAvatar = ({ brand = '', logoUrl = null, size = 'md', bgColor = null }) => {

	const { theme } = useTheme()
	const dim = SIZES[size] || SIZES.md
	const initial = (brand?.[0] || '?').toUpperCase()
	const uri = mediaUrl(logoUrl)

	return (
		<View
			style={[
				styles.wrap,
				{
					width: dim,
					height: dim,
					borderRadius: dim / 4,
					backgroundColor: bgColor || theme.colors.elevationLight,
				},
			]}
		>
			{uri ? (
				<FastImage
					source={{ uri, priority: FastImage.priority.normal, cache: FastImage.cacheControl.immutable }}
					style={{ width: '100%', height: '100%' }}
					resizeMode={FastImage.resizeMode.contain}
				/>
			) : (
				<Text style={{ color: theme.colors.primaryText, fontSize: dim * 0.4, fontWeight: '600' }}>{initial}</Text>
			)}
		</View>
	)
}

const styles = StyleSheet.create({
	wrap: {
		justifyContent: 'center',
		alignItems: 'center',
		overflow: 'hidden',
	},
})

export default OperatorAvatar
