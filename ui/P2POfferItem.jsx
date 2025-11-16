import { View, Text, StyleSheet } from 'react-native'

// Theme Context
import { useTheme } from '../theme/ThemeContext'
import { createTextStyles } from '../theme/themeUtils'

// UI Components
import QPCoin from './particles/QPCoin'
import QPButton from './particles/QPButton'

// Icons
import FontAwesome6 from '@react-native-vector-icons/fontawesome6'
import ProfileContainerHorizontal from './ProfileContainerHorizontal'

// Helpers
import { getTypeText } from '../helpers'

// User context
import { useAuth } from '../auth/AuthContext'

// Routes
import { ROUTES } from '../routes'

// P2P Offer Component
const P2POfferItem = ({ offer, navigation, show_buttons = true, show_user = true }) => {

	// User context
	const { user } = useAuth()

	// Contexts
	const { theme } = useTheme()
	const textStyles = createTextStyles(theme)

	// P2P Log
	console.log('offer', offer)

	return (
		<View style={[styles.offerCard, { backgroundColor: theme.colors.surface }]}>

			{/* Header with Type and Coin */}
			<View style={styles.offerHeader}>
				<View style={styles.typeContainer}>
					<Text style={[styles.typeText, { color: theme.colors.primaryText }]}>{getTypeText(offer.type)}</Text>
				</View>
				<Text style={[textStyles.caption, { color: theme.colors.primaryText, fontSize: 10 }]}>{new Date(offer.created_at).toLocaleDateString()}</Text>
			</View>

			<View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>

				<View>
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

					{/* User Info */}
					{show_user && (
						<View style={{ marginVertical: 2 }}>
							{offer.Peer && offer.Peer.uuid ? (<ProfileContainerHorizontal user={offer.Peer} size={36} showUsername={false} />) : (<ProfileContainerHorizontal user={offer.User} size={36} showUsername={false} />)}
						</View>
					)}
				</View>

				{/* 3 Tags in column */}
				<View style={{ flexDirection: 'column', gap: 2 }}>
					<View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
						<Text style={[textStyles.caption, { color: theme.colors.primaryText, fontSize: 10 }]}>Tag 2</Text>
						<View style={{ width: 2, height: 12, backgroundColor: theme.colors.primary }} />
					</View>
					<View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
						<Text style={[textStyles.caption, { color: theme.colors.primaryText, fontSize: 10 }]}>Tag 3</Text>
						<View style={{ width: 2, height: 12, backgroundColor: theme.colors.primary }} />
					</View>
				</View>
			</View>


			{/* Message and Action in one row */}
			<View style={styles.messageRow}>

				{offer.message ? (
					<View style={[styles.messageText, { flexDirection: 'row', alignItems: 'center', gap: 6 }]}>
						<FontAwesome6 name="message" size={14} color={theme.colors.primary} iconStyle="solid" />
						<Text style={[textStyles.caption, { color: theme.colors.primaryText, flexShrink: 1 }]} numberOfLines={1} ellipsizeMode="tail">{offer.message}</Text>
					</View>
				) : (<View style={styles.messageText} />)}

				{show_buttons && user.uuid === offer.User.uuid ? (

					offer.status === 'completed' ? (
						<QPButton
							title="Finalizado"
							style={{ backgroundColor: theme.colors.primary, width: 90, height: 24, borderRadius: 20, paddingHorizontal: 5, paddingVertical: 2 }}
							textStyle={{ color: theme.colors.almostWhite, fontSize: 13, fontWeight: '400' }}
							onPress={() => (navigation.navigate(ROUTES.P2P_OFFER_SCREEN, { p2p_uuid: offer.uuid }))}
						/>
					) : (
						offer.status === 'paid' ? (
							<QPButton
								title="Pagado"
								style={{ backgroundColor: theme.colors.success, width: 90, height: 24, borderRadius: 20, paddingHorizontal: 5, paddingVertical: 2 }}
								textStyle={{ color: theme.colors.almostBlack, fontSize: 13, fontWeight: '400' }}
								onPress={() => (navigation.navigate(ROUTES.P2P_OFFER_SCREEN, { p2p_uuid: offer.uuid }))}
							/>
						) : (
							offer.status === 'revision' ? (
								<QPButton
									title="Revisión"
									style={{ backgroundColor: theme.colors.warning, width: 90, height: 24, borderRadius: 20, paddingHorizontal: 5, paddingVertical: 2 }}
									textStyle={{ color: theme.colors.almostBlack, fontSize: 13, fontWeight: '400' }}
									onPress={() => (navigation.navigate(ROUTES.P2P_OFFER_SCREEN, { p2p_uuid: offer.uuid }))}
								/>
							) : (
								<QPButton
									title="Editar"
									style={{ backgroundColor: theme.colors.primary, width: 90, height: 24, borderRadius: 5, paddingHorizontal: 5, paddingVertical: 2 }}
									textStyle={{ color: theme.colors.almostWhite, fontSize: 13, fontWeight: '400' }}
									onPress={() => (navigation.navigate(ROUTES.P2P_OFFER_SCREEN, { p2p_uuid: offer.uuid }))}
								/>
							)
						)
					)

				) : show_buttons && (

					offer.status === 'completed' ? (
						<QPButton
							title="Finalizado"
							style={{ backgroundColor: theme.colors.primary, width: 90, height: 24, borderRadius: 20, paddingHorizontal: 5, paddingVertical: 2 }}
							textStyle={{ color: theme.colors.almostWhite, fontSize: 13, fontWeight: '400' }}
							onPress={() => (navigation.navigate(ROUTES.P2P_OFFER_SCREEN, { p2p_uuid: offer.uuid }))}
						/>
					) : (
						offer.status === 'paid' ? (
							<QPButton
								title="Pagado"
								style={{ backgroundColor: theme.colors.success, width: 90, height: 24, borderRadius: 20, paddingHorizontal: 5, paddingVertical: 2 }}
								textStyle={{ color: theme.colors.almostBlack, fontSize: 13, fontWeight: '400' }}
								onPress={() => (navigation.navigate(ROUTES.P2P_OFFER_SCREEN, { p2p_uuid: offer.uuid }))}
							/>
						) : (
							offer.status === 'revision' ? (
								<QPButton
									title="Revisión"
									style={{ backgroundColor: theme.colors.warning, width: 90, height: 24, borderRadius: 20, paddingHorizontal: 5, paddingVertical: 2 }}
									textStyle={{ color: theme.colors.almostBlack, fontSize: 13, fontWeight: '400' }}
									onPress={() => (navigation.navigate(ROUTES.P2P_OFFER_SCREEN, { p2p_uuid: offer.uuid }))}
								/>
							) : (
								<QPButton
									title={offer.type === 'buy' ? 'Vender' : 'Comprar'}
									style={{ backgroundColor: offer.type === 'buy' ? theme.colors.danger : theme.colors.success, width: 90, height: 24, borderRadius: 5, paddingHorizontal: 5, paddingVertical: 2 }}
									textStyle={{ color: offer.type === 'buy' ? theme.colors.almostWhite : theme.colors.almostBlack, fontSize: 13, fontWeight: '400' }}
									onPress={() => (navigation.navigate(ROUTES.P2P_OFFER_SCREEN, { p2p_uuid: offer.uuid }))}
								/>
							)
						)
					)

				)}

			</View>
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
	offerHeader: {
		flexDirection: 'row',
		justifyContent: 'space-between',
		alignItems: 'center',
		marginBottom: 12
	},
	typeContainer: {
		flexDirection: 'row',
		alignItems: 'center'
	},
	typeText: {
		fontSize: 10,
		fontWeight: 'bold',
		textTransform: 'uppercase'
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
		justifyContent: 'flex-start',
		paddingTop: 4
	},
	messageText: {
		flex: 1,
		flexShrink: 1,
		minWidth: 0,
		marginRight: 12
	}
})

export default P2POfferItem
