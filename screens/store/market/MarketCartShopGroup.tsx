import { View, Text, StyleSheet, Pressable } from 'react-native'
import { useTranslation } from 'react-i18next'
import FontAwesome6 from '@react-native-vector-icons/fontawesome6'
import FastImage from '@d11/react-native-fast-image'

import { ROUTES } from '../../../routes'
import { mediaUrl } from '../../../helpers/mediaUrl'
import { PROBLEM_LABELS } from './marketCheckout'

import type { NavigationProp } from '@react-navigation/native'
import type { Theme } from '../../../theme/ThemeContext'
import type { TextStyles } from '../../../theme/themeUtils'
import type { RootStackParamList } from '../../../types/navigation'
import type { ShopGroup } from './marketCheckout'

// OJO: `theme.mode` no existe en el tema (siempre undefined) — bug de runtime
// pre-existente que se preserva tal cual; el alias es solo de tipos.
type ThemeWithMode = Theme & { mode?: string }

type MarketCartShopGroupProps = {
	group: ShopGroup
	/** Hay un pago en curso: las cantidades y el borrado quedan bloqueados. */
	paying: boolean
	onSetQty: (key: string, qty: number) => void
	onRemove: (key: string) => void
	navigation: NavigationProp<RootStackParamList>
	money: (v: number | string | null | undefined) => string
	theme: Theme
	textStyles: TextStyles
}

/**
 * Una tarjeta de tienda del carrito con sus líneas: imagen, título, variante,
 * selector de cantidad acotado al stock fresco y el estado por línea (problema,
 * envío bloqueado, error de la orden o "procesando").
 *
 * Extraído de `MarketCart.tsx`, donde estas ~90 líneas de JSX anidado eran la
 * mitad ilegible del render.
 */
const MarketCartShopGroup = ({ group, paying, onSetQty, onRemove, navigation, money, theme, textStyles }: MarketCartShopGroupProps) => {

	const { t } = useTranslation()

	return (
		<View
			style={[styles.shopCard, { backgroundColor: theme.colors.surface }, (theme as ThemeWithMode).mode === 'light' && { borderWidth: 0.5, borderColor: theme.colors.border }]}
		>
			<Pressable
				disabled={!group.slug}
				onPress={() => navigation.navigate(ROUTES.MARKET_STORE, { slug: group.slug as string })}
				style={styles.shopHeader}
			>
				<Text style={[textStyles.h6, { fontWeight: '600' }]} numberOfLines={1}>{group.name}</Text>
				{!!group.slug && <Text style={[textStyles.caption, { color: theme.colors.primary, fontWeight: '600' }]}>{t('market.cart.viewStore')}</Text>}
			</Pressable>

			{group.entries.map(e => {
				const image = mediaUrl(e.variant?.image || e.fresh?.main_image || e.item.image)
				const title = e.fresh?.title || e.item.title
				const errored = typeof e.status === 'object' && e.status?.error
				return (
					<View key={e.key} style={[styles.itemRow, e.problem && { opacity: 0.6 }]}>
						<View style={[styles.itemImage, { backgroundColor: theme.colors.elevationLight }]}>
							{image && (
								<FastImage source={{ uri: image }} style={StyleSheet.absoluteFill} resizeMode={FastImage.resizeMode.cover} />
							)}
						</View>
						<View style={{ flex: 1 }}>
							<Pressable onPress={() => navigation.navigate(ROUTES.MARKET_PRODUCT, { uuid: e.item.product_uuid })}>
								<Text style={[textStyles.h6, { fontWeight: '500' }]} numberOfLines={1}>{title}</Text>
							</Pressable>
							{!!e.item.variant_label && (
								<Text style={[textStyles.caption, { color: theme.colors.tertiaryText, marginTop: 1 }]} numberOfLines={1}>
									{e.item.variant_label}
								</Text>
							)}

							{e.problem ? (
								<Text style={[textStyles.caption, { color: theme.colors.danger, marginTop: 3, fontWeight: '500' }]}>
									{t(PROBLEM_LABELS[e.problem])}
								</Text>
							) : (
								<View style={styles.qtyRow}>
									<Pressable
										disabled={paying || e.qty <= 1}
										onPress={() => onSetQty(e.key, e.qty - 1)}
										style={[styles.qtyBtn, { backgroundColor: theme.colors.elevationLight }, e.qty <= 1 && { opacity: 0.4 }]}
									>
										<FontAwesome6 name="minus" size={10} color={theme.colors.primaryText} iconStyle="solid" />
									</Pressable>
									<Text style={[textStyles.h6, styles.qtyValue]}>{e.qty}</Text>
									<Pressable
										disabled={paying || e.qty >= e.maxQty}
										onPress={() => onSetQty(e.key, e.qty + 1)}
										style={[styles.qtyBtn, { backgroundColor: theme.colors.elevationLight }, e.qty >= e.maxQty && { opacity: 0.4 }]}
									>
										<FontAwesome6 name="plus" size={10} color={theme.colors.primaryText} iconStyle="solid" />
									</Pressable>
									{!!e.fresh?.track_inventory && e.maxQty < 999 && (
										<Text style={[textStyles.caption, { color: theme.colors.tertiaryText, marginLeft: 8 }]}>{t('market.cart.stockLeft', { qty: e.maxQty })}</Text>
									)}
								</View>
							)}

							{e.shipBlocked && (
								<Text style={[textStyles.caption, { color: theme.colors.danger, marginTop: 3, fontWeight: '500' }]}>
									{t('market.cart.itemShipBlocked')}
								</Text>
							)}
							{!!errored && (
								<Text style={[textStyles.caption, { color: theme.colors.danger, marginTop: 3, fontWeight: '500' }]}>
									{(e.status as { error: string }).error}
								</Text>
							)}
							{e.status === 'paying' && (
								<Text style={[textStyles.caption, { color: theme.colors.primary, marginTop: 3, fontWeight: '500' }]}>{t('market.cart.processing')}</Text>
							)}
						</View>
						<View style={styles.itemRight}>
							<Text style={[textStyles.h6, { fontWeight: '600' }]}>{money(e.unitPrice * e.qty)}</Text>
							<Pressable disabled={paying} onPress={() => onRemove(e.key)} hitSlop={8}>
								<FontAwesome6 name="trash-can" size={13} color={theme.colors.tertiaryText} iconStyle="solid" />
							</Pressable>
						</View>
					</View>
				)
			})}
		</View>
	)
}

const styles = StyleSheet.create({
	shopCard: {
		borderRadius: 14,
		paddingHorizontal: 12,
		paddingBottom: 4,
	},
	shopHeader: {
		flexDirection: 'row',
		alignItems: 'center',
		justifyContent: 'space-between',
		paddingVertical: 10,
	},
	itemRow: {
		flexDirection: 'row',
		gap: 10,
		paddingVertical: 10,
	},
	itemImage: {
		width: 56,
		height: 56,
		borderRadius: 10,
		overflow: 'hidden',
	},
	itemRight: {
		alignItems: 'flex-end',
		justifyContent: 'space-between',
		paddingBottom: 2,
	},
	qtyRow: {
		flexDirection: 'row',
		alignItems: 'center',
		marginTop: 6,
	},
	qtyBtn: {
		width: 26,
		height: 26,
		borderRadius: 8,
		alignItems: 'center',
		justifyContent: 'center',
	},
	qtyValue: {
		minWidth: 30,
		textAlign: 'center',
		fontWeight: '600',
	},
})

export default MarketCartShopGroup
