import { useState, useEffect } from 'react'
import { View, Text, StyleSheet, ScrollView, Pressable, Linking, Platform } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

// Auth Context
import { useAuth } from '../../auth/AuthContext'

// Theme Context
import { useTheme } from '../../theme/ThemeContext'
import { useContainerStyles, useTextStyles } from '../../theme/themeUtils'

// APIs
import { transferApi } from '../../api/transferApi'
import { userApi } from '../../api/userApi'
import { blogApi } from '../../api/blogApi'
import { coinsApi } from '../../api/coinsApi'
import { promoApi } from '../../api/promoApi'

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

// Icons
import FontAwesome6 from '@react-native-vector-icons/fontawesome6'

// Routes
import { ROUTES } from '../../routes'

// Pull-to-refresh
import { createHiddenRefreshControl } from '../../ui/QPRefreshIndicator'

// Push prompt
import usePushPrompt from '../../hooks/usePushPrompt'

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

// Home Screen
const Home = ({ navigation }) => {

	// User Context
	const { user, updateUser } = useAuth()

	// Context
	const { theme } = useTheme()
	const containerStyles = useContainerStyles(theme)
	const textStyles = useTextStyles(theme)
	const insets = useSafeAreaInsets()

	// Push prompt
	const { shouldShowBanner, enablePush, dismissBanner } = usePushPrompt()

	// State
	const [isLoading, setIsLoading] = useState(false)
	const [refreshing, setRefreshing] = useState(false)
	const [error, setError] = useState(null)
	const [latestTransactions, setLatestTransactions] = useState([])
	const [latestSentTransfersUsers, setLatestSentTransfersUsers] = useState([])
	const [latestBlogPosts, setLatestBlogPosts] = useState([])
	const [watchlistData, setWatchlistData] = useState([])
	const [promo, setPromo] = useState(null)

	// Load user data
	useEffect(() => {
		loadUserData()
		fetchLatestTransactions()
		fetchLatestSentTransfersUsers()
		fetchLatestBlogPosts()
		fetchWatchlist()
		fetchPromo()
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [])

	// Load user data from API
	const loadUserData = async () => {
		try {
			setIsLoading(true)
			const result = await userApi.getUserProfile()
			if (result.success && result.data) { updateUser(result.data) }
		} catch (error) { /* error loading user data */ }
		finally { setIsLoading(false) }
	}

	const fetchLatestTransactions = async (skipLoading = false) => {
		try {
			if (!skipLoading) setIsLoading(true)
			const result = await transferApi.getLatestTransactions({ take: 6 })
			if (result.success) {
				setLatestTransactions(result.data)
			}
		} catch (error) { /* error fetching transactions */ }
		finally { if (!skipLoading) setIsLoading(false) }
	}

	const fetchLatestSentTransfersUsers = async (skipLoading = false) => {
		try {
			if (!skipLoading) setIsLoading(true)
			const result = await transferApi.getLatestSentTransfers(10)
			if (result.success) {
				// filter out users with no image
				const users = result.data.filter(user => user.image)
				setLatestSentTransfersUsers(users)
			}
		} catch (error) { /* error fetching sent transfers */ }
		finally { if (!skipLoading) setIsLoading(false) }
	}

	const fetchLatestBlogPosts = async (skipLoading = false) => {
		try {
			if (!skipLoading) setIsLoading(true)
			const result = await blogApi.getLatestPosts(Platform.isPad ? 4 : 3)
			if (result.success) { setLatestBlogPosts(result.data) }
		} catch (error) { /* error fetching blog posts */ }
		finally { if (!skipLoading) setIsLoading(false) }
	}

	const WATCHLIST_COINS = ['BTC', 'ETH', 'LTC', 'SOL']

	const fetchWatchlist = async () => {
		try {
			const results = await Promise.all(
				WATCHLIST_COINS.map(tick => coinsApi.priceHistory(tick, '24H'))
			)
			const data = results.map((result, i) => {
				const tick = WATCHLIST_COINS[i]
				if (!result.success || !result.data?.length) {
					return { tick, price: 0, change: 0, priceHistory: [] }
				}
				const history = result.data
				const first = history[0].value
				const last = history[history.length - 1].value
				const change = first > 0 ? ((last - first) / first) * 100 : 0
				return { tick, price: last, change, priceHistory: history }
			})
			setWatchlistData(data)
		} catch { /* error fetching watchlist */ }
	}

	const fetchPromo = async () => {
		try {
			const result = await promoApi.getPromo()
			if (result.success && result.data) { setPromo(result.data) }
		} catch { /* no promo available */ }
	}

	// Refresh handler for pull-to-refresh
	const onRefresh = async () => {
		setRefreshing(true)
		try {
			// Refresh user data
			await loadUserData()
			// Refresh latest transactions
			await fetchLatestTransactions(true)
			// Refresh latest sent transfers users
			await fetchLatestSentTransfersUsers(true)
			// Refresh latest blog posts
			await fetchLatestBlogPosts(true)
			// Refresh watchlist
			await fetchWatchlist()
			// Refresh promo
			await fetchPromo()
		} catch (error) { /* error refreshing data */ }
		finally { setRefreshing(false) }
	}

	return (
		<View style={[containerStyles.subContainer]}>
			<ScrollView style={styles.scrollView} contentContainerStyle={{ paddingBottom: insets.bottom + 20 }} showsVerticalScrollIndicator={false} refreshControl={createHiddenRefreshControl(refreshing, onRefresh)}>

				<PromoBanner promo={promo} />

				<BalanceCard balance={user.balance} />

				<ActionButtons navigation={navigation} />

				{shouldShowBanner && (
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
				)}

				<View style={styles.section}>
					<QPSectionHeader title="Pago rápido" subtitle="Ver todas" iconName="arrow-right" onPress={() => navigation.navigate(ROUTES.SEND)} />
					<ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 0 }}>
						<View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
							<Pressable onPress={() => navigation.navigate(ROUTES.SEND)}>
								<View style={{ backgroundColor: theme.colors.elevation, height: 56, width: 56, borderRadius: 28, justifyContent: 'center', alignItems: 'center' }}>
									<FontAwesome6 name="plus" size={24} color={theme.colors.primary} iconStyle="solid" />
								</View>
							</Pressable>
							{latestSentTransfersUsers.map((user, index) => (
								<Pressable key={index} onPress={() => navigation.navigate(ROUTES.SEND, { user_uuid: user.uuid, send_amount: '0.00' })}>
									<QPAvatar key={index} user={user} size={56} />
								</Pressable>
							))}
						</View>
					</ScrollView>
				</View>

				<View style={styles.section}>
					<View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
						<Text style={[textStyles.h5, { color: theme.colors.tertiaryText }]}>Últimas transacciones</Text>
						<Pressable onPress={() => navigation.navigate(ROUTES.TRANSACTIONS, { showSearch: true })} hitSlop={8}>
							<FontAwesome6 name="magnifying-glass" size={16} color={theme.colors.tertiaryText} iconStyle="solid" />
						</Pressable>
					</View>
					<View>
						{latestTransactions.map((transaction, index) => (
							<QPTransaction key={transaction.uuid} transaction={transaction} navigation={navigation} index={index} totalItems={latestTransactions.length} />
						))}
					</View>
					<Pressable onPress={() => navigation.navigate(ROUTES.TRANSACTIONS)} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }} >
						<Text style={{ color: theme.colors.primary, fontSize: theme.typography.fontSize.sm, fontFamily: theme.typography.fontFamily.medium }}>Ver todas</Text>
						<FontAwesome6 name="chevron-right" size={12} color={theme.colors.primary} iconStyle="solid" />
					</Pressable>
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
						<ServiceCard
							icon="gift"
							title="Gift Cards"
							iconColor="#8B5CF6"
							onPress={() => navigation.navigate(ROUTES.STORE_SCREEN)}
							theme={theme}
						/>
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
