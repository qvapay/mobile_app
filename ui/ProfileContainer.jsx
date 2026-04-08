import { View, Text, Image, Pressable, StyleSheet, Platform } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import LinearGradient from 'react-native-linear-gradient'
import FastImage from '@d11/react-native-fast-image'

// Theme Context
import { useTheme } from '../theme/ThemeContext'
import { useTextStyles } from '../theme/themeUtils'

// UI Particles
import QPAvatar from './particles/QPAvatar'

// Icons
import FontAwesome6 from '@react-native-vector-icons/fontawesome6'

const COVER_VISIBLE_HEIGHT = 200
const HEADER_HEIGHT = Platform.OS === 'ios' ? 44 : 56

// Profile Container Component
const ProfileContainer = ({ user = {}, onEditAvatar, onEditCover }) => {

	// Contexts
	const { theme } = useTheme()
	const textStyles = useTextStyles(theme)
	const insets = useSafeAreaInsets()

	// Total offset to pull cover behind header + status bar + container padding
	const topOffset = insets.top + HEADER_HEIGHT
	const totalCoverHeight = COVER_VISIBLE_HEIGHT + topOffset

	// Qvapay Logo based on theme
	const qvapayLogo = theme.isDark ? require('../assets/images/ui/qvapay-logo-white.png') : require('../assets/images/ui/logo-qvapay.png')

	// P2P Stats
	const p2pCount = user.p2p_completed_count || 0
	const rating = user.p2p_average_rating || 0
	const trustScore = user.trustscore || 0

	const hasCover = !!user.cover_photo_url

	return (
		<View style={{ alignItems: 'center' }}>

			{/* Cover Image Area - extends behind header + status bar */}
			<View style={[styles.coverContainer, { backgroundColor: theme.colors.surface, height: totalCoverHeight, marginTop: -topOffset }]}>
				{hasCover ? (
					<FastImage
						source={{ uri: user.cover_photo_url, priority: FastImage.priority.high }}
						style={StyleSheet.absoluteFill}
						resizeMode={FastImage.resizeMode.cover}
					/>
				) : (
					<View style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center' }]}>
						<FontAwesome6 name="image" size={40} color={theme.colors.elevation} iconStyle="solid" />
					</View>
				)}
				{/* Gradient fade at the bottom */}
				<LinearGradient
					colors={['transparent', theme.colors.background]}
					start={{ x: 0.5, y: 0.6 }}
					end={{ x: 0.5, y: 1 }}
					style={StyleSheet.absoluteFill}
				/>
				{/* Cover edit button */}
				{onEditCover && (
					<Pressable onPress={onEditCover} style={[styles.coverEditButton, { backgroundColor: theme.colors.primary }]}>
						<FontAwesome6 name="pen" size={12} color="#fff" iconStyle="solid" />
					</Pressable>
				)}
			</View>

			{/* Avatar overlapping the cover */}
			<View style={styles.avatarWrapper}>
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
			</View>

			<View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 8 }}>
				{user.name && (<Text style={[textStyles.h1, { marginVertical: 0, paddingVertical: 0 }]}>{user.name || ''}</Text>)}
				{user.kyc && (<Image source={require('../assets/images/ui/blue-badge.png')} style={{ width: 20, height: 20 }} />)}
				{user.golden_check && (<FontAwesome6 name="crown" size={18} color={theme.colors.gold} iconStyle="solid" />)}
				{user.role === 'admin' && (<Image source={qvapayLogo} style={{ width: 20, height: 20 }} />)}
			</View>
			{user.username && (<Text style={[textStyles.h4, { color: theme.colors.secondaryText, marginVertical: 0, paddingVertical: 0 }]}>@{user.username}</Text>)}

			{/* P2P Stats Card */}
			<View style={[styles.statsCard, { backgroundColor: theme.colors.surface }]}>
				<View style={styles.statItem}>
					<Text style={[styles.statValue, { color: theme.colors.primaryText, fontSize: theme.typography.fontSize.lg, fontFamily: theme.typography.fontFamily.medium }]}>{p2pCount}</Text>
					<Text style={[styles.statLabel, { color: theme.colors.secondaryText, fontSize: theme.typography.fontSize.xs, fontFamily: theme.typography.fontFamily.regular }]}>Operaciones</Text>
				</View>
				<View style={[styles.statDivider, { backgroundColor: theme.colors.secondaryText }]} />
				<View style={styles.statItem}>
					<View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
						<FontAwesome6 name="star" size={14} color={theme.colors.warning} iconStyle="solid" />
						<Text style={[styles.statValue, { color: theme.colors.primaryText, fontSize: theme.typography.fontSize.lg, fontFamily: theme.typography.fontFamily.medium }]}>{rating.toFixed(1)}</Text>
					</View>
					<Text style={[styles.statLabel, { color: theme.colors.secondaryText, fontSize: theme.typography.fontSize.xs, fontFamily: theme.typography.fontFamily.regular }]}>Rating</Text>
				</View>
				<View style={[styles.statDivider, { backgroundColor: theme.colors.secondaryText }]} />
				<View style={styles.statItem}>
					<Text style={[styles.statValue, { color: theme.colors.primaryText, fontSize: theme.typography.fontSize.lg, fontFamily: theme.typography.fontFamily.medium }]}>{trustScore}</Text>
					<Text style={[styles.statLabel, { color: theme.colors.secondaryText, fontSize: theme.typography.fontSize.xs, fontFamily: theme.typography.fontFamily.regular }]}>TrustScore</Text>
				</View>
			</View>
		</View>
	)
}

const styles = StyleSheet.create({
	coverContainer: {
		marginHorizontal: -16,
		alignSelf: 'stretch',
		overflow: 'hidden',
	},
	coverEditButton: {
		position: 'absolute',
		bottom: 40,
		right: 12,
		width: 28,
		height: 28,
		borderRadius: 14,
		alignItems: 'center',
		justifyContent: 'center',
	},
	avatarWrapper: {
		marginTop: -60,
		alignItems: 'center',
	},
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
	statValue: {},
	statLabel: {},
	statDivider: {
		width: StyleSheet.hairlineWidth,
		height: 28,
		opacity: 0.4,
	},
})

export default ProfileContainer