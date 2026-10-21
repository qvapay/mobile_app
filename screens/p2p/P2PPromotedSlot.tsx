import { View, Text, StyleSheet } from 'react-native'
import { useTranslation } from 'react-i18next'
import FontAwesome6 from '@react-native-vector-icons/fontawesome6'
import type { NavigationProp } from '@react-navigation/native'

import { useTheme } from '../../theme/ThemeContext'
import { useTextStyles } from '../../theme/themeUtils'
import P2POfferItem from '../../ui/P2POfferItem'
import QPPressable from '../../ui/particles/QPPressable'
import { ROUTES } from '../../routes'
import { promoUsd } from './p2pPromo'

import type { P2PMarketAverages, P2PPromoOfferType, P2PPromoSlot, P2PPromoted } from '../../types/domain'
import type { RootStackParamList } from '../../types/navigation'

type P2PPromotedSlotProps = {
	/** Puesto ocupado y visible del par: su oferta va arriba con borde dorado. */
	promoted: P2PPromoted | null
	/** Puesto libre del par (solo se anuncia si no hay `promoted`). */
	freeSlot: P2PPromoSlot | null
	navigation: NavigationProp<RootStackParamList>
	marketAverages?: P2PMarketAverages | null
}

/**
 * Cabecera del listado del mercado con el puesto promocionado del par visible (moneda +
 * lado), calcada de `PromotedSlot` en `app/(dashboard)/p2p/p2pOffers.js` de qpweb: la oferta
 * pagada arriba con borde dorado, la etiqueta «Comerciante promocionado» y el enlace a
 * comprar el puesto; o, si está libre, una línea discreta que lo ofrece. El orden por tasa
 * del resto del mercado no cambia.
 */
const P2PPromotedSlot = ({ promoted, freeSlot, navigation, marketAverages }: P2PPromotedSlotProps) => {

	const { t } = useTranslation()
	const { theme } = useTheme()
	const textStyles = useTextStyles(theme)

	// El dorado puro no se lee sobre fondo claro: mismo tono que la etiqueta Solo VIP
	const gold = theme.isDark ? theme.colors.gold : '#A16207'
	const side = (type: P2PPromoOfferType) => t(type === 'sell' ? 'p2p.common.buy' : 'p2p.common.sell')
	const open = (slot: P2PPromoSlot) => navigation.navigate(ROUTES.P2P_PROMOTE, { coin: slot.coin, type: slot.offer_type })

	if (promoted) {
		return (
			<View style={styles.wrap} testID="p2p-promoted-slot">
				<View style={styles.labelRow}>
					<View style={styles.label}>
						<FontAwesome6 name="star" size={11} color={gold} iconStyle="solid" />
						<Text style={[textStyles.caption, { color: gold, fontFamily: theme.typography.fontFamily.semiBold }]}>{t('p2p.promo.market.label')}</Text>
					</View>
					<QPPressable onPress={() => open(promoted.slot)} hitSlop={8} variant="opacity" testID="p2p-promoted-want">
						<Text style={[textStyles.caption, styles.link, { color: theme.colors.secondaryText }]}>{t('p2p.promo.market.want')}</Text>
					</QPPressable>
				</View>
				<View style={[styles.card, { borderColor: theme.colors.gold + (theme.isDark ? '4D' : '80') }]}>
					<P2POfferItem
						offer={promoted.offer}
						navigation={navigation}
						marketAverage={marketAverages?.[promoted.offer.coin]}
						style={styles.item}
						promoted
					/>
				</View>
			</View>
		)
	}

	if (freeSlot) {
		return (
			<QPPressable onPress={() => open(freeSlot)} variant="opacity" style={styles.freeRow} testID="p2p-promo-free">
				<Text style={[textStyles.caption, { color: theme.colors.secondaryText }]}>
					{t('p2p.promo.market.free', { coin: freeSlot.coin, side: side(freeSlot.offer_type) })}{' '}
					<Text style={[styles.link, { color: gold, fontFamily: theme.typography.fontFamily.semiBold }]}>
						{t('p2p.promo.market.freeCta', { price: promoUsd(freeSlot.start_price) })}
					</Text>
				</Text>
			</QPPressable>
		)
	}

	return null
}

const styles = StyleSheet.create({
	wrap: { marginBottom: 12 },
	labelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 6, paddingHorizontal: 4 },
	label: { flexDirection: 'row', alignItems: 'center', gap: 6 },
	link: { textDecorationLine: 'underline' },
	card: { borderWidth: 1, borderRadius: 12, borderCurve: 'continuous', overflow: 'hidden' },
	item: { borderRadius: 0, marginBottom: 0 },
	freeRow: { marginBottom: 10, paddingHorizontal: 4 },
})

export default P2PPromotedSlot
