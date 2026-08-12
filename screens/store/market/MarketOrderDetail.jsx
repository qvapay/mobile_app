import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import Clipboard from '@react-native-clipboard/clipboard'
import FastImage from '@d11/react-native-fast-image'

// Theme Context
import { useTheme } from '../../../theme/ThemeContext'
import { createContainerStyles, createTextStyles } from '../../../theme/themeUtils'

// UI
import OperatorAvatar from '../../../ui/store/OperatorAvatar'

// Routes
import { ROUTES } from '../../../routes'

// Helpers
import { getShortDateTime } from '../../../helpers'
import { mediaUrl } from '../../../helpers/mediaUrl'
import { MARKET_ORDER_STATUS, KIND_LABELS } from './marketConstants'

import { toast } from 'sonner-native'

const money = (v) => `$${Number(v || 0).toFixed(2)}`

const Row = ({ label, value, theme, textStyles }) => (
	<View style={styles.row}>
		<Text style={[textStyles.caption, { color: theme.colors.secondaryText }]}>{label}</Text>
		<Text style={[textStyles.h6, { fontWeight: '500' }]} numberOfLines={1}>{value}</Text>
	</View>
)

/**
 * Marketplace order detail. No fetch: the full order travels in
 * `route.params.order` (the list row already has everything the buyer sees).
 * Shows the snapshot product, per-unit breakdown, copiable tracking code and
 * a link to the seller's storefront.
 */
const MarketOrderDetail = ({ navigation, route }) => {

	const { order } = route.params || {}
	const { theme } = useTheme()
	const containerStyles = createContainerStyles(theme)
	const textStyles = createTextStyles(theme)
	const insets = useSafeAreaInsets()

	if (!order) return <View style={containerStyles.subContainer} />

	const status = MARKET_ORDER_STATUS[order.status] || { label: order.status, color: 'placeholder' }
	const image = mediaUrl(order.product?.main_image)
	const variantLabel = order.variant?.options
		? Object.entries(order.variant.options).map(([k, v]) => `${k}: ${v}`).join(' · ')
		: null

	const copyTracking = () => {
		Clipboard.setString(order.tracking_code)
		toast.success('Código de rastreo copiado')
	}

	return (
		<View style={containerStyles.subContainer}>
			<ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 30, paddingTop: 8 }} showsVerticalScrollIndicator={false}>

				{/* Producto */}
				<View style={[styles.card, { backgroundColor: theme.colors.surface }, theme.mode === 'light' && { borderWidth: 0.5, borderColor: theme.colors.border }]}>
					<View style={styles.productRow}>
						<View style={[styles.image, { backgroundColor: theme.colors.elevationLight }]}>
							{image && <FastImage source={{ uri: image }} style={StyleSheet.absoluteFill} resizeMode={FastImage.resizeMode.cover} />}
						</View>
						<View style={{ flex: 1 }}>
							<Text style={[textStyles.h5, { fontWeight: '600' }]} numberOfLines={2}>{order.product?.title || 'Producto'}</Text>
							{!!variantLabel && (
								<Text style={[textStyles.caption, { color: theme.colors.tertiaryText, marginTop: 2 }]}>{variantLabel}</Text>
							)}
							<Text style={[textStyles.caption, { color: theme.colors[status.color] || theme.colors.secondaryText, marginTop: 4, fontWeight: '600' }]}>
								{status.label}
							</Text>
						</View>
					</View>
				</View>

				{/* Desglose */}
				<View style={[styles.card, { backgroundColor: theme.colors.surface }, theme.mode === 'light' && { borderWidth: 0.5, borderColor: theme.colors.border }]}>
					<Row label="Cantidad" value={`${order.quantity}`} theme={theme} textStyles={textStyles} />
					<Row label="Precio unitario" value={money(order.unit_price)} theme={theme} textStyles={textStyles} />
					{Number(order.gift_card_amount) > 0 && (
						<Row label="Gift card aplicada" value={`-${money(order.gift_card_amount)}`} theme={theme} textStyles={textStyles} />
					)}
					<View style={[styles.row, styles.totalRow, { borderTopColor: `${theme.colors.secondaryText}33` }]}>
						<Text style={[textStyles.h6, { fontWeight: '600' }]}>Total</Text>
						<Text style={[textStyles.h5, { fontWeight: '600', color: theme.colors.primary }]}>{money(order.total)}</Text>
					</View>
					{!!order.product?.kind && (
						<Row label="Tipo" value={KIND_LABELS[order.product.kind] || order.product.kind} theme={theme} textStyles={textStyles} />
					)}
					<Row label="Fecha" value={getShortDateTime(order.created_at)} theme={theme} textStyles={textStyles} />
					{!!order.delivered_at && (
						<Row label="Entregado" value={getShortDateTime(order.delivered_at)} theme={theme} textStyles={textStyles} />
					)}
					{!!order.note && <Row label="Nota" value={order.note} theme={theme} textStyles={textStyles} />}
				</View>

				{/* Rastreo */}
				{!!order.tracking_code && (
					<Pressable
						onPress={copyTracking}
						style={[styles.card, { backgroundColor: theme.colors.surface }, theme.mode === 'light' && { borderWidth: 0.5, borderColor: theme.colors.border }]}
					>
						<Text style={[textStyles.caption, { color: theme.colors.tertiaryText, textTransform: 'uppercase', letterSpacing: 0.5 }]}>
							Código de rastreo (toca para copiar)
						</Text>
						<Text style={[textStyles.h6, { fontWeight: '600', marginTop: 4 }]}>{order.tracking_code}</Text>
					</Pressable>
				)}

				{/* Vendedor */}
				{!!order.shop && (
					<Pressable
						onPress={() => navigation.navigate(ROUTES.MARKET_STORE, { slug: order.shop.slug })}
						style={[styles.card, styles.shopCard, { backgroundColor: theme.colors.surface }, theme.mode === 'light' && { borderWidth: 0.5, borderColor: theme.colors.border }]}
					>
						<OperatorAvatar brand={order.shop.name} logoUrl={order.shop.logo} size="md" />
						<View style={{ flex: 1, marginLeft: 10 }}>
							<Text style={[textStyles.caption, { color: theme.colors.tertiaryText }]}>Vendido por</Text>
							<Text style={[textStyles.h6, { fontWeight: '600' }]} numberOfLines={1}>{order.shop.name}</Text>
						</View>
						<Text style={[textStyles.h5, { color: theme.colors.primary, fontWeight: '600' }]}>›</Text>
					</Pressable>
				)}

				{/* Referencia */}
				<Text style={[textStyles.caption, { color: theme.colors.tertiaryText, textAlign: 'center', marginTop: 14 }]}>
					Orden {order.uuid}
				</Text>
			</ScrollView>
		</View>
	)
}

const styles = StyleSheet.create({
	card: {
		padding: 14,
		borderRadius: 14,
		marginBottom: 12,
	},
	productRow: {
		flexDirection: 'row',
		gap: 12,
		alignItems: 'center',
	},
	image: {
		width: 64,
		height: 64,
		borderRadius: 12,
		overflow: 'hidden',
	},
	row: {
		flexDirection: 'row',
		alignItems: 'center',
		justifyContent: 'space-between',
		marginBottom: 8,
	},
	totalRow: {
		borderTopWidth: 1,
		paddingTop: 10,
		marginTop: 2,
	},
	shopCard: {
		flexDirection: 'row',
		alignItems: 'center',
	},
})

export default MarketOrderDetail
