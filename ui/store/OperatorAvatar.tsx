import { View, Text, StyleSheet } from 'react-native'
import FastImage from '@d11/react-native-fast-image'

import { useTheme } from '../../theme/ThemeContext'
import { mediaUrl } from '../../helpers/mediaUrl'
import { ConicHaloWheel } from '../particles/QPAvatar'

const SIZES = { sm: 32, md: 44, lg: 64 }

type Props = {
	/** Brand name; its first letter is the fallback glyph. */
	brand?: string | null
	/** CDN path or URL for the logo. */
	logoUrl?: string | null
	/** Named size. */
	size?: 'sm' | 'md' | 'lg'
	/** Background override (default: theme elevationLight). */
	bgColor?: string | null
	/** Shows the rotating featured halo ring. */
	featured?: boolean
}

/**
 * Squircle brand/operator logo with a lettered fallback.
 * Renders the CDN logo (resolved through the mediaUrl helper) via FastImage
 * with immutable cache; without a logo it shows the brand's first letter.
 * Named sizes map to px (sm 32 / md 44 / lg 64) and the corner radius stays
 * proportional (`dim / 4`).
 *
 * `featured` adds the rotating conic halo (same wheel as the VIP avatar,
 * squircle-clipped) peeking out as a ring around the logo — used for
 * marketplace stores flagged as destacadas.
 */
const OperatorAvatar = ({ brand = '', logoUrl = null, size = 'md', bgColor = null, featured = false }: Props) => {

	const { theme } = useTheme()
	const dim = SIZES[size] || SIZES.md
	const initial = (brand?.[0] || '?').toUpperCase()
	const uri = mediaUrl(logoUrl)

	// Grosor del anillo destacado (proporcional, mínimo legible)
	const ring = featured ? Math.max(2, Math.round(dim / 20)) : 0
	const inner = dim - ring * 2
	const background = bgColor || theme.colors.elevationLight

	const logo = uri ? (
		<FastImage
			source={{ uri, priority: FastImage.priority.normal, cache: FastImage.cacheControl.immutable }}
			style={{ width: '100%', height: '100%' }}
			resizeMode={FastImage.resizeMode.contain}
		/>
	) : (
		<Text style={{ color: theme.colors.primaryText, fontSize: inner * 0.4, fontWeight: '600' }}>{initial}</Text>
	)

	return (
		<View
			style={[
				styles.wrap,
				{
					width: dim,
					height: dim,
					borderRadius: dim / 4,
					backgroundColor: background,
				},
			]}
		>
			{featured && <ConicHaloWheel size={dim} overscan={1.5} />}
			{featured ? (
				// Contenedor interno opaco: deja asomar la rueda como anillo y evita
				// que sangre a través de logos PNG transparentes
				<View
					style={[
						styles.inner,
						{
							top: ring,
							left: ring,
							width: inner,
							height: inner,
							borderRadius: inner / 4,
							backgroundColor: background,
						},
					]}
				>
					{logo}
				</View>
			) : (
				logo
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
	inner: {
		position: 'absolute',
		justifyContent: 'center',
		alignItems: 'center',
		overflow: 'hidden',
	},
})

export default OperatorAvatar
