import { useState } from 'react'
import { View, Text, StyleSheet, Pressable } from 'react-native'
import type { StyleProp, ViewStyle } from 'react-native'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import type { NavigationProp } from '@react-navigation/native'
import { toast } from 'sonner-native'

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
import QPSkeleton from './particles/QPSkeleton'

// Icons
import FontAwesome6 from '@react-native-vector-icons/fontawesome6'
import ProfileContainerHorizontal from './ProfileContainerHorizontal'

// User context
import { useAuth } from '../auth/AuthContext'

// Online Status
import { useOnlineStatus } from '../hooks/OnlineStatusContext'

// Routes
import { ROUTES } from '../routes'

// Reglas de la card (paridad con la web) y de las ofertas por rango
import { isFlexibleOffer, offerRate } from '../screens/p2p/p2pFlexible'
import {
	formatRate, formatUsd, formatCoinAmount, rateDeviation, formatDeviation,
	cardAction, viewerPays, remainingPct, activeRequirements, formatStamp,
} from '../screens/p2p/p2pOfferCard'
import type { CardAction, RateTrend } from '../screens/p2p/p2pOfferCard'

/** Ancho fijo del botón de operar: la columna derecha de la card. */
const ACTION_WIDTH = 112

// Azul del estado "Pagado": el tema no tiene un azul informativo y el primario
// ya es "Gestionar" (mismo tono que la web, blue-500)
const PAID_BLUE = '#3B82F6'

/**
 * Texto y color del botón por acción (tabla de la web). Abierta: Comprar en una
 * `sell` (rojo) y Vender en una `buy` (verde), Gestionar para el dueño.
 * `t` llega del componente para re-resolverse con cada cambio de idioma.
 */
const actionButton = (action: CardAction, theme: Theme, t: TFunction): { title: string, bg: string, text: string } => {
	switch (action) {
		case 'sell': return { title: t('ui.offerItem.buy'), bg: theme.colors.danger, text: theme.colors.almostWhite }
		case 'buy': return { title: t('ui.offerItem.sell'), bg: theme.colors.successFill, text: theme.colors.successFillText }
		case 'manage': return { title: t('ui.offerItem.manage'), bg: theme.colors.primary, text: theme.colors.almostWhite }
		case 'processing': return { title: t('ui.offerItem.status.processing'), bg: theme.colors.gold, text: theme.colors.almostBlack }
		case 'paid': return { title: t('ui.offerItem.status.paid'), bg: PAID_BLUE, text: theme.colors.almostWhite }
		case 'revision': return { title: t('ui.offerItem.status.revision'), bg: theme.colors.tertiaryText, text: theme.colors.almostWhite }
		case 'completed': return { title: t('ui.offerItem.status.completed'), bg: theme.colors.successFill, text: theme.colors.successFillText }
		case 'cancelled': return { title: t('ui.offerItem.status.cancelled'), bg: theme.colors.danger, text: theme.colors.almostWhite }
	}
}

const trendColor = (trend: RateTrend, theme: Theme) =>
	trend === 'good' ? theme.colors.successText : trend === 'bad' ? theme.colors.dangerText : theme.colors.secondaryText

const TABULAR = ['tabular-nums'] as ('tabular-nums')[]

type P2POfferItemProps = {
	offer: P2POffer
	navigation?: NavigationProp<RootStackParamList>
	show_buttons?: boolean
	show_user?: boolean
	show_date?: boolean
	expand_message?: boolean
	marketAverage?: P2PMarketAverages[string] | null
	style?: StyleProp<ViewStyle>
	/** Pintar una oferta por rango como tal (disponible + límites); off cuando la card resume UNA orden. */
	show_range?: boolean
}

/**
 * Card de una oferta P2P: lista del mercado, perfiles y cabecera del detalle.
 * Misma anatomía que la fila de la web (`components/particles/p2p.js` de qpweb),
 * en una rejilla de dos columnas —izquierda flexible, derecha del ancho del botón—:
 *   1. Anunciante (avatar + presencia, rating y operaciones)
 *   2. PRECIO como héroe (tasa + desviación frente al promedio, moneda `/ USD`,
 *      banco si llega) | Solo VIP + botón + hora de la última actualización
 *   3. Datos de la operación: Monto · Pagas/Recibes (fija), Disponible · Límites
 *      con chip y barra de lo que queda (por rango) o Tu orden (`my_order`)
 *   4. Mensaje del anunciante en una línea (tocar lo despliega)
 * Una línea ámbar a todo el alto del borde izquierdo marca que la oferta tiene requisitos
 * para aplicar; el detalle se anuncia por accesibilidad y con pulsación larga.
 *
 * @param props
 * @param props.offer - P2P offer from the API (with `Coin`, `User`, optional `Peer`).
 * @param [props.navigation] - React Navigation object; required for button/profile taps.
 * @param [props.show_buttons=true] - Columna de operar (botón + hora); off en la cabecera del detalle.
 * @param [props.show_user=true] - Render the counterparty profile row.
 * @param [props.show_date=false] - Fecha de creación, solo en el detalle.
 * @param [props.expand_message=false] - Mensaje completo (detalle); en la lista, una línea.
 * @param [props.marketAverage] - Medias de la moneda (`/p2p/averages`); la desviación usa `average`.
 * @param [props.style] - Override sobre la card.
 * @param [props.show_range=true] - Oferta por rango: Disponible y Límites en vez de Monto.
 */
const P2POfferItem = ({ offer, navigation, show_buttons = true, show_user = true, show_date = false, expand_message = false, marketAverage = null, style = null, show_range = true }: P2POfferItemProps) => {

	// User context
	const { user } = useAuth()
	const { isUserOnline } = useOnlineStatus()

	// Contexts
	const { t } = useTranslation()
	const { theme } = useTheme()
	const textStyles = createTextStyles(theme)

	const [messageOpen, setMessageOpen] = useState(false)

	// El `!` es solo de tipos: este componente siempre se renderiza con sesión
	const isOwner = user!.uuid === offer.User?.uuid
	const myOrder = offer.my_order || null
	const flexible = isFlexibleOffer(offer)
	const coinName = offer.Coin?.name || offer.coin
	const small = theme.typography.fontSize.xs - 2

	// Tasa y desviación frente al promedio de su moneda
	const rateValue = offerRate(offer)
	const average = Number(marketAverage?.average) || 0
	const deviation = rateDeviation(rateValue, average, offer.type)
	const trendLabel = deviation ? t(`ui.offerItem.trend.${deviation.trend}`, { average: formatRate(average) }) : ''

	// Requisitos del maker: línea ámbar + texto accesible / pulsación larga
	const requirements = activeRequirements(offer.requirements)
	const requirementsText = requirements
		? t('ui.offerItem.requirements', { list: requirements.map(([key, value]) => t(`ui.offerItem.requirement.${key}`, { value: key === 'min_rating' ? value.toFixed(1) : value })).join(' · ') })
		: null

	// Contraparte: el dueño ve a su Peer; el resto (Peer incluido) ve al dueño
	const profileUser = isOwner && offer.Peer?.uuid ? offer.Peer : offer.User
	const isSelf = profileUser?.uuid === user?.uuid
	const goToProfile = () => {
		if (!profileUser?.uuid || isSelf || !navigation) return
		navigation.navigate(ROUTES.P2P_USER_SCREEN, { uuid: profileUser.uuid })
	}

	// Columna de operar
	const action = cardAction({ status: offer.status, myOrderStatus: myOrder?.status, isOwner, type: offer.type })
	const button = show_buttons ? actionButton(action, theme, t) : null
	const stamp = show_buttons ? formatStamp(offer.updated_at) : null
	const vipColor = theme.isDark ? theme.colors.gold : '#A16207'

	// Datos de la operación: tres variantes (mi orden / por rango / fija)
	const pays = viewerPays(offer.type, isOwner)
	const rangeView = flexible && show_range && !myOrder
	const rows: { label: string, value: string, unit?: string }[] = myOrder
		? [
			{ label: t('ui.offerItem.myOrder'), value: `$${formatUsd(myOrder.amount)}` },
			{ label: pays ? t('ui.offerItem.youPay') : t('ui.offerItem.youReceive'), value: formatCoinAmount(myOrder.receive), unit: coinName },
		]
		: rangeView
			? [
				{ label: t('ui.offerItem.available'), value: `$${formatUsd(offer.available_amount)}` },
				{ label: t('ui.offerItem.limits'), value: `$${formatUsd(offer.order_min)} – $${formatUsd(offer.order_max)}` },
			]
			: [
				// Una orden proyectada en el detalle (show_range off) es "Orden", no "Monto"
				{ label: flexible ? t('ui.offerItem.order') : t('ui.offerItem.amount'), value: `$${formatUsd(offer.amount)}` },
				{ label: pays ? t('ui.offerItem.youPay') : t('ui.offerItem.youReceive'), value: formatCoinAmount(offer.receive), unit: coinName },
			]
	const remaining = rangeView ? remainingPct(offer) : null
	const showVipInChips = !!offer.only_vip && !show_buttons
	const hasChips = remaining != null || !!offer.private || showVipInChips

	const card = (
		<>
			{/* Requisitos para aplicar: línea ámbar, sin chip (rompía las pantallas estrechas) */}
			{requirements && <View style={[styles.requirementsBar, { backgroundColor: theme.colors.warning }]} />}

			{/* 1 · Anunciante */}
			{show_user && (
				<Pressable onPress={goToProfile} disabled={isSelf || !profileUser?.uuid} style={styles.userRow} hitSlop={4}>
					{/* Los `!`/`as` son solo de tipos: el runtime tolera profileUser nulo */}
					<ProfileContainerHorizontal user={profileUser!} size={32} showUsername={false} isOnline={isUserOnline(profileUser?.uuid as string)} />
				</Pressable>
			)}

			{show_date && (
				<Text style={[textStyles.caption, { color: theme.colors.secondaryText, fontSize: theme.typography.fontSize.xs }]}>
					{new Date(offer.created_at).toLocaleDateString(getDateLocale())}
				</Text>
			)}

			{/* 2 · Precio | Operar */}
			<View style={styles.priceRow}>
				<View style={styles.fill}>
					<View style={styles.rateLine}>
						<Text style={[styles.rate, { color: theme.colors.primaryText, fontFamily: theme.typography.fontFamily.semiBold }]} numberOfLines={1}>
							{formatRate(rateValue)}
						</Text>
						{deviation && (
							<Pressable onLongPress={() => toast(trendLabel)} accessibilityLabel={`${formatDeviation(deviation.pct)}. ${trendLabel}`} hitSlop={6}>
								<Text style={[styles.deviation, { color: trendColor(deviation.trend, theme), fontSize: small, fontFamily: theme.typography.fontFamily.medium }]}>
									{formatDeviation(deviation.pct)}
								</Text>
							</Pressable>
						)}
					</View>
					<View style={styles.coinLine}>
						<QPCoin coin={offer.Coin?.logo} size={16} />
						<Text style={[{ color: theme.colors.primaryText, fontSize: theme.typography.fontSize.sm, fontFamily: theme.typography.fontFamily.medium, flexShrink: 1 }]} numberOfLines={1}>
							{coinName}
						</Text>
						<Text style={{ color: theme.colors.secondaryText, fontSize: theme.typography.fontSize.xs, fontFamily: theme.typography.fontFamily.regular }}>/ USD</Text>
					</View>
					{/* Banco del método (CUP y similares): aparece en cuanto el backend mande `bank` */}
					{!!offer.bank && (
						<View style={styles.coinLine}>
							<FontAwesome6 name="building-columns" size={small} color={theme.colors.secondaryText} iconStyle="solid" />
							<Text style={{ color: theme.colors.secondaryText, fontSize: small + 1, fontFamily: theme.typography.fontFamily.regular, flexShrink: 1 }} numberOfLines={1}>{offer.bank}</Text>
						</View>
					)}
				</View>

				{button && (
					<View style={styles.actionColumn}>
						{!!offer.only_vip && (
							<View style={[styles.vipTag, { backgroundColor: theme.colors.gold + '26', borderColor: theme.colors.gold + '4D' }]}>
								<FontAwesome6 name="gem" size={small} color={vipColor} iconStyle="solid" />
								<Text style={{ color: vipColor, fontSize: small, fontFamily: theme.typography.fontFamily.semiBold }}>{t('ui.offerItem.vipOnly')}</Text>
							</View>
						)}
						<QPButton
							title={button.title}
							style={{ backgroundColor: button.bg, width: ACTION_WIDTH, height: 36, borderRadius: 12, paddingHorizontal: 8, paddingVertical: 0 }}
							textStyle={{ color: button.text, fontSize: theme.typography.fontSize.sm, fontFamily: theme.typography.fontFamily.semiBold }}
							onPress={() => (navigation!.navigate(ROUTES.P2P_OFFER_SCREEN, { p2p_uuid: offer.uuid, ...(myOrder ? { order: myOrder.uuid } : {}) }))}
						/>
						{stamp && (
							<Text style={{ color: theme.colors.secondaryText, fontSize: small, fontFamily: theme.typography.fontFamily.regular, fontVariant: TABULAR }}>{stamp}</Text>
						)}
					</View>
				)}
			</View>

			{/* 3 · Datos de la operación: etiqueta gris | valor (el primero en semibold) */}
			<View style={styles.dataGrid}>
				<View style={styles.dataColumn}>
					{rows.map(row => (
						<Text key={row.label} style={[styles.dataText, { color: theme.colors.secondaryText, fontSize: theme.typography.fontSize.xs, fontFamily: theme.typography.fontFamily.regular }]}>{row.label}</Text>
					))}
				</View>
				<View style={[styles.dataColumn, styles.fill]}>
					{rows.map((row, i) => (
						<Text key={row.label} numberOfLines={1} style={[styles.dataText, { color: theme.colors.primaryText, fontSize: theme.typography.fontSize.xs, fontFamily: i === 0 ? theme.typography.fontFamily.semiBold : theme.typography.fontFamily.medium, fontVariant: TABULAR }]}>
							{row.value}
							{row.unit ? <Text style={{ color: theme.colors.secondaryText, fontFamily: theme.typography.fontFamily.regular }}> {row.unit}</Text> : null}
						</Text>
					))}
				</View>
				{/* Barra de lo que queda (por rango: la etiqueta Límites ya lo dice) y chips
				    (Privada…) en la columna del botón, a la
				    altura de los datos: no gastan una fila propia */}
				{hasChips && (
					<View style={[styles.chipColumn, show_buttons ? styles.chipColumnAligned : styles.chipColumnEnd]}>
						{remaining != null && (
							<View
								style={[styles.remainingTrack, { backgroundColor: theme.colors.border }]}
								accessible
								accessibilityRole="progressbar"
								accessibilityLabel={t('ui.offerItem.remaining', { pct: Math.round(remaining), total: formatUsd(offer.amount) })}
								accessibilityValue={{ min: 0, max: 100, now: Math.round(remaining) }}
							>
								<View style={[styles.remainingFill, { width: `${remaining}%`, backgroundColor: theme.colors.primary }]} />
							</View>
						)}
						{showVipInChips && (
							<View style={[styles.chip, { backgroundColor: theme.colors.gold + '26', borderColor: theme.colors.gold + '4D' }]}>
								<FontAwesome6 name="gem" size={small} color={vipColor} iconStyle="solid" />
								<Text style={{ color: vipColor, fontSize: small, fontFamily: theme.typography.fontFamily.semiBold }}>{t('ui.offerItem.vipOnly')}</Text>
							</View>
						)}
						{!!offer.private && (
							<View style={[styles.chip, { backgroundColor: theme.colors.warning + '1A', borderColor: theme.colors.warning + '33' }]}>
								<Text style={{ color: theme.colors.warning, fontSize: small, fontFamily: theme.typography.fontFamily.semiBold }}>{t('ui.offerItem.privateBadge')}</Text>
							</View>
						)}
					</View>
				)}
			</View>

			{/* 4 · Mensaje: una línea en la lista; tocarlo lo despliega */}
			{!!offer.message && (
				<Pressable onPress={() => setMessageOpen(open => !open)} disabled={expand_message} style={styles.messageRow} hitSlop={4}>
					<FontAwesome6 name="message" size={theme.typography.fontSize.xs} color={theme.colors.primary + 'B3'} iconStyle="solid" />
					<Text style={{ color: theme.colors.secondaryText, fontSize: theme.typography.fontSize.xs, fontFamily: theme.typography.fontFamily.regular, flex: 1 }} numberOfLines={expand_message || messageOpen ? undefined : 1} ellipsizeMode="tail">
						{offer.message}
					</Text>
				</Pressable>
			)}
		</>
	)

	const cardStyle = [styles.offerCard, { backgroundColor: theme.colors.surface }, requirements && styles.clip, style]

	// Con requisitos la card entera los anuncia y la pulsación larga los enseña
	if (requirementsText) {
		return (
			<Pressable style={cardStyle} onLongPress={() => toast(requirementsText)} accessibilityHint={requirementsText}>
				{card}
			</Pressable>
		)
	}
	return <View style={cardStyle}>{card}</View>
}

/** Esqueleto con la misma rejilla que la card: no hay salto cuando llega el dato. */
export const P2POfferItemSkeleton = ({ style = null }: { style?: StyleProp<ViewStyle> }) => {
	const { theme } = useTheme()
	return (
		<View style={[styles.offerCard, { backgroundColor: theme.colors.surface }, style]}>
			<View style={styles.skeletonUser}>
				<QPSkeleton width={32} height={32} borderRadius={16} />
				<View style={{ gap: 4 }}>
					<QPSkeleton width={96} height={14} borderRadius={4} />
					<QPSkeleton width={64} height={10} borderRadius={4} />
				</View>
			</View>
			<View style={styles.priceRow}>
				<View style={[styles.fill, { gap: 6 }]}>
					<QPSkeleton width={96} height={20} borderRadius={4} />
					<QPSkeleton width={64} height={14} borderRadius={4} />
				</View>
				<QPSkeleton width={ACTION_WIDTH} height={36} borderRadius={12} />
			</View>
			<View style={{ gap: 6 }}>
				<QPSkeleton width={128} height={12} borderRadius={4} />
				<QPSkeleton width={112} height={12} borderRadius={4} />
			</View>
		</View>
	)
}

const styles = StyleSheet.create({
	offerCard: {
		borderRadius: 8,
		paddingHorizontal: 12,
		paddingVertical: 14,
		marginBottom: 6,
		gap: 8,
		position: 'relative',
	},
	// Alto completo del item; la card recorta (overflow) para que respete las
	// esquinas redondeadas de la primera y la última de la lista
	requirementsBar: {
		position: 'absolute',
		left: 0,
		top: 0,
		bottom: 0,
		width: 2,
	},
	clip: {
		overflow: 'hidden',
	},
	userRow: {
		alignSelf: 'flex-start',
	},
	fill: {
		flex: 1,
		minWidth: 0,
	},
	priceRow: {
		flexDirection: 'row',
		alignItems: 'center',
		gap: 16,
	},
	rateLine: {
		flexDirection: 'row',
		alignItems: 'center',
		gap: 6,
	},
	rate: {
		fontSize: 20,
		letterSpacing: -0.3,
		fontVariant: ['tabular-nums'],
		flexShrink: 1,
	},
	deviation: {
		lineHeight: 12,
		fontVariant: ['tabular-nums'],
	},
	coinLine: {
		flexDirection: 'row',
		alignItems: 'center',
		gap: 6,
		marginTop: 2,
	},
	actionColumn: {
		width: ACTION_WIDTH,
		alignItems: 'center',
		gap: 4,
	},
	vipTag: {
		flexDirection: 'row',
		alignItems: 'center',
		gap: 4,
		paddingHorizontal: 6,
		paddingVertical: 2,
		borderRadius: 6,
		borderWidth: StyleSheet.hairlineWidth,
	},
	dataGrid: {
		flexDirection: 'row',
		gap: 12,
	},
	dataColumn: {
		gap: 2,
	},
	dataText: {
		lineHeight: 17,
	},
	chipColumn: {
		justifyContent: 'center',
		gap: 5,
	},
	chipColumnAligned: {
		// gap 12 de la rejilla + 4 = los 16 del precio: centrado bajo el botón
		marginLeft: 4,
		width: ACTION_WIDTH,
		alignItems: 'center',
	},
	chipColumnEnd: {
		alignItems: 'flex-end',
	},
	chip: {
		flexDirection: 'row',
		alignItems: 'center',
		gap: 4,
		paddingHorizontal: 6,
		paddingVertical: 2,
		borderRadius: 6,
		borderWidth: StyleSheet.hairlineWidth,
	},
	// Del ancho del botón: misma columna, misma medida (paridad con la web en móvil)
	remainingTrack: {
		width: ACTION_WIDTH,
		height: 4,
		borderRadius: 2,
		overflow: 'hidden',
	},
	remainingFill: {
		height: '100%',
		borderRadius: 2,
	},
	messageRow: {
		flexDirection: 'row',
		alignItems: 'center',
		gap: 6,
	},
	skeletonUser: {
		flexDirection: 'row',
		alignItems: 'center',
		gap: 10,
	},
})

export default P2POfferItem
