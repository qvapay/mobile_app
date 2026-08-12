import { View, Text, StyleSheet } from 'react-native'
import FastImage from '@d11/react-native-fast-image'

import QPPressable from '../particles/QPPressable'
import OperatorAvatar from './OperatorAvatar'
import { useTheme } from '../../theme/ThemeContext'
import { createTextStyles } from '../../theme/themeUtils'
import { mediaUrl } from '../../helpers/mediaUrl'

/**
 * Marketplace store card: cover (banner → first product photo → flat surface)
 * with the shop logo floating over it, then name and a meta line with rating,
 * product count and sales. Mirrors the web's StoreTile. Light mode adds a
 * hairline border; dark surfaces stay borderless (house style).
 *
 * @param {object} props
 * @param {object} props.store - Public store: slug, name, logo, banner, rating_avg, sales_count, product_count, product_images, featured.
 * @param {function} props.onPress - Tap handler.
 * @param {object|Array} [props.style] - Extra tile styles.
 */
const StoreTile = ({ store, onPress, style }) => {

	const { theme } = useTheme()
	const textStyles = createTextStyles(theme)

	const cover = mediaUrl(store?.banner) || mediaUrl(store?.product_images?.[0])
	const rating = store?.rating_avg != null && Number(store.rating_avg) > 0 ? Number(store.rating_avg).toFixed(1) : null
	const meta = [
		rating ? `★ ${rating}` : null,
		store?.product_count ? `${store.product_count} ${store.product_count === 1 ? 'producto' : 'productos'}` : null,
		store?.sales_count ? `${store.sales_count} ${store.sales_count === 1 ? 'venta' : 'ventas'}` : null,
	].filter(Boolean).join(' · ')

	return (
		<QPPressable
			onPress={onPress}
			style={[
				styles.tile,
				{ backgroundColor: theme.colors.surface },
				theme.mode === 'light' && { borderWidth: 0.5, borderColor: theme.colors.border },
				style,
			]}
		>
			<View style={[styles.cover, { backgroundColor: theme.colors.elevationLight }]}>
				{cover && (
					<FastImage
						source={{ uri: cover, priority: FastImage.priority.normal, cache: FastImage.cacheControl.immutable }}
						style={StyleSheet.absoluteFill}
						resizeMode={FastImage.resizeMode.cover}
					/>
				)}
				{store?.featured && (
					<View style={[styles.featuredBadge, { backgroundColor: theme.colors.primary }]}>
						<Text style={[textStyles.caption, { color: theme.colors.almostWhite, fontWeight: '600', fontSize: 10 }]}>Destacada</Text>
					</View>
				)}
			</View>
			<View style={styles.logoRow}>
				<View style={[styles.logoRing, { backgroundColor: theme.colors.surface }]}>
					<OperatorAvatar brand={store?.name} logoUrl={store?.logo} size="md" />
				</View>
			</View>
			<View style={styles.body}>
				<Text numberOfLines={1} style={[textStyles.h6, { color: theme.colors.primaryText, fontWeight: '600' }]}>
					{store?.name}
				</Text>
				<Text numberOfLines={1} style={[textStyles.caption, { color: theme.colors.tertiaryText }]}>
					{meta || 'Tienda verificada'}
				</Text>
			</View>
		</QPPressable>
	)
}

const styles = StyleSheet.create({
	tile: {
		borderRadius: 14,
		overflow: 'hidden',
	},
	cover: {
		height: 74,
	},
	featuredBadge: {
		position: 'absolute',
		top: 8,
		right: 8,
		paddingHorizontal: 8,
		paddingVertical: 3,
		borderRadius: 8,
	},
	// El logo pisa el cover a mitad (estilo perfil): -22 = mitad del md (44).
	logoRow: {
		marginTop: -22,
		paddingHorizontal: 10,
	},
	logoRing: {
		width: 52,
		height: 52,
		borderRadius: 15,
		alignItems: 'center',
		justifyContent: 'center',
	},
	body: {
		paddingHorizontal: 10,
		paddingTop: 4,
		paddingBottom: 10,
		gap: 2,
	},
})

export default StoreTile
