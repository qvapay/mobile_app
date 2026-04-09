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
import { toast } from 'sonner-native'

// Helpers
import { copyTextToClipboard } from '../../../helpers'

// Online Status
import { useOnlineStatus } from '../../../hooks/OnlineStatusContext'

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

	// Online status
	const { trackUsers, untrackUsers, isUserOnline } = useOnlineStatus()

	// State
	const [referrals, setReferrals] = useState([])
	const [totalReferrals, setTotalReferrals] = useState(0)
	const [smsEarnings, setSmsEarnings] = useState(0)
	const [smsBudgetRemaining, setSmsBudgetRemaining] = useState(5)
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
				setSmsEarnings(data.smsEarningsThisMonth || 0)
				setSmsBudgetRemaining(data.smsBudgetRemaining ?? 5)
			}
		} catch (error) {
			toast.error('Error al cargar los referidos')
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

	// Track referrals for online status
	useEffect(() => {
		const ids = referrals.map(r => r.uuid).filter(Boolean)
		if (ids.length) trackUsers(ids)
		return () => { if (ids.length) untrackUsers(ids) }
	}, [referrals, trackUsers, untrackUsers])

	// Load data on mount
	useEffect(() => {
		loadReferralData()
	}, [])

	// Copy referral link
	const handleCopyLink = () => {
		copyTextToClipboard(referralLink)
		toast.success('Enlace copiado al portapapeles')
	}

	// Share with source tracking
	const shareWithTracking = (channel, openUrl) => {
		openUrl()
		userApi.trackShareAttempt(channel).catch(() => {})
	}

	// Social share handlers
	const shareToX = () => shareWithTracking('x', () => {
		const link = `${referralLink}?source=x`
		const msg = `Únete a QvaPay usando mi enlace de referido: ${link}`
		Linking.openURL(`https://x.com/intent/tweet?text=${encodeURIComponent(msg)}`)
	})

	const shareToFacebook = () => shareWithTracking('facebook', () => {
		const link = `${referralLink}?source=facebook`
		Linking.openURL(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(link)}`)
	})

	const shareToTelegram = () => shareWithTracking('telegram', () => {
		const link = `${referralLink}?source=telegram`
		Linking.openURL(`https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent('Únete a QvaPay usando mi enlace de referido')}`)
	})

	const shareToSMS = () => shareWithTracking('sms', () => {
		const link = `${referralLink}?source=sms`
		const msg = `Únete a QvaPay usando mi enlace de referido: ${link}`
		const separator = Platform.OS === 'ios' ? '&' : '?'
		Linking.openURL(`sms:${separator}body=${encodeURIComponent(msg)}`)
	})

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
						<Text style={[styles.statValue, { color: theme.colors.primary, fontSize: theme.typography.fontSize.xl, fontFamily: theme.typography.fontFamily.medium }]}>{totalReferrals}</Text>
						<Text style={[styles.statLabel, { color: theme.colors.secondaryText, fontSize: theme.typography.fontSize.xs, fontFamily: theme.typography.fontFamily.regular }]}>Referidos</Text>
					</View>
					<View style={[styles.statDivider, { backgroundColor: theme.colors.elevation }]} />
					<View style={styles.statItem}>
						<View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
							<FontAwesome6 name="circle-check" size={14} color={theme.colors.success} iconStyle="solid" />
							<Text style={[styles.statValue, { color: theme.colors.primaryText, fontSize: theme.typography.fontSize.xl, fontFamily: theme.typography.fontFamily.medium }]}>{verifiedCount}</Text>
						</View>
						<Text style={[styles.statLabel, { color: theme.colors.secondaryText, fontSize: theme.typography.fontSize.xs, fontFamily: theme.typography.fontFamily.regular }]}>Verificados</Text>
					</View>
					<View style={[styles.statDivider, { backgroundColor: theme.colors.elevation }]} />
					<View style={styles.statItem}>
						<Text style={[styles.statValue, { color: theme.colors.primaryText, fontSize: theme.typography.fontSize.xl, fontFamily: theme.typography.fontFamily.medium }]}>{referrals.length - verifiedCount}</Text>
						<Text style={[styles.statLabel, { color: theme.colors.secondaryText, fontSize: theme.typography.fontSize.xs, fontFamily: theme.typography.fontFamily.regular }]}>Pendientes</Text>
					</View>
				</View>

				{/* SMS Earnings Card */}
				<View style={[styles.statsCard, { backgroundColor: theme.colors.surface, marginTop: 12 }]}>
					<View style={styles.statItem}>
						<Text style={[styles.statValue, { color: theme.colors.success, fontSize: theme.typography.fontSize.xl, fontFamily: theme.typography.fontFamily.medium }]}>
							${smsEarnings.toFixed(2)}
						</Text>
						<Text style={[styles.statLabel, { color: theme.colors.secondaryText, fontSize: theme.typography.fontSize.xs, fontFamily: theme.typography.fontFamily.regular }]}>Ganado este mes</Text>
					</View>
					<View style={[styles.statDivider, { backgroundColor: theme.colors.elevation }]} />
					<View style={styles.statItem}>
						<Text style={[styles.statValue, { color: theme.colors.primaryText, fontSize: theme.typography.fontSize.xl, fontFamily: theme.typography.fontFamily.medium }]}>
							${smsBudgetRemaining.toFixed(2)}
						</Text>
						<Text style={[styles.statLabel, { color: theme.colors.secondaryText, fontSize: theme.typography.fontSize.xs, fontFamily: theme.typography.fontFamily.regular }]}>Disponible</Text>
					</View>
				</View>

				{/* Share Card */}
				<View style={[styles.shareCard, { backgroundColor: theme.colors.surface }]}>
					<Text style={[styles.shareTitle, { color: theme.colors.primaryText, fontSize: theme.typography.fontSize.sm, fontFamily: theme.typography.fontFamily.medium }]}>Tu enlace de referido</Text>
					<Pressable onPress={handleCopyLink} style={[styles.linkBox, { backgroundColor: theme.colors.background }]}>
						<FontAwesome6 name="link" size={14} color={theme.colors.primary} iconStyle="solid" />
						<Text style={[styles.linkText, { color: theme.colors.secondaryText, fontSize: theme.typography.fontSize.sm, fontFamily: theme.typography.fontFamily.regular }]} numberOfLines={1}>
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
					<Text style={[styles.sectionTitle, { color: theme.colors.primaryText, fontSize: theme.typography.fontSize.sm, fontFamily: theme.typography.fontFamily.medium }]}>
						<FontAwesome6 name="lightbulb" size={14} color={theme.colors.warning} iconStyle="solid" />
						{'  '}Cómo funciona
					</Text>
					<Step number="1" text="Comparte tu enlace por SMS u otras redes" theme={theme} />
					<Step number="2" text="Tu amigo se registra y confirma su correo" theme={theme} />
					<Step number="3" text="Recibes $0.01 por cada registro vía SMS (hasta $5/mes)" theme={theme} />
				</View>

				{/* Referrals List */}
				<View style={{ marginTop: 20 }}>
					<Text style={[styles.sectionTitle, { color: theme.colors.primaryText, marginBottom: 12, fontSize: theme.typography.fontSize.sm, fontFamily: theme.typography.fontFamily.medium }]}>
						Mis referidos ({totalReferrals})
					</Text>

					{referrals.length === 0 ? (
						<View style={[styles.emptyState, { backgroundColor: theme.colors.surface }]}>
							<FontAwesome6 name="user-group" size={32} color={theme.colors.secondaryText} iconStyle="solid" />
							<Text style={[styles.emptyTitle, { color: theme.colors.primaryText, fontSize: theme.typography.fontSize.md, fontFamily: theme.typography.fontFamily.medium }]}>
								Aún no tienes referidos
							</Text>
							<Text style={[styles.emptySubtitle, { color: theme.colors.secondaryText, fontSize: theme.typography.fontSize.sm, fontFamily: theme.typography.fontFamily.regular }]}>
								Comparte tu enlace para empezar a invitar amigos
							</Text>
						</View>
					) : (
						referrals.map((referral) => (
							<View key={referral.uuid} style={[styles.referralRow, { backgroundColor: theme.colors.surface }]}>
								<ProfileContainerHorizontal user={referral} size={40} isOnline={isUserOnline(referral.uuid)} />
								{referral.kyc ? (
									<View style={[styles.badge, { backgroundColor: theme.colors.success + '20' }]}>
										<FontAwesome6 name="circle-check" size={10} color={theme.colors.success} iconStyle="solid" />
										<Text style={[styles.badgeText, { color: theme.colors.success, fontSize: theme.typography.fontSize.xs, fontFamily: theme.typography.fontFamily.medium }]}>KYC</Text>
									</View>
								) : (
									<View style={[styles.badge, { backgroundColor: theme.colors.warning + '20' }]}>
										<FontAwesome6 name="clock" size={10} color={theme.colors.warning} iconStyle="solid" />
										<Text style={[styles.badgeText, { color: theme.colors.warning, fontSize: theme.typography.fontSize.xs, fontFamily: theme.typography.fontFamily.medium }]}>Pendiente</Text>
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
		<Text style={[styles.socialLabel, { color: theme.colors.secondaryText, fontSize: theme.typography.fontSize.xs, fontFamily: theme.typography.fontFamily.regular }]}>{label}</Text>
	</Pressable>
)

// Step component for "how it works"
const Step = ({ number, text, theme }) => (
	<View style={styles.stepRow}>
		<View style={[styles.stepCircle, { backgroundColor: theme.colors.primary + '20' }]}>
			<Text style={[styles.stepNumber, { color: theme.colors.primary, fontSize: theme.typography.fontSize.sm, fontFamily: theme.typography.fontFamily.medium }]}>{number}</Text>
		</View>
		<Text style={[styles.stepText, { color: theme.colors.secondaryText, fontSize: theme.typography.fontSize.sm, fontFamily: theme.typography.fontFamily.regular }]}>{text}</Text>
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
	},
	statLabel: {
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
	},
	howItWorks: {
		borderRadius: 12,
		padding: 16,
		marginTop: 12,
	},
	sectionTitle: {
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
	},
	stepText: {
		flex: 1,
	},
	emptyState: {
		borderRadius: 12,
		padding: 30,
		alignItems: 'center',
		gap: 8,
	},
	emptyTitle: {
		marginTop: 4,
	},
	emptySubtitle: {
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
	},
})

export default Referals
