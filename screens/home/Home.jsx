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

// UI Particles
import QPTransaction from '../../ui/particles/QPTransaction'
import BalanceCard from '../../ui/BalanceCard'
import ActionButtons from '../../ui/ActionButtons'
import QPAvatar from '../../ui/particles/QPAvatar'
import BlogPostCard from '../../ui/BlogPostCard'
import QPSectionHeader from '../../ui/particles/QPSectionHeader'

// Icons
import FontAwesome6 from '@react-native-vector-icons/fontawesome6'

// Routes
import { ROUTES } from '../../routes'

// Pull-to-refresh
import QPRefreshIndicator, { createHiddenRefreshControl } from '../../ui/QPRefreshIndicator'

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
		<Text style={[styles.serviceCardTitle, { color: theme.colors.primaryText }]}>{title}</Text>
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

	// State
	const [isLoading, setIsLoading] = useState(false)
	const [refreshing, setRefreshing] = useState(false)
	const [error, setError] = useState(null)
	const [latestTransactions, setLatestTransactions] = useState([])
	const [latestSentTransfersUsers, setLatestSentTransfersUsers] = useState([])
	const [latestBlogPosts, setLatestBlogPosts] = useState([])

	// Load user data
	useEffect(() => {
		loadUserData()
		fetchLatestTransactions()
		fetchLatestSentTransfersUsers()
		fetchLatestBlogPosts()
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
		} catch (error) { /* error refreshing data */ }
		finally { setRefreshing(false) }
	}

	return (
		<View style={[containerStyles.subContainer]}>
			<QPRefreshIndicator refreshing={refreshing} />

			<ScrollView style={styles.scrollView} contentContainerStyle={{ paddingBottom: insets.bottom + 20 }} showsVerticalScrollIndicator={false} refreshControl={createHiddenRefreshControl(refreshing, onRefresh)}>

				<BalanceCard balance={user.balance} />

				<ActionButtons navigation={navigation} />

				<View style={styles.section}>
					<QPSectionHeader title="Pago rápido" subtitle="Ver todas" iconName="arrow-right" onPress={() => navigation.navigate(ROUTES.PAYMENT_METHODS)} />
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
					<QPSectionHeader title="Últimas transacciones" subtitle="Ver todas" iconName="arrow-right" onPress={() => navigation.navigate(ROUTES.TRANSACTIONS)} />
					<View>
						{latestTransactions.map((transaction, index) => (
							<QPTransaction key={transaction.uuid} transaction={transaction} navigation={navigation} index={index} totalItems={latestTransactions.length} />
						))}
					</View>
				</View>

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
	serviceCardTitle: {
		fontFamily: 'Rubik-Medium',
		fontSize: 14,
	},
	blogGrid: {
		flexDirection: 'row',
		flexWrap: 'wrap',
		gap: 12,
	},
})

export default Home