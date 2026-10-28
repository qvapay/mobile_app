import { Fragment } from 'react'
import { View, Text, StyleSheet } from 'react-native'
import type { StyleProp, ViewStyle } from 'react-native'
import { useTranslation } from 'react-i18next'
import FontAwesome6 from '@react-native-vector-icons/fontawesome6'
import type { NavigationProp } from '@react-navigation/native'

import { useTheme } from '../../theme/ThemeContext'
import { useTextStyles } from '../../theme/themeUtils'
import { ROUTES } from '../../routes'
import P2POfferItem from '../../ui/P2POfferItem'
import QPPressable from '../../ui/particles/QPPressable'
import { useHomeP2PQuery } from './homeQueries'
import { useP2pMarketAveragesQuery } from '../p2p/p2pQueries'

import type { Theme } from '../../theme/ThemeContext'
import type { P2PMarketAverages, P2POffer } from '../../types/domain'
import type { RootStackParamList } from '../../types/navigation'

// En el Home caben dos promocionadas. El servidor manda también las últimas ofertas GOLD
// (las usa el dashboard web); la app las ignora a propósito desde 2026-10-28
const HOME_PROMOTED = 2

type HomeP2POffersProps = {
	navigation: NavigationProp<RootStackParamList>
	style?: StyleProp<ViewStyle>
}

type OfferListProps = {
	offers: P2POffer[]
	navigation: NavigationProp<RootStackParamList>
	averages?: P2PMarketAverages | null
	theme: Theme
}

/** Lista continua con divisores finos, como el listado del mercado. */
const OfferList = ({ offers, navigation, averages, theme }: OfferListProps) => (
	<View>
		{offers.map((offer, index) => (
			<Fragment key={offer.uuid}>
				{index > 0 && <View style={[styles.divider, { backgroundColor: theme.colors.border }]} />}
				<P2POfferItem offer={offer} navigation={navigation} marketAverage={averages?.[offer.coin]} style={styles.item} promoted />
			</Fragment>
		))}
	</View>
)

/**
 * Bloque «Ofertas P2P» del Home: hasta dos comerciantes promocionados (al azar entre todos
 * los puestos, con el borde dorado del mercado y el enlace para promocionarse). Lo arma qpweb
 * (`GET /p2p/featured`, que trae también las últimas GOLD para el dashboard web: aquí no se
 * pintan). Sin promocionadas, o contra un backend sin la ruta, no ocupa nada. Sin cabecera
 * de sección: la etiqueta dorada ya dice qué es, y al mercado se llega por la pestaña P2P.
 */
const HomeP2POffers = ({ navigation, style }: HomeP2POffersProps) => {

	const { t } = useTranslation()
	const { theme } = useTheme()
	const textStyles = useTextStyles(theme)

	const { data } = useHomeP2PQuery()
	const { data: averages } = useP2pMarketAveragesQuery()

	const promoted = (data?.promoted ?? []).slice(0, HOME_PROMOTED)
	if (promoted.length === 0) return null

	// El dorado puro no se lee sobre fondo claro: mismo tono que el puesto del mercado
	const gold = theme.isDark ? theme.colors.gold : '#A16207'

	return (
		<View style={style} testID="home-p2p-offers">
			<View style={styles.promoted}>
				<View style={styles.labelRow}>
					<View style={styles.label}>
						<FontAwesome6 name="star" size={11} color={gold} iconStyle="solid" />
						<Text style={[textStyles.caption, { color: gold, fontFamily: theme.typography.fontFamily.semiBold }]}>{t('home.p2p.promoted')}</Text>
					</View>
					<QPPressable onPress={() => navigation.navigate(ROUTES.P2P_PROMOTE)} hitSlop={8} variant="opacity" testID="home-p2p-promote">
						<Text style={[textStyles.caption, styles.link, { color: theme.colors.secondaryText }]}>{t('home.p2p.promote')}</Text>
					</QPPressable>
				</View>
				<View style={[styles.promotedCard, { borderColor: theme.colors.gold + (theme.isDark ? '4D' : '80') }]}>
					<OfferList offers={promoted} navigation={navigation} averages={averages} theme={theme} />
				</View>
			</View>
		</View>
	)
}

const styles = StyleSheet.create({
	promoted: { marginBottom: 4 },
	labelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 6, paddingHorizontal: 4 },
	label: { flexDirection: 'row', alignItems: 'center', gap: 6 },
	link: { textDecorationLine: 'underline' },
	promotedCard: { borderWidth: 1, borderRadius: 12, borderCurve: 'continuous', overflow: 'hidden' },
	item: { borderRadius: 0, marginBottom: 0 },
	divider: { height: StyleSheet.hairlineWidth },
})

export default HomeP2POffers
