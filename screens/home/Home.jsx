import { useEffect } from 'react'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { View, Text, StyleSheet, ScrollView, Pressable, Linking, Platform } from 'react-native'

// Auth Context
import { useAuth } from '../../auth/AuthContext'

// Theme Context
import { useTheme } from '../../theme/ThemeContext'
import { useContainerStyles, useTextStyles } from '../../theme/themeUtils'

// Home feed data (profile, transactions, quick-pay, blog, watchlist, promo)
import useHomeFeed from './useHomeFeed'

// UI Particles
import QPTransaction from '../../ui/particles/QPTransaction'
import BalanceCard from '../../ui/BalanceCard'
import ActionButtons from '../../ui/ActionButtons'
import QPAvatar from '../../ui/particles/QPAvatar'
import BlogPostCard from '../../ui/BlogPostCard'
import QPSectionHeader from '../../ui/particles/QPSectionHeader'
import WatchlistCard from '../../ui/WatchlistCard'
import PromoBanner from '../../ui/PromoBanner'
import CashDeliveryCard from '../../ui/CashDeliveryCard'
import TransactionSkeleton from '../../ui/TransactionSkeleton'
import EmptyTransactions from '../../ui/EmptyTransactions'

// Icons
import FontAwesome6 from '@react-native-vector-icons/fontawesome6'

// Routes
import { ROUTES } from '../../routes'

// Online Status
import { useOnlineStatus } from '../../hooks/OnlineStatusContext'

// Pull-to-refresh
import { createHiddenRefreshControl } from '../../ui/QPRefreshIndicator'

// Push prompt
import usePushPrompt from '../../hooks/usePushPrompt'

// Update prompt
import UpdatePromptModal from '../../ui/UpdatePromptModal'

// Service Card Component
const ServiceCard = ({ icon, title, iconColor, onPress, theme }) => (
	<Pressable
		onPress={onPress}
		style={({ pressed }) => [
			styles.serviceCard,
			{
				backgroundColor: theme.colors.surface,
				transform: [{ scale: pressed ? 0.97 : 1 }]
			},
			theme.mode === 'light' && {
				borderWidth: 1,
				borderColor: theme.colors.border,
			}
		]}
	>
		<View style={[styles.serviceCardIcon, { backgroundColor: iconColor + '20' }]}>
			<FontAwesome6 name={icon} size={22} color={iconColor} iconStyle="solid" />
		</View>
		<Text style={[styles.serviceCardTitle, { color: theme.colors.primaryText, fontSize: theme.typography.fontSize.sm, fontFamily: theme.typography.fontFamily.medium }]}>{title}</Text>
	</Pressable>
)

// Invitación a activar las push — se auto-oculta según usePushPrompt
const PushPromptBanner = ({ theme }) => {
	const { shouldShowBanner, enablePush, dismissBanner } = usePushPrompt()
	if (!shouldShowBanner) return null
	return (
		<View style={[styles.pushBanner, { backgroundColor: theme.colors.surface }, theme.mode === 'light' && { borderWidth: 1, borderColor: theme.colors.border }]}>
			<View style={[styles.pushBannerIcon, { backgroundColor: theme.colors.primary + '20' }]}>
				<FontAwesome6 name="bell" size={16} color={theme.colors.primary} iconStyle="solid" />
			</View>
			<View style={{ flex: 1 }}>
				<Text style={[styles.pushBannerText, { color: theme.colors.primaryText, fontSize: theme.typography.fontSize.sm, fontFamily: theme.typography.fontFamily.regular }]}>Recibe alertas de tus pagos al instante</Text>
			</View>
			<Pressable
				onPress={() => { enablePush(); dismissBanner() }}
				style={[styles.pushBannerButton, { backgroundColor: theme.colors.primary }]}
			>
				<Text style={[styles.pushBannerButtonText, { color: theme.colors.almostWhite, fontSize: theme.typography.fontSize.sm, fontFamily: theme.typography.fontFamily.medium }]}>Activar</Text>
			</Pressable>
			<Pressable onPress={dismissBanner} hitSlop={8}>
				<FontAwesome6 name="xmark" size={14} color={theme.colors.tertiaryText} iconStyle="solid" />
			</Pressable>
		</View>
	)
}

/**
 * Home Screen — main dashboard with balance, quick actions and a personalized feed.
 * All data fetching lives in `useHomeFeed` (fans out independent fetches on mount,
 * pull-to-refresh re-runs everything plus the store-update check, which can surface
 * `UpdatePromptModal`). Quick-pay users are tracked for live online status
 * (OnlineStatusContext).
 */
const Home = ({ navigation }) => {

	// User Context
	const { user } = useAuth()

	// Context
	const { theme } = useTheme()
	const containerStyles = useContainerStyles(theme)
	const textStyles = useTextStyles(theme)
	const insets = useSafeAreaInsets()

	// Online status
	const { trackUsers, untrackUsers, isUserOnline } = useOnlineStatus()

	// Feed data + refresh
	const {
		latestTransactions,
		latestSentTransfersUsers,
		latestBlogPosts,
		watchlistData,
		promo,
		updateInfo,
		txLoading,
		refreshing,
		onRefresh,
		dismissUpdate,
	} = useHomeFeed()

	// Track quick-pay users for online status
	useEffect(() => {
		const ids = latestSentTransfersUsers.map(u => u.uuid).filter(Boolean)
		if (ids.length) trackUsers(ids)
		return () => { if (ids.length) untrackUsers(ids) }
	}, [latestSentTransfersUsers, trackUsers, untrackUsers])

	return (
		<View style={[containerStyles.subContainer]}>
			<ScrollView style={styles.scrollView} contentContainerStyle={{ paddingBottom: insets.bottom + 20 }} showsVerticalScrollIndicator={false} refreshControl={createHiddenRefreshControl(refreshing, onRefresh)}>

				<PromoBanner promo={promo} />

				<BalanceCard balance={user.balance} navigation={navigation} refreshing={refreshing} />

				<ActionButtons navigation={navigation} />

				<PushPromptBanner theme={theme} />

				<View style={styles.section}>
					<QPSectionHeader title="Pago rápido" subtitle="Ver todas" iconName="arrow-right" onPress={() => navigation.navigate(ROUTES.SEND)} />
					<ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 0 }}>
						<View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
							<Pressable onPress={() => navigation.navigate(ROUTES.SEND)} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
								<View style={{ backgroundColor: theme.colors.elevation, height: 56, width: 56, borderRadius: 28, justifyContent: 'center', alignItems: 'center' }}>
									<FontAwesome6 name="plus" size={24} color={theme.colors.primary} iconStyle="solid" />
								</View>
								{latestSentTransfersUsers.length === 0 && (
									<Text style={{ color: theme.colors.secondaryText, fontSize: theme.typography.fontSize.sm, fontFamily: theme.typography.fontFamily.regular }}>Envía tu primer pago</Text>
								)}
							</Pressable>
							{latestSentTransfersUsers.map((transferUser, index) => (
								<Pressable key={index} onPress={() => navigation.navigate(ROUTES.SEND, { user_uuid: transferUser.uuid, send_amount: '0.00' })}>
									<QPAvatar key={index} user={transferUser} size={56} isOnline={isUserOnline(transferUser.uuid)} />
								</Pressable>
							))}
						</View>
					</ScrollView>
				</View>

				<View style={styles.section}>
					<View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
						<Text style={[textStyles.h5, { color: theme.colors.tertiaryText }]}>Últimas transacciones</Text>
						{latestTransactions.length > 0 && (
							<Pressable onPress={() => navigation.navigate(ROUTES.TRANSACTIONS, { showSearch: true })} hitSlop={8}>
								<FontAwesome6 name="magnifying-glass" size={16} color={theme.colors.tertiaryText} iconStyle="solid" />
							</Pressable>
						)}
					</View>
					{latestTransactions.length > 0 ? (
						<>
							<View>
								{latestTransactions.map((transaction, index) => (
									<QPTransaction key={transaction.uuid} transaction={transaction} navigation={navigation} index={index} totalItems={latestTransactions.length} />
								))}
							</View>
							<Pressable onPress={() => navigation.navigate(ROUTES.TRANSACTIONS)} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }} >
								<Text style={{ color: theme.colors.primary, fontSize: theme.typography.fontSize.sm, fontFamily: theme.typography.fontFamily.medium }}>Ver todas</Text>
								<FontAwesome6 name="chevron-right" size={12} color={theme.colors.primary} iconStyle="solid" />
							</Pressable>
						</>
					) : txLoading ? (
						<View>
							{[0, 1, 2].map(i => (
								<TransactionSkeleton key={i} index={i} totalItems={3} />
							))}
						</View>
					) : (
						<EmptyTransactions navigation={navigation} />
					)}
				</View>

				{/* Cash Delivery Card - only show when balance >= 200 */}
				{Number(user.balance) >= 200 && (<CashDeliveryCard navigation={navigation} />)}

				{/* Service Cards */}
				<View style={styles.section}>
					<QPSectionHeader title="Servicios" subtitle="Ver todas" iconName="arrow-right" onPress={() => navigation.navigate(ROUTES.STORE_SCREEN)} />
					<View style={styles.serviceCardsContainer}>
						<ServiceCard
							icon="mobile-screen"
							title="Recargas"
							iconColor="#10B981"
							onPress={() => navigation.navigate(ROUTES.PHONE_TOPUP_INDEX)}
							theme={theme}
						/>
						{Platform.OS !== 'ios' && (
							<ServiceCard
								icon="gift"
								title="Gift Cards"
								iconColor="#8B5CF6"
								onPress={() => navigation.navigate(ROUTES.STORE_SCREEN)}
								theme={theme}
							/>
						)}
						<ServiceCard
							icon="chart-line"
							title="Invest"
							iconColor="#F59E0B"
							onPress={() => navigation.navigate(ROUTES.INVEST_SCREEN)}
							theme={theme}
						/>
						<ServiceCard
							icon="building-columns"
							title="P2P"
							iconColor={theme.colors.primary}
							onPress={() => navigation.navigate(ROUTES.P2P_SCREEN)}
							theme={theme}
						/>
					</View>
				</View>

				{watchlistData.length > 0 && (
					<View style={styles.section}>
						<QPSectionHeader title="Mi Watchlist" subtitle="Ver todo" iconName="arrow-right" onPress={() => navigation.navigate(ROUTES.INVEST_SCREEN)} />
						<View style={styles.watchlistGrid}>
							{watchlistData.map(coin => (
								<WatchlistCard key={coin.tick} coin={coin} onPress={() => { }} />
							))}
						</View>
					</View>
				)}

				<View style={styles.section}>
					<QPSectionHeader title="Últimas noticias" subtitle="Ver todas" iconName="arrow-right" onPress={() => Linking.openURL('https://qvapay.blog')} />
					<View style={Platform.isPad ? styles.blogGrid : undefined}>
						{latestBlogPosts.map((post, index) => (
							<BlogPostCard key={post.id} post={post} index={index} totalItems={latestBlogPosts.length} iPad={Platform.isPad} />
						))}
					</View>
				</View>

			</ScrollView>

			<UpdatePromptModal
				visible={!!updateInfo?.needsUpdate}
				currentVersion={updateInfo?.currentVersion}
				latestVersion={updateInfo?.latestVersion}
				storeUrl={updateInfo?.storeUrl}
				onDismiss={dismissUpdate}
			/>
		</View>
	)
}

const styles = StyleSheet.create({
	scrollView: {
		flex: 1,
	},
	section: {
		marginVertical: 10,
		gap: 8,
	},
	// Service Cards
	watchlistGrid: {
		flexDirection: 'row',
		flexWrap: 'wrap',
		gap: 10,
	},
	serviceCardsContainer: {
		flexDirection: 'row',
		flexWrap: 'wrap',
		gap: 10,
	},
	serviceCard: {
		flexBasis: Platform.isPad ? '22%' : '46%',
		flexGrow: 1,
		borderRadius: 12,
		padding: 14,
		alignItems: 'center',
		gap: 10,
	},
	serviceCardIcon: {
		width: 48,
		height: 48,
		borderRadius: 24,
		justifyContent: 'center',
		alignItems: 'center',
	},
	serviceCardTitle: {},
	blogGrid: {
		flexDirection: 'row',
		flexWrap: 'wrap',
		gap: 12,
	},
	// Push banner
	pushBanner: {
		flexDirection: 'row',
		alignItems: 'center',
		borderRadius: 12,
		padding: 12,
		marginVertical: 10,
		gap: 10,
	},
	pushBannerIcon: {
		width: 36,
		height: 36,
		borderRadius: 18,
		justifyContent: 'center',
		alignItems: 'center',
	},
	pushBannerText: {},
	pushBannerButton: {
		borderRadius: 8,
		paddingHorizontal: 12,
		paddingVertical: 6,
	},
	pushBannerButtonText: {},
})

export default Home
