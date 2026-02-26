import { useState, useEffect } from 'react'
import { StyleSheet, Text, View, ScrollView, Pressable, Linking, Platform } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

// Theme Context
import { useTheme } from '../../../theme/ThemeContext'
import { createTextStyles, createContainerStyles } from '../../../theme/themeUtils'

// Auth Context
import { useAuth } from '../../../auth/AuthContext'

// API
import { userApi } from '../../../api/userApi'

// UI Components
import QPLoader from '../../../ui/particles/QPLoader'
import ProfileContainerHorizontal from '../../../ui/ProfileContainerHorizontal'

// Icons
import FontAwesome6 from '@react-native-vector-icons/fontawesome6'

// Toast
import Toast from 'react-native-toast-message'

// Helpers
import { copyTextToClipboard } from '../../../helpers'

// Pull-to-refresh
import { createHiddenRefreshControl } from '../../../ui/QPRefreshIndicator'

// Referals Component
const Referals = () => {

	// Contexts
	const { user } = useAuth()
	const { theme } = useTheme()
	const textStyles = createTextStyles(theme)
	const containerStyles = createContainerStyles(theme)
	const insets = useSafeAreaInsets()

	// State
	const [referrals, setReferrals] = useState([])
	const [totalReferrals, setTotalReferrals] = useState(0)
	const [loading, setLoading] = useState(true)
	const [refreshing, setRefreshing] = useState(false)

	// Referral link
	const referralLink = `https://qvapay.com/register/${user.username}`

	// Load referral data
	const loadReferralData = async () => {
		try {
			setLoading(true)
			const response = await userApi.getReferrals()
			if (response.success && response.data) {
				const data = response.data
				setReferrals(data.referrals || [])
				setTotalReferrals(data.totalReferrals || 0)
			}
		} catch (error) {
			Toast.show({ type: 'error', text1: 'Error al cargar los referidos' })
		} finally {
			setLoading(false)
		}
	}

	// Refresh data
	const onRefresh = async () => {
		setRefreshing(true)
		await loadReferralData()
		setRefreshing(false)
	}

	// Load data on mount
	useEffect(() => {
		loadReferralData()
	}, [])

	// Copy referral link
	const handleCopyLink = () => {
		copyTextToClipboard(referralLink)
		Toast.show({ type: 'success', text1: 'Enlace copiado al portapapeles' })
	}

	// Share message
	const shareMessage = `Únete a QvaPay usando mi enlace de referido: ${referralLink}`

	// Social share handlers
	const shareToX = () => {
		const url = `https://x.com/intent/tweet?text=${encodeURIComponent(shareMessage)}`
		Linking.openURL(url)
	}

	const shareToFacebook = () => {
		const url = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(referralLink)}`
		Linking.openURL(url)
	}

	const shareToTelegram = () => {
		const url = `https://t.me/share/url?url=${encodeURIComponent(referralLink)}&text=${encodeURIComponent('Únete a QvaPay usando mi enlace de referido')}`
		Linking.openURL(url)
	}

	const shareToSMS = () => {
		const separator = Platform.OS === 'ios' ? '&' : '?'
		const url = `sms:${separator}body=${encodeURIComponent(shareMessage)}`
		Linking.openURL(url)
	}

	// Derived stats
	const verifiedCount = referrals.filter(r => r.kyc).length

	if (loading) return <QPLoader />

	return (
		<View style={containerStyles.subContainer}>
			<ScrollView
				style={{ flex: 1 }}
				refreshControl={createHiddenRefreshControl(refreshing, onRefresh)}
			>

				<Text style={textStyles.h1}>Referidos</Text>
				<Text style={[textStyles.h3, { color: theme.colors.secondaryText }]}>
					Invita amigos y gana recompensas
				</Text>

				{/* Stats Row */}
				<View style={[styles.statsCard, { backgroundColor: theme.colors.surface }]}>
					<View style={styles.statItem}>
						<Text style={[styles.statValue, { color: theme.colors.primary }]}>{totalReferrals}</Text>
						<Text style={[styles.statLabel, { color: theme.colors.secondaryText }]}>Referidos</Text>
					</View>
					<View style={[styles.statDivider, { backgroundColor: theme.colors.elevation }]} />
					<View style={styles.statItem}>
						<View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
							<FontAwesome6 name="circle-check" size={14} color={theme.colors.success} iconStyle="solid" />
							<Text style={[styles.statValue, { color: theme.colors.primaryText }]}>{verifiedCount}</Text>
						</View>
						<Text style={[styles.statLabel, { color: theme.colors.secondaryText }]}>Verificados</Text>
					</View>
					<View style={[styles.statDivider, { backgroundColor: theme.colors.elevation }]} />
					<View style={styles.statItem}>
						<Text style={[styles.statValue, { color: theme.colors.primaryText }]}>{referrals.length - verifiedCount}</Text>
						<Text style={[styles.statLabel, { color: theme.colors.secondaryText }]}>Pendientes</Text>
					</View>
				</View>

				{/* Share Card */}
				<View style={[styles.shareCard, { backgroundColor: theme.colors.surface }]}>
					<Text style={[styles.shareTitle, { color: theme.colors.primaryText }]}>Tu enlace de referido</Text>
					<Pressable onPress={handleCopyLink} style={[styles.linkBox, { backgroundColor: theme.colors.background }]}>
						<FontAwesome6 name="link" size={14} color={theme.colors.primary} iconStyle="solid" />
						<Text style={[styles.linkText, { color: theme.colors.secondaryText }]} numberOfLines={1}>
							{referralLink}
						</Text>
						<FontAwesome6 name="copy" size={14} color={theme.colors.secondaryText} iconStyle="regular" />
					</Pressable>
					<View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 14, paddingHorizontal: 8 }}>
						<SocialButton icon="x-twitter" label="X" color="#000" iconStyle="brand" onPress={shareToX} theme={theme} />
						<SocialButton icon="facebook" label="Facebook" color="#1877F2" iconStyle="brand" onPress={shareToFacebook} theme={theme} />
						<SocialButton icon="telegram" label="Telegram" color="#26A5E4" iconStyle="brand" onPress={shareToTelegram} theme={theme} />
						<SocialButton icon="comment-sms" label="SMS" color={theme.colors.success} iconStyle="solid" onPress={shareToSMS} theme={theme} />
					</View>
				</View>

				{/* How it works */}
				<View style={[styles.howItWorks, { backgroundColor: theme.colors.surface }]}>
					<Text style={[styles.sectionTitle, { color: theme.colors.primaryText }]}>
						<FontAwesome6 name="lightbulb" size={14} color={theme.colors.warning} iconStyle="solid" />
						{'  '}Cómo funciona
					</Text>
					<Step number="1" text="Comparte tu enlace con amigos" theme={theme} />
					<Step number="2" text="Tu amigo se registra en QvaPay" theme={theme} />
					<Step number="3" text="Ambos reciben recompensas al verificarse" theme={theme} />
				</View>

				{/* Referrals List */}
				<View style={{ marginTop: 20 }}>
					<Text style={[styles.sectionTitle, { color: theme.colors.primaryText, marginBottom: 12 }]}>
						Mis referidos ({totalReferrals})
					</Text>

					{referrals.length === 0 ? (
						<View style={[styles.emptyState, { backgroundColor: theme.colors.surface }]}>
							<FontAwesome6 name="user-group" size={32} color={theme.colors.secondaryText} iconStyle="solid" />
							<Text style={[styles.emptyTitle, { color: theme.colors.primaryText }]}>
								Aún no tienes referidos
							</Text>
							<Text style={[styles.emptySubtitle, { color: theme.colors.secondaryText }]}>
								Comparte tu enlace para empezar a invitar amigos
							</Text>
						</View>
					) : (
						referrals.map((referral) => (
							<View key={referral.uuid} style={[styles.referralRow, { backgroundColor: theme.colors.surface }]}>
								<ProfileContainerHorizontal user={referral} size={40} />
								{referral.kyc ? (
									<View style={[styles.badge, { backgroundColor: theme.colors.success + '20' }]}>
										<FontAwesome6 name="circle-check" size={10} color={theme.colors.success} iconStyle="solid" />
										<Text style={[styles.badgeText, { color: theme.colors.success }]}>KYC</Text>
									</View>
								) : (
									<View style={[styles.badge, { backgroundColor: theme.colors.warning + '20' }]}>
										<FontAwesome6 name="clock" size={10} color={theme.colors.warning} iconStyle="solid" />
										<Text style={[styles.badgeText, { color: theme.colors.warning }]}>Pendiente</Text>
									</View>
								)}
							</View>
						))
					)}
				</View>

				{/* Bottom spacing */}
				<View style={{ height: insets.bottom + 20 }} />

			</ScrollView>
		</View>
	)
}

// Social share button
const SocialButton = ({ icon, label, color, iconStyle, onPress, theme }) => (
	<Pressable onPress={onPress} style={styles.socialButton}>
		<View style={[styles.socialCircle, { backgroundColor: color + '18' }]}>
			<FontAwesome6 name={icon} size={18} color={color} iconStyle={iconStyle} />
		</View>
		<Text style={[styles.socialLabel, { color: theme.colors.secondaryText }]}>{label}</Text>
	</Pressable>
)

// Step component for "how it works"
const Step = ({ number, text, theme }) => (
	<View style={styles.stepRow}>
		<View style={[styles.stepCircle, { backgroundColor: theme.colors.primary + '20' }]}>
			<Text style={[styles.stepNumber, { color: theme.colors.primary }]}>{number}</Text>
		</View>
		<Text style={[styles.stepText, { color: theme.colors.secondaryText }]}>{text}</Text>
	</View>
)

const styles = StyleSheet.create({
	statsCard: {
		flexDirection: 'row',
		alignItems: 'center',
		borderRadius: 12,
		paddingVertical: 14,
		paddingHorizontal: 20,
		marginTop: 16,
	},
	statItem: {
		flex: 1,
		alignItems: 'center',
		gap: 4,
	},
	statValue: {
		fontSize: 20,
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
	shareCard: {
		borderRadius: 12,
		padding: 16,
		marginTop: 12,
	},
	shareTitle: {
		fontSize: 14,
		fontFamily: 'Rubik-Medium',
		marginBottom: 10,
	},
	linkBox: {
		flexDirection: 'row',
		alignItems: 'center',
		gap: 10,
		paddingHorizontal: 12,
		paddingVertical: 10,
		borderRadius: 8,
	},
	linkText: {
		flex: 1,
		fontSize: 13,
		fontFamily: 'Rubik-Regular',
	},
	howItWorks: {
		borderRadius: 12,
		padding: 16,
		marginTop: 12,
	},
	sectionTitle: {
		fontSize: 14,
		fontFamily: 'Rubik-Medium',
	},
	stepRow: {
		flexDirection: 'row',
		alignItems: 'center',
		gap: 12,
		marginTop: 12,
	},
	stepCircle: {
		width: 28,
		height: 28,
		borderRadius: 14,
		alignItems: 'center',
		justifyContent: 'center',
	},
	stepNumber: {
		fontSize: 13,
		fontFamily: 'Rubik-Medium',
	},
	stepText: {
		fontSize: 13,
		fontFamily: 'Rubik-Regular',
		flex: 1,
	},
	emptyState: {
		borderRadius: 12,
		padding: 30,
		alignItems: 'center',
		gap: 8,
	},
	emptyTitle: {
		fontSize: 15,
		fontFamily: 'Rubik-Medium',
		marginTop: 4,
	},
	emptySubtitle: {
		fontSize: 13,
		fontFamily: 'Rubik-Regular',
		textAlign: 'center',
	},
	referralRow: {
		flexDirection: 'row',
		alignItems: 'center',
		justifyContent: 'space-between',
		borderRadius: 10,
		paddingHorizontal: 12,
		paddingVertical: 10,
		marginBottom: 6,
	},
	badge: {
		flexDirection: 'row',
		alignItems: 'center',
		gap: 4,
		paddingHorizontal: 8,
		paddingVertical: 4,
		borderRadius: 12,
	},
	badgeText: {
		fontSize: 11,
		fontFamily: 'Rubik-Medium',
	},
	socialButton: {
		alignItems: 'center',
		gap: 6,
	},
	socialCircle: {
		width: 48,
		height: 48,
		borderRadius: 24,
		alignItems: 'center',
		justifyContent: 'center',
	},
	socialLabel: {
		fontSize: 11,
		fontFamily: 'Rubik-Regular',
	},
})

export default Referals
