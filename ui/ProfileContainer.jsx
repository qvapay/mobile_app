import { View, Text, Image, Pressable, StyleSheet } from 'react-native'

// Theme Context
import { useTheme } from '../theme/ThemeContext'
import { useTextStyles } from '../theme/themeUtils'

// UI Particles
import QPAvatar from './particles/QPAvatar'

// Icons
import FontAwesome6 from '@react-native-vector-icons/fontawesome6'

// Profile Container Component
const ProfileContainer = ({ user = {}, onEditAvatar }) => {

	// Contexts
	const { theme } = useTheme()
	const textStyles = useTextStyles(theme)

	// Qvapay Logo based on theme
	const qvapayLogo = theme.isDark ? require('../assets/images/ui/qvapay-logo-white.png') : require('../assets/images/ui/logo-qvapay.png')

	// P2P Stats
	const p2pCount = user.p2p_completed_count || 0
	const rating = user.p2p_average_rating || 0
	const trustScore = user.trustscore || 0

	return (
		<View style={{ alignItems: 'center', marginVertical: 10 }}>
			<Pressable onPress={onEditAvatar} disabled={!onEditAvatar}>
				<View style={{ position: 'relative' }}>
					<QPAvatar size={120} user={user} />
					{onEditAvatar && (
						<View style={{
							position: 'absolute',
							bottom: 4,
							right: 4,
							width: 28,
							height: 28,
							borderRadius: 14,
							backgroundColor: theme.colors.primary,
							alignItems: 'center',
							justifyContent: 'center',
							borderWidth: 2,
							borderColor: theme.colors.background,
						}}>
							<FontAwesome6 name="pen" size={12} color="#fff" iconStyle="solid" />
						</View>
					)}
				</View>
			</Pressable>
			<View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 15 }}>
				{user.name && (<Text style={[textStyles.h1, { marginVertical: 0, paddingVertical: 0 }]}>{user.name || ''}</Text>)}
				{user.kyc && (<Image source={require('../assets/images/ui/blue-badge.png')} style={{ width: 20, height: 20 }} />)}
				{user.golden_check && (<FontAwesome6 name="crown" size={18} color={theme.colors.gold} iconStyle="solid" />)}
				{user.role == 'admin' && (<Image source={qvapayLogo} style={{ width: 20, height: 20 }} />)}
			</View>
			{user.username && (<Text style={[textStyles.h4, { color: theme.colors.secondaryText, marginVertical: 0, paddingVertical: 0 }]}>@{user.username}</Text>)}

			{/* P2P Stats Card */}
			<View style={[styles.statsCard, { backgroundColor: theme.colors.surface }]}>
				<View style={styles.statItem}>
					<Text style={[styles.statValue, { color: theme.colors.primaryText }]}>{p2pCount}</Text>
					<Text style={[styles.statLabel, { color: theme.colors.secondaryText }]}>Operaciones</Text>
				</View>
				<View style={[styles.statDivider, { backgroundColor: theme.colors.elevation }]} />
				<View style={styles.statItem}>
					<View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
						<FontAwesome6 name="star" size={14} color={theme.colors.warning} iconStyle="solid" />
						<Text style={[styles.statValue, { color: theme.colors.primaryText }]}>{rating.toFixed(1)}</Text>
					</View>
					<Text style={[styles.statLabel, { color: theme.colors.secondaryText }]}>Rating</Text>
				</View>
				<View style={[styles.statDivider, { backgroundColor: theme.colors.elevation }]} />
				<View style={styles.statItem}>
					<Text style={[styles.statValue, { color: theme.colors.primaryText }]}>{trustScore}</Text>
					<Text style={[styles.statLabel, { color: theme.colors.secondaryText }]}>TrustScore</Text>
				</View>
			</View>
		</View>
	)
}

const styles = StyleSheet.create({
	statsCard: {
		flexDirection: 'row',
		alignItems: 'center',
		borderRadius: 12,
		paddingVertical: 12,
		paddingHorizontal: 20,
		marginTop: 16,
		width: '100%',
	},
	statItem: {
		flex: 1,
		alignItems: 'center',
		gap: 4,
	},
	statValue: {
		fontSize: 18,
		fontFamily: 'Rubik-Medium',
	},
	statLabel: {
		fontSize: 11,
		fontFamily: 'Rubik-Regular',
	},
	statDivider: {
		width: 1,
		height: 30,
	},
})

export default ProfileContainer