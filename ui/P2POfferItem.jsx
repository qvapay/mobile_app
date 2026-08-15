import { View, Text, StyleSheet, Pressable } from 'react-native'

// Theme Context
import { useTheme } from '../theme/ThemeContext'
import { createTextStyles } from '../theme/themeUtils'

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
 */
const getStatusButton = (status, isOwner, offerType, theme) => {
	switch (status) {
		case 'completed':
			return { title: 'Finalizado', bg: theme.colors.primary, textColor: theme.colors.almostWhite, borderRadius: 20 }
		case 'paid':
			return { title: 'Pagado', bg: theme.colors.successFill, textColor: theme.colors.successFillText, borderRadius: 20 }
		case 'revision':
			return { title: 'Revisión', bg: theme.colors.warning, textColor: theme.colors.almostBlack, borderRadius: 20 }
		case 'cancelled':
			return { title: 'Cancelado', bg: theme.colors.danger, textColor: theme.colors.almostWhite, borderRadius: 20 }
		default:
			if (isOwner) {
				return { title: 'Editar', bg: theme.colors.primary, textColor: theme.colors.almostWhite, borderRadius: 5 }
			}
			return {
				title: offerType === 'buy' ? 'Vender' : 'Comprar',
				bg: offerType === 'buy' ? theme.colors.successFill : theme.colors.danger,
				textColor: offerType === 'buy' ? theme.colors.successFillText : theme.colors.almostWhite,
				borderRadius: 5
			}
	}
}

/**
 * List card for a P2P offer, used in the P2P marketplace list, user profiles
 * and the offer detail header. Shows coin, rate, amount x receive, KYC/VIP/
 * private badges, an optional counterparty row (with online dot, tap to open
 * their P2P profile — disabled for yourself) and a status/action button that
 * navigates to the offer. El tipo de oferta lo comunica SOLO el botón de
 * acción (Comprar/Vender), como en los P2P de la industria — la tarjeta es
 * neutra, sin franjas de color.
 *
 * @param {object} props
 * @param {object} props.offer - P2P offer from the API (with `Coin`, `User`, optional `Peer`).
 * @param {object} [props.navigation] - React Navigation object; required for button/profile taps.
 * @param {boolean} [props.show_buttons=true] - Render the status/action button (off in the offer detail header).
 * @param {boolean} [props.show_user=true] - Render the counterparty profile row.
 * @param {boolean} [props.show_date=false] - Fecha de creación: fuera del listado (no aporta a la decisión y compite con el botón), solo en el detalle.
 */
const P2POfferItem = ({ offer, navigation, show_buttons = true, show_user = true, show_date = false }) => {

	// User context
	const { user } = useAuth()
	const { isUserOnline } = useOnlineStatus()

	// Contexts
	const { theme } = useTheme()
	const textStyles = createTextStyles(theme)

	// Dynamic badges — sin KYC: es requisito para operar en P2P, lo cumple
	// todo el mundo y no distingue ninguna oferta
	const badges = []
	if (offer.only_vip) badges.push({ label: 'VIP', color: theme.colors.gold })
	if (offer.private) badges.push({ label: 'Privada', color: theme.colors.warning })

	// Status button config
	const isOwner = user.uuid === offer.User?.uuid
	const btnConfig = show_buttons ? getStatusButton(offer.status, isOwner, offer.type, theme) : null

	return (
		<View style={[styles.offerCard, { backgroundColor: theme.colors.surface }]}>

			<View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>

				<View style={{ flex: 1 }}>
					{/* Amount and Receive */}
					<View style={{ gap: 2, marginBottom: 4 }}>
						<View style={styles.coinRow}>
							<View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
								<QPCoin coin={offer.Coin?.logo} size={20} />
								<Text style={[textStyles.h5, { color: theme.colors.primaryText }]}>
									{offer.Coin?.name}
								</Text>
							</View>
							<View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
								<FontAwesome6 name="money-bill-transfer" size={12} color={theme.colors.primaryText} iconStyle="solid" />
								<Text style={[textStyles.h7, { color: theme.colors.primaryText, fontWeight: '400' }]} >
									{Number(offer.receive / offer.amount).toFixed(2)}
								</Text>
							</View>
						</View>
						<View style={[styles.amountRow, { marginLeft: 2 }]}>
							<Text style={[textStyles.h3, { color: theme.colors.primary, fontWeight: '600' }]}>${offer.amount}</Text>
							<Text style={[textStyles.h7, { color: theme.colors.primaryText, fontWeight: '200' }]}>x</Text>
							<Text style={[textStyles.h4, { color: theme.colors.primaryText, fontWeight: '600' }]}>{offer.receive}</Text>
						</View>
					</View>

					{/* User Info - tap to open peer profile */}
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
								style={{ marginVertical: 2, alignSelf: 'flex-start' }}
								hitSlop={4}
							>
								<ProfileContainerHorizontal user={profileUser} size={36} showUsername={false} isOnline={isUserOnline(profileUser?.uuid)} />
							</Pressable>
						)
					})()}
				</View>

				{/* Right column: (fecha solo en el detalle) + badges + button */}
				<View style={{ alignItems: 'flex-end', gap: 4 }}>
					{show_date && (
						<Text style={[textStyles.caption, { color: theme.colors.secondaryText, fontSize: theme.typography.fontSize.xs }]}>{new Date(offer.created_at).toLocaleDateString()}</Text>
					)}
					{badges.length > 0 && (
						<View style={{ gap: 2, alignItems: 'flex-end' }}>
							{badges.map((badge) => (
								<View key={badge.label} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
									<Text style={[textStyles.caption, { color: badge.color, fontSize: theme.typography.fontSize.xs, fontFamily: theme.typography.fontFamily.medium }]}>{badge.label}</Text>
									<View style={{ width: 2, height: 12, backgroundColor: badge.color }} />
								</View>
							))}
						</View>
					)}
					{show_buttons && btnConfig && (
						<QPButton
							title={btnConfig.title}
							style={{ backgroundColor: btnConfig.bg, width: 90, height: 24, borderRadius: btnConfig.borderRadius, paddingHorizontal: 5, paddingVertical: 2 }}
							textStyle={{ color: btnConfig.textColor, fontSize: theme.typography.fontSize.sm, fontWeight: '400' }}
							onPress={() => (navigation.navigate(ROUTES.P2P_OFFER_SCREEN, { p2p_uuid: offer.uuid }))}
						/>
					)}
				</View>
			</View>

			{/* Message */}
			{offer.message && (
				<View style={[styles.messageRow, { gap: 6 }]}>
					<FontAwesome6 name="message" size={14} color={theme.colors.primary} iconStyle="solid" />
					<Text style={[textStyles.caption, { color: theme.colors.primaryText, flex: 1 }]} numberOfLines={1} ellipsizeMode="tail">{offer.message}</Text>
				</View>
			)}
		</View>
	)
}

const styles = StyleSheet.create({
	offerCard: {
		borderRadius: 8,
		paddingHorizontal: 12,
		paddingVertical: 4,
		marginBottom: 4,
		position: 'relative'
	},
	amountRow: {
		flexDirection: 'row',
		alignItems: 'center',
		gap: 4
	},
	coinRow: {
		flexDirection: 'row',
		alignItems: 'center',
		gap: 8
	},
	messageRow: {
		flexDirection: 'row',
		alignItems: 'center',
		paddingTop: 4
	}
})

export default P2POfferItem
