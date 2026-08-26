import { useState, useEffect, useCallback } from 'react'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { StyleSheet, Text, View, ScrollView, Pressable, Linking, Platform } from 'react-native'
import { useTranslation } from 'react-i18next'

// Theme Context
import { useTheme } from '../../../theme/ThemeContext'
import { createTextStyles, createContainerStyles } from '../../../theme/themeUtils'

// Auth Context
import { useAuth } from '../../../auth/AuthContext'

// API
import { userApi } from '../../../api/userApi'
import { unwrap } from '../../../api/unwrap'
import { useQuery } from '@tanstack/react-query'

// UI Components
import QPLoader from '../../../ui/particles/QPLoader'
import ProfileContainerHorizontal from '../../../ui/ProfileContainerHorizontal'

// Icons
import FontAwesome6 from '@react-native-vector-icons/fontawesome6'

// Toast
import { toast } from 'sonner-native'

// Helpers
import { copyTextToClipboard } from '../../../helpers'
import { buildPlayReferralLink, buildWebReferralLink, buildReferralMessage } from '../../../helpers/referralLinks'

// Online Status
import { useOnlineStatus } from '../../../hooks/OnlineStatusContext'

// Pull-to-refresh
import { createHiddenRefreshControl } from '../../../ui/QPRefreshIndicator'

// Tipos
import type { ReactElement } from 'react'
import type { RefreshControlProps } from 'react-native'
import type { FontAwesome6SolidIconName, FontAwesome6BrandIconName } from '@react-native-vector-icons/fontawesome6'
import type { Theme } from '../../../theme/ThemeContext'

/** Referido tal como lo pinta la lista (subset del perfil + flag KYC). */
type Referral = {
	uuid: string
	username?: string
	name?: string
	lastname?: string
	image?: string | null
	kyc?: boolean
}

/** Payload de `GET /user/referrals` (el módulo declara `unknown`). */
type ReferralsPayload = {
	referrals?: Referral[]
	totalReferrals?: number
	smsEarningsThisMonth?: number
	smsBudgetRemaining?: number
}

// Referral stats all arrive together from one API call — keep them as one unit
/** Referidos del usuario, normalizados a lo que pinta la pantalla. */
const useReferralsQuery = () => useQuery({
	queryKey: ['user', 'referrals'],
	queryFn: async () => {
		// userApi.getReferrals declara `ApiResult<unknown>`: forma local del envelope.
		const data = (unwrap(await userApi.getReferrals()) || {}) as ReferralsPayload
		return {
			referrals: data.referrals || [],
			totalReferrals: data.totalReferrals || 0,
			smsEarnings: data.smsEarningsThisMonth || 0,
			smsBudgetRemaining: data.smsBudgetRemaining ?? 5,
		}
	},
	placeholderData: previous => previous,
})

// Share with source tracking
const shareWithTracking = (channel: string, openUrl: () => void) => {
	openUrl()
	userApi.trackShareAttempt(channel).catch(() => { })
}

// Referals Component
const Referals = () => {

	// Contexts
	const { t } = useTranslation()
	const { user } = useAuth()
	const { theme } = useTheme()
	const textStyles = createTextStyles(theme)
	const containerStyles = createContainerStyles(theme)
	const insets = useSafeAreaInsets()

	// Online status
	const { trackUsers, untrackUsers, isUserOnline } = useOnlineStatus()

	// Data en React Query (persistida: la lista pinta al instante al volver)
	const query = useReferralsQuery()
	const { referrals = [], totalReferrals = 0, smsEarnings = 0, smsBudgetRemaining = 5 } = query.data || {}
	const loading = query.isPending
	const [refreshing, setRefreshing] = useState(false)

	// Referral link shown in the copy box (short); the share buttons send the
	// multiplatform invite (Play link with the invite embedded in the Install
	// Referrer + web fallback for iPhone/desktop)
	const referralLink = buildWebReferralLink(user!.username!)

	// El toast solo cuando no hay NADA que pintar
	useEffect(() => {
		if (query.isError && !query.data) { toast.error(t('settings.referals.toasts.loadFailed')) }
	}, [query.isError, query.data, t])

	// Refresh data
	const { refetch } = query
	const onRefresh = useCallback(async () => {
		setRefreshing(true)
		try { await refetch() }
		catch { /* lo anterior sigue en pantalla */ }
		finally { setRefreshing(false) }
	}, [refetch])

	// Track referrals for online status
	useEffect(() => {
		// `filter(Boolean)` no estrecha el tipo en TS: el cast fija el contrato de trackUsers.
		const ids = referrals.map((r: Referral) => r.uuid).filter(Boolean) as string[]
		if (ids.length) trackUsers(ids)
		return () => { if (ids.length) untrackUsers(ids) }
	}, [referrals, trackUsers, untrackUsers])

	// Copy the full multiplatform invite (for WhatsApp and any other channel)
	const handleCopyLink = () => {
		copyTextToClipboard(buildReferralMessage(user!.username!, 'link'))
		toast.success(t('settings.referals.toasts.inviteCopied'))
	}

	// Social share handlers — text channels carry the full invite message;
	// Facebook's sharer only accepts a URL, so it gets the Play link directly
	const shareToX = () => shareWithTracking('x', () => {
		const msg = buildReferralMessage(user!.username!, 'x')
		Linking.openURL(`https://x.com/intent/tweet?text=${encodeURIComponent(msg)}`)
	})

	const shareToFacebook = () => shareWithTracking('facebook', () => {
		const link = buildPlayReferralLink(user!.username!, 'facebook')
		Linking.openURL(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(link)}`)
	})

	const shareToTelegram = () => shareWithTracking('telegram', () => {
		const link = buildPlayReferralLink(user!.username!, 'telegram')
		const text = t('settings.referals.shareMessages.telegram', { username: user!.username!, link: buildWebReferralLink(user!.username!, 'telegram') })
		Linking.openURL(`https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent(text)}`)
	})

	const shareToSMS = () => shareWithTracking('sms', () => {
		const msg = buildReferralMessage(user!.username!, 'sms')
		const separator = Platform.OS === 'ios' ? '&' : '?'
		Linking.openURL(`sms:${separator}body=${encodeURIComponent(msg)}`)
	})

	// Derived stats
	const verifiedCount = referrals.filter((r: Referral) => r.kyc).length

	if (loading) return <QPLoader />

	return (
		<View style={containerStyles.subContainer}>
			<ScrollView
				style={{ flex: 1 }}
				refreshControl={createHiddenRefreshControl(refreshing, onRefresh) as ReactElement<RefreshControlProps>}
			>

				<Text style={textStyles.h1}>{t('settings.referals.title')}</Text>
				<Text style={[textStyles.h3, { color: theme.colors.secondaryText }]}>
					{t('settings.referals.subtitle')}
				</Text>

				{/* Stats Row */}
				<View style={[styles.statsCard, { backgroundColor: theme.colors.surface }]}>
					<View style={styles.statItem}>
						<Text style={[styles.statValue, { color: theme.colors.primary, fontSize: theme.typography.fontSize.xl, fontFamily: theme.typography.fontFamily.medium }]}>{totalReferrals}</Text>
						<Text style={[styles.statLabel, { color: theme.colors.secondaryText, fontSize: theme.typography.fontSize.xs, fontFamily: theme.typography.fontFamily.regular }]}>{t('settings.referals.stats.referrals')}</Text>
					</View>
					<View style={[styles.statDivider, { backgroundColor: theme.colors.elevation }]} />
					<View style={styles.statItem}>
						<View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
							<FontAwesome6 name="circle-check" size={14} color={theme.colors.successText} iconStyle="solid" />
							<Text style={[styles.statValue, { color: theme.colors.primaryText, fontSize: theme.typography.fontSize.xl, fontFamily: theme.typography.fontFamily.medium }]}>{verifiedCount}</Text>
						</View>
						<Text style={[styles.statLabel, { color: theme.colors.secondaryText, fontSize: theme.typography.fontSize.xs, fontFamily: theme.typography.fontFamily.regular }]}>{t('settings.referals.stats.verified')}</Text>
					</View>
					<View style={[styles.statDivider, { backgroundColor: theme.colors.elevation }]} />
					<View style={styles.statItem}>
						<Text style={[styles.statValue, { color: theme.colors.primaryText, fontSize: theme.typography.fontSize.xl, fontFamily: theme.typography.fontFamily.medium }]}>{referrals.length - verifiedCount}</Text>
						<Text style={[styles.statLabel, { color: theme.colors.secondaryText, fontSize: theme.typography.fontSize.xs, fontFamily: theme.typography.fontFamily.regular }]}>{t('settings.referals.stats.pending')}</Text>
					</View>
				</View>

				{/* SMS Earnings Card */}
				<View style={[styles.statsCard, { backgroundColor: theme.colors.surface, marginTop: 12 }]}>
					<View style={styles.statItem}>
						<Text style={[styles.statValue, { color: theme.colors.successText, fontSize: theme.typography.fontSize.xl, fontFamily: theme.typography.fontFamily.medium }]}>
							${smsEarnings.toFixed(2)}
						</Text>
						<Text style={[styles.statLabel, { color: theme.colors.secondaryText, fontSize: theme.typography.fontSize.xs, fontFamily: theme.typography.fontFamily.regular }]}>{t('settings.referals.stats.earnedThisMonth')}</Text>
					</View>
					<View style={[styles.statDivider, { backgroundColor: theme.colors.elevation }]} />
					<View style={styles.statItem}>
						<Text style={[styles.statValue, { color: theme.colors.primaryText, fontSize: theme.typography.fontSize.xl, fontFamily: theme.typography.fontFamily.medium }]}>
							${smsBudgetRemaining.toFixed(2)}
						</Text>
						<Text style={[styles.statLabel, { color: theme.colors.secondaryText, fontSize: theme.typography.fontSize.xs, fontFamily: theme.typography.fontFamily.regular }]}>{t('settings.referals.stats.available')}</Text>
					</View>
				</View>

				{/* Share Card */}
				<View style={[styles.shareCard, { backgroundColor: theme.colors.surface }]}>
					<Text style={[styles.shareTitle, { color: theme.colors.primaryText, fontSize: theme.typography.fontSize.sm, fontFamily: theme.typography.fontFamily.medium }]}>{t('settings.referals.shareTitle')}</Text>
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
						<SocialButton icon="comment-sms" label="SMS" color={theme.colors.successText} iconStyle="solid" onPress={shareToSMS} theme={theme} />
					</View>
				</View>

				{/* How it works */}
				<View style={[styles.howItWorks, { backgroundColor: theme.colors.surface }]}>
					<Text style={[styles.sectionTitle, { color: theme.colors.primaryText, fontSize: theme.typography.fontSize.sm, fontFamily: theme.typography.fontFamily.medium }]}>
						<FontAwesome6 name="lightbulb" size={14} color={theme.colors.warning} iconStyle="solid" />
						{'  '}{t('settings.referals.howItWorks.title')}
					</Text>
					<Step number="1" text={t('settings.referals.howItWorks.step1')} theme={theme} />
					<Step number="2" text={t('settings.referals.howItWorks.step2')} theme={theme} />
					<Step number="3" text={t('settings.referals.howItWorks.step3')} theme={theme} />
				</View>

				{/* Referrals List */}
				<View style={{ marginTop: 20 }}>
					<Text style={[styles.sectionTitle, { color: theme.colors.primaryText, marginBottom: 12, fontSize: theme.typography.fontSize.sm, fontFamily: theme.typography.fontFamily.medium }]}>
						{t('settings.referals.myReferrals', { count: totalReferrals })}
					</Text>

					{referrals.length === 0 ? (
						<View style={[styles.emptyState, { backgroundColor: theme.colors.surface }]}>
							<FontAwesome6 name="user-group" size={32} color={theme.colors.secondaryText} iconStyle="solid" />
							<Text style={[styles.emptyTitle, { color: theme.colors.primaryText, fontSize: theme.typography.fontSize.md, fontFamily: theme.typography.fontFamily.medium }]}>
								{t('settings.referals.empty.title')}
							</Text>
							<Text style={[styles.emptySubtitle, { color: theme.colors.secondaryText, fontSize: theme.typography.fontSize.sm, fontFamily: theme.typography.fontFamily.regular }]}>
								{t('settings.referals.empty.subtitle')}
							</Text>
						</View>
					) : (
						referrals.map((referral: Referral) => (
							<View key={referral.uuid} style={[styles.referralRow, { backgroundColor: theme.colors.surface }]}>
								<ProfileContainerHorizontal user={referral} size={40} isOnline={isUserOnline(referral.uuid)} />
								{referral.kyc ? (
									<View style={[styles.badge, { backgroundColor: theme.colors.successFill + '20' }]}>
										<FontAwesome6 name="circle-check" size={10} color={theme.colors.successText} iconStyle="solid" />
										<Text style={[styles.badgeText, { color: theme.colors.successText, fontSize: theme.typography.fontSize.xs, fontFamily: theme.typography.fontFamily.medium }]}>KYC</Text>
									</View>
								) : (
									<View style={[styles.badge, { backgroundColor: theme.colors.warning + '20' }]}>
										<FontAwesome6 name="clock" size={10} color={theme.colors.warning} iconStyle="solid" />
										<Text style={[styles.badgeText, { color: theme.colors.warning, fontSize: theme.typography.fontSize.xs, fontFamily: theme.typography.fontFamily.medium }]}>{t('common.status.pending')}</Text>
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
type SocialButtonProps = {
	icon: FontAwesome6SolidIconName | FontAwesome6BrandIconName
	label: string
	/** Hex de la marca; el círculo lo usa al 18% de alfa. */
	color: string
	iconStyle?: 'solid' | 'brand' | 'regular'
	onPress: () => void
	theme: Theme
}

const SocialButton = ({ icon, label, color, iconStyle, onPress, theme }: SocialButtonProps) => (
	<Pressable onPress={onPress} style={styles.socialButton}>
		<View style={[styles.socialCircle, { backgroundColor: color + '18' }]}>
			{/* name/iconStyle son dinámicos (hay marcas): los casts fijan la rama 'solid'
			    de la unión discriminada de FontAwesome6. */}
			<FontAwesome6 name={icon as FontAwesome6SolidIconName} size={18} color={color} iconStyle={iconStyle as 'solid'} />
		</View>
		<Text style={[styles.socialLabel, { color: theme.colors.secondaryText, fontSize: theme.typography.fontSize.xs, fontFamily: theme.typography.fontFamily.regular }]}>{label}</Text>
	</Pressable>
)

// Step component for "how it works"
type StepProps = { number: number | string, text: string, theme: Theme }

const Step = ({ number, text, theme }: StepProps) => (
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
