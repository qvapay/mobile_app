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

// Routes
import { ROUTES } from '../routes'

// P2P Offer Component
const P2POfferItem = ({ offer, navigation }) => {

	// Contexts
	const { theme } = useTheme()
	const textStyles = createTextStyles(theme)

	return (
		<View style={[styles.offerCard, { backgroundColor: theme.colors.surface }]}>

			{/* Header with Type and Coin */}
			<View style={styles.offerHeader}>
				<View style={styles.typeContainer}>
					<Text style={[styles.typeText, { color: theme.colors.primaryText }]}>{getTypeText(offer.type)}</Text>
				</View>
				<Text style={[textStyles.caption, { color: theme.colors.primaryText }]}>{new Date(offer.created_at).toLocaleDateString()}</Text>
			</View>

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
						<Text style={[textStyles.h6, { color: theme.colors.primaryText, fontWeight: '400' }]} >
							{Number(offer.receive / offer.amount).toFixed(2)}
						</Text>
					</View>
				</View>
				<View style={[styles.amountRow, { marginLeft: 2 }]}>
					<Text style={[textStyles.h2, { color: theme.colors.primary, fontWeight: '800' }]}>${offer.amount}</Text>
					<Text style={[textStyles.h6, { color: theme.colors.primaryText, fontWeight: '200' }]}>x</Text>
					<Text style={[textStyles.h3, { color: theme.colors.primaryText }]}>{offer.receive}</Text>
				</View>
			</View>

			{/* User Info */}
			<View style={{ marginVertical: 4 }}>
				<ProfileContainerHorizontal user={offer.User} size={40} showUsername={false} />
			</View>

			{/* Message and Action in one row */}
			<View style={styles.messageRow}>

				{offer.message ? (
					<View style={[styles.messageText, { flexDirection: 'row', alignItems: 'center', gap: 6 }]}>
						<FontAwesome6 name="message" size={14} color={theme.colors.primary} iconStyle="solid" />
						<Text style={[textStyles.caption, { color: theme.colors.primaryText, flexShrink: 1 }]} numberOfLines={1} ellipsizeMode="tail">{offer.message}</Text>
					</View>
				) : (<View style={styles.messageText} />)}

				<QPButton
					title={offer.type === 'buy' ? 'Vender' : 'Comprar'}
					style={{ backgroundColor: offer.type === 'buy' ? theme.colors.danger : theme.colors.success, width: 75, height: 24, borderRadius: 5, paddingHorizontal: 5, paddingVertical: 2 }}
					textStyle={{ color: offer.type === 'buy' ? theme.colors.almostWhite : theme.colors.almostBlack, fontSize: 13, fontWeight: '400' }}
					onPress={() => (navigation.navigate(ROUTES.P2P_OFFER_SCREEN, { p2p_uuid: offer.uuid }))}
				/>
			</View>
		</View>
	);
}

const styles = StyleSheet.create({
	offerCard: {
		borderRadius: 12,
		paddingHorizontal: 12,
		paddingVertical: 8,
		marginBottom: 8,
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
