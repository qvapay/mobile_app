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

// Status button config helper
const getStatusButton = (status, isOwner, offerType, theme) => {
	switch (status) {
		case 'completed':
			return { title: 'Finalizado', bg: theme.colors.primary, textColor: theme.colors.almostWhite, borderRadius: 20 }
		case 'paid':
			return { title: 'Pagado', bg: theme.colors.success, textColor: theme.colors.almostBlack, borderRadius: 20 }
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
				bg: offerType === 'buy' ? theme.colors.success : theme.colors.danger,
				textColor: offerType === 'buy' ? theme.colors.almostBlack : theme.colors.almostWhite,
				borderRadius: 5
			}
	}
}

// P2P Offer Component
const P2POfferItem = ({ offer, navigation, show_buttons = true, show_user = true }) => {

	// User context
	const { user } = useAuth()
	const { isUserOnline } = useOnlineStatus()

	// Contexts
	const { theme } = useTheme()
	const textStyles = createTextStyles(theme)

	// Border accent color by type
	const accentColor = offer.type === 'buy' ? theme.colors.success : theme.colors.danger

	// Dynamic badges
	const badges = []
	if (offer.only_kyc) badges.push({ label: 'KYC', color: theme.colors.primary })
	if (offer.only_vip) badges.push({ label: 'VIP', color: '#FFD700' })
	if (offer.private) badges.push({ label: 'Privada', color: theme.colors.warning })

	// Status button config
	const isOwner = user.uuid === offer.User?.uuid
	const btnConfig = show_buttons ? getStatusButton(offer.status, isOwner, offer.type, theme) : null

	return (
		<View style={[styles.offerCard, { backgroundColor: theme.colors.surface, borderLeftWidth: 3, borderLeftColor: accentColor }]}>

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
							<Text style={[textStyles.h3, { color: theme.colors.primary, fontWeight: '800' }]}>${offer.amount}</Text>
							<Text style={[textStyles.h7, { color: theme.colors.primaryText, fontWeight: '200' }]}>x</Text>
							<Text style={[textStyles.h4, { color: theme.colors.primaryText, fontWeight: '800' }]}>{offer.receive}</Text>
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

				{/* Right column: date + badges + button */}
				<View style={{ alignItems: 'flex-end', gap: 4 }}>
					<Text style={[textStyles.caption, { color: theme.colors.secondaryText, fontSize: theme.typography.fontSize.xs }]}>{new Date(offer.created_at).toLocaleDateString()}</Text>
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
