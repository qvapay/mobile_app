import { View, Text, StyleSheet } from "react-native"
import FontAwesome6 from "@react-native-vector-icons/fontawesome6"
import { useTranslation } from "react-i18next"

import QPAvatar from "../../ui/particles/QPAvatar"
import QPPressable from "../../ui/particles/QPPressable"
import QPRate from "../../ui/particles/QPRate"
import { timeAgo } from "../../helpers"
import { formatCents, isActiveOrder, toCents } from "./p2pFlexible"
import { canRateOrder, myRatingOf } from "./p2pRating"

import type { Theme } from "../../theme/ThemeContext"
import type { TextStyles, ContainerStyles } from "../../theme/themeUtils"
import type { P2POffer, P2POrder, P2POrderStatus } from "../../types/domain"

type P2PFlexibleOrdersProps = {
	offer: P2POffer
	isOwner: boolean
	currentUserUuid?: string | null
	onOpenOrder: (uuid: string) => void
	/** Abre la hoja de valoración de esa orden (completada y aún sin valorar). */
	onRateOrder: (uuid: string) => void
	theme: Theme
	textStyles: TextStyles
	containerStyles: ContainerStyles
}

/** Color de la píldora de estado de una orden (mismo código que la card de oferta). */
const statusColor = (status: P2POrderStatus, theme: Theme): string => {
	switch (status) {
		case "processing": return theme.colors.primary
		case "paid": return theme.colors.successText
		case "revision": return theme.colors.warning
		case "cancelled": return theme.colors.danger
		default: return theme.colors.secondaryText
	}
}

/**
 * Vista de una oferta por rango sin orden seleccionada: cuánto queda y cuánto
 * hay comprometido, y la lista de órdenes (el dueño ve todas; un taker, las
 * suyas). Cada fila abre esa orden — su pago, chat y disputa son propios.
 * Las vivas van primero: son las que piden acción. Una orden completada se
 * valora aparte: chip "Valorar" si aún no la valoré, mis estrellas si ya.
 */
const P2PFlexibleOrders = ({ offer, isOwner, currentUserUuid = null, onOpenOrder, onRateOrder, theme, textStyles, containerStyles }: P2PFlexibleOrdersProps) => {

	const { t } = useTranslation()

	const orders = [...(offer.Orders || [])].sort((a, b) => {
		const live = Number(isActiveOrder(b)) - Number(isActiveOrder(a))
		return live !== 0 ? live : new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
	})
	const summary = offer.OrdersSummary
	const coinName = offer.Coin?.name || offer.coin

	return (
		<>
			{/* Inventario: lo que queda, lo comprometido y el balance de órdenes (solo al dueño) */}
			{isOwner && (
				<View style={[containerStyles.card, styles.card, { flexDirection: "column", alignItems: "stretch" }]}>
					<View style={styles.statsRow}>
						<View style={styles.stat}>
							<Text style={[textStyles.h7, { color: theme.colors.secondaryText }]}>{t('p2p.flexible.available')}</Text>
							<Text style={[textStyles.h5, { color: theme.colors.primaryText }]}>${formatCents(toCents(offer.available_amount))}</Text>
						</View>
						<View style={styles.stat}>
							<Text style={[textStyles.h7, { color: theme.colors.secondaryText }]}>{t('p2p.flexible.reserved')}</Text>
							<Text style={[textStyles.h5, { color: theme.colors.primaryText }]}>${formatCents(toCents(offer.reserved_amount))}</Text>
						</View>
						<View style={styles.stat}>
							<Text style={[textStyles.h7, { color: theme.colors.secondaryText }]}>{t('p2p.flexible.total')}</Text>
							<Text style={[textStyles.h5, { color: theme.colors.primaryText }]}>${formatCents(toCents(offer.amount))}</Text>
						</View>
					</View>
					{summary && (
						<Text style={[textStyles.h7, { color: theme.colors.secondaryText, marginTop: 8 }]}>
							{t('p2p.flexible.summary', { active: summary.active, completed: summary.completed, cancelled: summary.cancelled })}
						</Text>
					)}
				</View>
			)}

			{orders.length > 0 && (
				<View style={[containerStyles.card, styles.card, { flexDirection: "column", alignItems: "stretch", paddingVertical: 4 }]}>
					<Text style={[textStyles.h7, styles.sectionTitle, { color: theme.colors.secondaryText }]}>
						{isOwner ? t('p2p.flexible.ordersTitle') : t('p2p.flexible.myOrdersTitle')}
					</Text>
					{orders.map((order: P2POrder, i) => {
						const color = statusColor(order.status, theme)
						const canRate = canRateOrder(offer, order, currentUserUuid)
						const mine = order.status === "completed" ? myRatingOf(offer, order) : null
						return (
							<QPPressable
								key={order.uuid}
								onPress={() => onOpenOrder(order.uuid)}
								style={[styles.row, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.colors.border }]}
								accessibilityRole="button"
							>
								{isOwner && <QPAvatar user={order.Taker} size={32} />}
								<View style={{ flex: 1 }}>
									<Text style={[textStyles.h6, { color: theme.colors.primaryText }]} numberOfLines={1}>
										{isOwner ? `@${order.Taker?.username || "—"}` : `$${formatCents(toCents(order.amount))}`}
									</Text>
									<Text style={[textStyles.h7, { color: theme.colors.secondaryText }]} numberOfLines={1}>
										{isOwner ? `$${formatCents(toCents(order.amount))} · ` : ""}{order.receive} {coinName} · {timeAgo(order.created_at)}
									</Text>
								</View>
								{canRate ? (
									/* Su propio pressable: en el Responder gana el más interno, así que no abre la orden */
									<QPPressable onPress={() => onRateOrder(order.uuid)} style={[styles.pill, styles.ratePill, { backgroundColor: theme.colors.primary }]} accessibilityRole="button">
										<FontAwesome6 name="star" size={10} color={theme.colors.almostWhite} iconStyle="solid" />
										<Text style={[textStyles.caption, { color: theme.colors.almostWhite, fontSize: theme.typography.fontSize.xs, fontFamily: theme.typography.fontFamily.medium }]}>
											{t('p2p.rating.rowRate')}
										</Text>
									</QPPressable>
								) : mine ? (
									<View accessibilityLabel={t('p2p.rating.yourRating')}>
										<QPRate value={mine.rating} size={11} spacing={2} readOnly />
									</View>
								) : (
									<View style={[styles.pill, { backgroundColor: color + "22" }]}>
										<Text style={[textStyles.caption, { color, fontSize: theme.typography.fontSize.xs, fontFamily: theme.typography.fontFamily.medium }]}>
											{t(`p2p.flexible.orderStatus.${order.status}`)}
										</Text>
									</View>
								)}
								<FontAwesome6 name="angle-right" size={14} color={theme.colors.tertiaryText} iconStyle="solid" />
							</QPPressable>
						)
					})}
				</View>
			)}
		</>
	)
}

const styles = StyleSheet.create({
	card: { marginVertical: 4, paddingVertical: 10, paddingHorizontal: 12 },
	statsRow: { flexDirection: "row", justifyContent: "space-between", gap: 8 },
	stat: { flex: 1, gap: 2 },
	sectionTitle: { textTransform: "uppercase", letterSpacing: 0.5, marginTop: 6, marginBottom: 2 },
	row: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 10 },
	pill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
	ratePill: { flexDirection: "row", alignItems: "center", gap: 4, paddingVertical: 5 },
})

export default P2PFlexibleOrders
