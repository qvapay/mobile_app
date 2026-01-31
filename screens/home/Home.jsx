import { useState, useEffect } from 'react'
import { View, StyleSheet, ScrollView, Pressable, RefreshControl } from 'react-native'
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
		} catch (error) { console.error('Error loading user data:', error) }
		finally { setIsLoading(false) }
	}

	const fetchLatestTransactions = async (skipLoading = false) => {
		try {
			if (!skipLoading) setIsLoading(true)
			const result = await transferApi.getLatestTransactions({ take: 6 })
			if (result.success) {
				setLatestTransactions(result.data)
			} else { console.error('Error fetching latest transactions:', result.error) }
		} catch (error) { console.error('Error fetching latest transactions:', error) }
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
			} else { console.error('Error fetching latest sent transfers:', result.error) }
		} catch (error) { console.error('Error fetching latest sent transfers:', error) }
		finally { if (!skipLoading) setIsLoading(false) }
	}

	const fetchLatestBlogPosts = async (skipLoading = false) => {
		try {
			if (!skipLoading) setIsLoading(true)
			const result = await blogApi.getLatestPosts(3)
			if (result.success) { setLatestBlogPosts(result.data) }
			else { console.error('Error fetching latest blog posts:', result.error) }
		} catch (error) { console.error('Error fetching latest blog posts:', error) }
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
		} catch (error) { console.error('Error refreshing data:', error) }
		finally { setRefreshing(false) }
	}

	return (
		<View style={[containerStyles.subContainer]}>

			<ScrollView style={styles.scrollView} contentContainerStyle={{ paddingBottom: insets.bottom + 20 }} showsVerticalScrollIndicator={false} refreshControl={<RefreshControl key={`refresh-${theme.isDark ? 'dark' : 'light'}`} refreshing={refreshing} onRefresh={onRefresh} colors={[theme.colors.primary]} tintColor={theme.colors.primary} />}>

				<BalanceCard balance={user.balance} />

				<ActionButtons navigation={navigation} />

				<View style={{ marginVertical: 10, gap: 5 }}>
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

				<View style={{ marginVertical: 10, gap: 5 }}>
					<QPSectionHeader title="Últimas transacciones" subtitle="Ver todas" iconName="arrow-right" onPress={() => navigation.navigate(ROUTES.TRANSACTIONS)} />
					<View>
						{latestTransactions.map((transaction, index) => (
							<QPTransaction key={transaction.uuid} transaction={transaction} navigation={navigation} index={index} totalItems={latestTransactions.length} />
						))}
					</View>
				</View>

				<View style={{ marginVertical: 10 }}>
					<QPSectionHeader title="Últimas noticias" subtitle="Ver todas" iconName="arrow-right" onPress={() => navigation.navigate(ROUTES.BLOG)} />
					<View>
						{latestBlogPosts.map((post, index) => (
							<BlogPostCard key={post.id} post={post} index={index} totalItems={latestBlogPosts.length} />
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
	}
})

export default Home