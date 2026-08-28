import { View, Text, StyleSheet, Pressable } from 'react-native'
import type { StyleProp, ViewStyle } from 'react-native'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import type { NavigationProp } from '@react-navigation/native'

// i18n (locale de fechas acorde al idioma activo)
import { getDateLocale } from '../i18n'

// Theme Context
import { useTheme } from '../theme/ThemeContext'
import type { Theme } from '../theme/ThemeContext'
import { createTextStyles } from '../theme/themeUtils'

// Dominio y navegación tipados
import type { P2POffer, P2PMarketAverages } from '../types/domain'
import type { RootStackParamList } from '../types/navigation'

// UI Components
import QPCoin from './particles/QPCoin'
import QPButton from './particles/QPButton'

// Icons
import FontAwesome6 from '@react-native-vector-icons/fontawesome6'
import ProfileContainerHorizontal from './ProfileContainerHorizontal'

// User context
import { useAuth } from '../auth/AuthContext'

// Online Status
import { useOnlineStatus } from '../hooks/OnlineStatusContext'

// Routes
import { ROUTES } from '../routes'

/**
 * Maps an offer status to its action-button config (label, colors, radius).
 * Terminal states (completed/paid/revision/cancelled) render pill-shaped
 * status chips; open offers render "Editar" for the owner or an inverse
 * action for peers ("Vender" on a buy offer, "Comprar" on a sell offer).
 * `t` llega del componente para que el label se re-resuelva con cada render
 * (y por tanto con cada cambio de idioma).
 */
const getStatusButton = (status: P2POffer['status'], isOwner: boolean, offerType: P2POffer['type'], theme: Theme, t: TFunction) => {
	switch (status) {
		case 'completed':
			return { title: t('ui.offerItem.status.completed'), bg: theme.colors.primary, textColor: theme.colors.almostWhite, borderRadius: 20 }
		case 'paid':
			return { title: t('ui.offerItem.status.paid'), bg: theme.colors.successFill, textColor: theme.colors.successFillText, borderRadius: 20 }
		case 'revision':
			return { title: t('ui.offerItem.status.revision'), bg: theme.colors.warning, textColor: theme.colors.almostBlack, borderRadius: 20 }
		case 'cancelled':
			return { title: t('ui.offerItem.status.cancelled'), bg: theme.colors.danger, textColor: theme.colors.almostWhite, borderRadius: 20 }
		default:
			if (isOwner) {
				return { title: t('ui.offerItem.edit'), bg: theme.colors.primary, textColor: theme.colors.almostWhite, borderRadius: 10 }
			}
			return {
				title: offerType === 'buy' ? t('ui.offerItem.sell') : t('ui.offerItem.buy'),
				bg: offerType === 'buy' ? theme.colors.successFill : theme.colors.danger,
				textColor: offerType === 'buy' ? theme.colors.successFillText : theme.colors.almostWhite,
				borderRadius: 10
			}
	}
}

type P2POfferItemProps = {
	offer: P2POffer
	navigation?: NavigationProp<RootStackParamList>
	show_buttons?: boolean
	show_user?: boolean
	show_date?: boolean
	expand_message?: boolean
	marketAverage?: P2PMarketAverages[string] | null
	style?: StyleProp<ViewStyle>
}

/**
 * List card for a P2P offer, used in the P2P marketplace list, user profiles
 * and the offer detail header.
 *
 * Orden de lectura de los P2P de la industria (Binance/OKX/Bybit) —
 * quién → a cuánto → cuánto → condiciones:
 *   1. Contraparte con su reputación (ops + rating, con punto de online)
 *   2. La TASA como número héroe junto al rail de pago (`Coin`), porque es
 *      la variable que se compara entre ofertas, + el botón de acción
 *   3. Disponible y contrapartida como línea de contexto en gris
 *   4. Tags solo de lo excepcional (VIP / Privada)
 *
 * El tipo de oferta lo comunica SOLO el botón de acción (Comprar/Vender): la
 * tarjeta es neutra, sin franjas de color.
 *
 * @param props
 * @param props.offer - P2P offer from the API (with `Coin`, `User`, optional `Peer`).
 * @param [props.navigation] - React Navigation object; required for button/profile taps.
 * @param [props.show_buttons=true] - Render the status/action button (off in the offer detail header).
 * @param [props.show_user=true] - Render the counterparty profile row.
 * @param [props.show_date=false] - Fecha de creación: fuera del listado (no aporta a la decisión y compite con el botón), solo en el detalle.
 * @param [props.expand_message=false] - Mensaje del anunciante completo (detalle); en el listado se trunca a una línea para preservar la densidad.
 * @param [props.marketAverage] - Medias 24h de la moneda (`{ average_buy, average_sell }`) para marcar si la tasa está por encima o por debajo del mercado.
 * @param [props.style] - Override sobre la card (el detalle iguala los márgenes verticales de su pila de cards).
 */
const P2POfferItem = ({ offer, navigation, show_buttons = true, show_user = true, show_date = false, expand_message = false, marketAverage = null, style = null }: P2POfferItemProps) => {

	// User context
	const { user } = useAuth()
	const { isUserOnline } = useOnlineStatus()

	// Contexts
	const { t } = useTranslation()
	const { theme } = useTheme()
	const textStyles = createTextStyles(theme)

	// Dynamic badges — sin KYC: es requisito para operar en P2P, lo cumple
	// todo el mundo y no distingue ninguna oferta
	const badges: { label: string, color: string }[] = []
	if (offer.only_vip) badges.push({ label: 'VIP', color: theme.colors.gold })
	if (offer.private) badges.push({ label: t('ui.offerItem.privateBadge'), color: theme.colors.warning })

	// Status button config (el `!` es solo de tipos: este componente siempre
	// se renderiza con sesión iniciada, el runtime no cambia)
	const isOwner = user!.uuid === offer.User?.uuid
	const btnConfig = show_buttons ? getStatusButton(offer.status, isOwner, offer.type, theme, t) : null

	// Tasa: lo que se compara entre ofertas (guardando la división por cero)
	const amountNum = Number(offer.amount)
	const rateValue = amountNum > 0 ? Number(offer.receive) / amountNum : null
	const rate = rateValue != null ? rateValue.toFixed(2) : '—'

	// Contexto de mercado: cuánto se aleja esta tasa de la media 24h de su misma
	// moneda y lado. El signo se lee SIEMPRE desde quien TOMA la oferta, que es
	// quien decide en la lista: en una de venta paga `receive` por cada QUSD
	// (menos tasa = más barato = mejor), y en una de compra lo recibe (más tasa =
	// mejor). Estaba al revés, así que una oferta de venta cara se pintaba en
	// verde — el mismo signo invertido que devolvía las peores primero al ordenar
	// por tasa (ver `best_rate` en useP2PFilters)
	const marketAvg = marketAverage
		? Number(offer.type === 'buy' ? marketAverage.average_buy : marketAverage.average_sell) || null
		: null
	const ratePremium = (marketAvg && rateValue) ? ((rateValue - marketAvg) / marketAvg) * 100 : null
	const rateEdge = ratePremium == null ? null : (offer.type === 'buy' ? ratePremium : -ratePremium)
	// Solo se señala cuando la diferencia es significativa (±1%)
	const rateBetter = rateEdge != null && rateEdge >= 1
	const rateWorse = rateEdge != null && rateEdge <= -1

	return (
		<View style={[styles.offerCard, { backgroundColor: theme.colors.surface }, style]}>

			{/* 1 · Quién — la reputación primero (o la fecha, en el detalle) */}
			{show_user && (() => {
				const profileUser = offer.Peer && offer.Peer.uuid ? offer.Peer : offer.User
				const isSelf = profileUser?.uuid === user?.uuid
				const goToProfile = () => {
					if (!profileUser?.uuid || isSelf || !navigation) return
					navigation.navigate(ROUTES.P2P_USER_SCREEN, { uuid: profileUser.uuid })
				}
				return (
					<Pressable
						onPress={goToProfile}
						disabled={isSelf || !profileUser?.uuid}
						style={styles.userRow}
						hitSlop={4}
					>
						{/* Los `!`/`as` son solo de tipos: el runtime tolera profileUser
						    nulo (igual que antes de la migración) */}
						<ProfileContainerHorizontal user={profileUser!} size={32} showUsername={false} isOnline={isUserOnline(profileUser?.uuid as string)} />
					</Pressable>
				)
			})()}

			{show_date && (
				<Text style={[textStyles.caption, { color: theme.colors.secondaryText, fontSize: theme.typography.fontSize.xs }]}>
					{new Date(offer.created_at).toLocaleDateString(getDateLocale())}
				</Text>
			)}

			{/* 2 · A cuánto — la tasa es la variable de decisión, va de héroe */}
			<View style={styles.rateRow}>
				<View style={styles.rateGroup}>
					<Text style={[textStyles.h2, { color: rateBetter ? theme.colors.successText : rateWorse ? theme.colors.danger : theme.colors.primaryText, fontWeight: '600' }]}>{rate}</Text>
					{rateEdge != null && (rateBetter || rateWorse) && (
						<Text style={[textStyles.caption, { color: rateBetter ? theme.colors.successText : theme.colors.danger, fontSize: theme.typography.fontSize.xs }]}>
							{rateEdge > 0 ? '+' : ''}{rateEdge.toFixed(1)}%
						</Text>
					)}
					<QPCoin coin={offer.Coin?.logo} size={18} />
					<Text style={[textStyles.h6, { color: theme.colors.secondaryText }]} numberOfLines={1}>
						{offer.Coin?.name}
					</Text>
				</View>
				{show_buttons && btnConfig && (
					<QPButton
						title={btnConfig.title}
						style={{ backgroundColor: btnConfig.bg, width: 90, height: 28, borderRadius: btnConfig.borderRadius, paddingHorizontal: 5, paddingVertical: 2 }}
						textStyle={{ color: btnConfig.textColor, fontSize: theme.typography.fontSize.sm, fontWeight: '400' }}
						onPress={() => (navigation!.navigate(ROUTES.P2P_OFFER_SCREEN, { p2p_uuid: offer.uuid }))}
					/>
				)}
			</View>

			{/* 3 · Cuánto — disponible y contrapartida, como contexto. El verbo va
			    en la perspectiva de QUIEN MIRA: en una oferta de venta el que la ve
			    compra el saldo y por tanto ENVÍA el rail; en una de compra lo recibe.
			    Si el que mira es el dueño, la perspectiva se invierte otra vez. */}
			<Text style={[textStyles.caption, { color: theme.colors.secondaryText }]} numberOfLines={1}>
				<Text style={{ fontFamily: theme.typography.fontFamily.semiBold }}>${offer.amount}</Text>
				{(isOwner ? offer.type === 'buy' : offer.type === 'sell') ? t('ui.offerItem.availableYouSend') : t('ui.offerItem.availableYouReceive')}
				<Text style={{ fontFamily: theme.typography.fontFamily.semiBold }}>{offer.receive}</Text>
			</Text>

			{/* 4 · Condiciones — solo las excepcionales */}
			{badges.length > 0 && (
				<View style={styles.tagRow}>
					{badges.map((badge) => (
						<View key={badge.label} style={[styles.tag, { backgroundColor: badge.color + '22' }]}>
							<Text style={[textStyles.caption, { color: badge.color, fontSize: theme.typography.fontSize.xs, fontFamily: theme.typography.fontFamily.medium }]}>{badge.label}</Text>
						</View>
					))}
				</View>
			)}

			{/* Message */}
			{offer.message && (
				<View style={[styles.messageRow, { gap: 6 }]}>
					<FontAwesome6 name="message" size={14} color={theme.colors.primary} iconStyle="solid" />
					<Text style={[textStyles.caption, { color: theme.colors.primaryText, flex: 1 }]} numberOfLines={expand_message ? undefined : 1} ellipsizeMode="tail">{offer.message}</Text>
				</View>
			)}
		</View>
	)
}

const styles = StyleSheet.create({
	userRow: {
		alignSelf: 'flex-start',
		marginBottom: 2,
	},
	rateRow: {
		flexDirection: 'row',
		alignItems: 'center',
		justifyContent: 'space-between',
		gap: 8,
	},
	rateGroup: {
		flex: 1,
		flexDirection: 'row',
		alignItems: 'center',
		gap: 6,
	},
	tagRow: {
		flexDirection: 'row',
		flexWrap: 'wrap',
		gap: 6,
		marginTop: 6,
	},
	tag: {
		paddingHorizontal: 8,
		paddingVertical: 3,
		borderRadius: 10,
	},
	offerCard: {
		borderRadius: 8,
		paddingHorizontal: 12,
		paddingVertical: 10,
		marginBottom: 6,
		position: 'relative'
	},
	messageRow: {
		flexDirection: 'row',
		alignItems: 'center',
		paddingTop: 4
	}
})

export default P2POfferItem
