import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { View, StyleSheet, ScrollView } from 'react-native'

// Auth Context
import { useAuth } from '../../auth/AuthContext'

// Theme Context
import { useTheme } from '../../theme/ThemeContext'
import { useContainerStyles } from '../../theme/themeUtils'

// UI Particles
import BalanceCard from '../../ui/BalanceCard'
import ActionButtons from '../../ui/ActionButtons'
import QPSectionHeader from '../../ui/particles/QPSectionHeader'
import CashDeliveryCard from '../../ui/CashDeliveryCard'

// Routes
import { ROUTES } from '../../routes'

// Pull-to-refresh
import { createHiddenRefreshControl } from '../../ui/QPRefreshIndicator'

// Update prompt
import UpdatePromptModal from '../../ui/UpdatePromptModal'
import { maybePromptUpdate } from '../../helpers/versionCheck'
import { useHomeProfile } from './hooks/useHomeProfile'
import HomePromoSection from './_components/HomePromoSection'
import HomePushBannerSection from './_components/HomePushBannerSection'
import HomeQuickPaySection from './_components/HomeQuickPaySection'
import HomeTransactionsSection from './_components/HomeTransactionsSection'
import HomeWatchlistSection from './_components/HomeWatchlistSection'
import HomeBlogSection from './_components/HomeBlogSection'
import HomeServiceCard from './_components/HomeServiceCard'

// Home Screen
const Home = ({ navigation }) => {

	// User Context
	const { user, updateUser } = useAuth()
	const queryClient = useQueryClient()

	// Context
	const { theme } = useTheme()
	const containerStyles = useContainerStyles(theme)
	const insets = useSafeAreaInsets()

	// State
	const [refreshing, setRefreshing] = useState(false)
	const [updateInfo, setUpdateInfo] = useState(null)

	useHomeProfile(updateUser)

	// Refresh handler for pull-to-refresh
	const onRefresh = async () => {
		setRefreshing(true)
		try {
			await queryClient.refetchQueries({ queryKey: ['home'] })
			// Check for store update
			const info = await maybePromptUpdate()
			if (info?.needsUpdate) setUpdateInfo(info)
		} catch (err) { /* error refreshing data */ }
		finally { setRefreshing(false) }
	}

	return (
		<View style={[containerStyles.subContainer]}>
			<ScrollView style={styles.scrollView} contentContainerStyle={{ paddingBottom: insets.bottom + 20 }} showsVerticalScrollIndicator={false} refreshControl={createHiddenRefreshControl(refreshing, onRefresh)}>

				<HomePromoSection />

				<BalanceCard balance={user.balance} navigation={navigation} />

				<ActionButtons navigation={navigation} />

				<HomePushBannerSection />

				<HomeQuickPaySection />

				<HomeTransactionsSection />

				{/* Cash Delivery Card - only show when balance >= 200 */}
				{Number(user.balance) >= 200 && (<CashDeliveryCard navigation={navigation} />)}

				{/* Service Cards */}
				<View style={styles.section}>
					<QPSectionHeader title="Servicios" subtitle="Ver todas" iconName="arrow-right" onPress={() => navigation.navigate(ROUTES.STORE_SCREEN)} />
					<View style={styles.serviceCardsContainer}>
						<HomeServiceCard
							icon="mobile-screen"
							title="Recargas"
							iconColor="#10B981"
							onPress={() => navigation.navigate(ROUTES.PHONE_TOPUP_INDEX)}
							theme={theme}
						/>
						<HomeServiceCard
							icon="gift"
							title="Gift Cards"
							iconColor="#8B5CF6"
							onPress={() => navigation.navigate(ROUTES.STORE_SCREEN)}
							theme={theme}
						/>
						<HomeServiceCard
							icon="chart-line"
							title="Invest"
							iconColor="#F59E0B"
							onPress={() => navigation.navigate(ROUTES.INVEST_SCREEN)}
							theme={theme}
						/>
						<HomeServiceCard
							icon="building-columns"
							title="P2P"
							iconColor={theme.colors.primary}
							onPress={() => navigation.navigate(ROUTES.P2P_SCREEN)}
							theme={theme}
						/>
					</View>
				</View>

				<HomeWatchlistSection />

				<HomeBlogSection />

			</ScrollView>

			<UpdatePromptModal
				visible={!!updateInfo?.needsUpdate}
				currentVersion={updateInfo?.currentVersion}
				latestVersion={updateInfo?.latestVersion}
				storeUrl={updateInfo?.storeUrl}
				onDismiss={() => setUpdateInfo(null)}
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
	serviceCardsContainer: {
		flexDirection: 'row',
		flexWrap: 'wrap',
		gap: 10,
	},
})

export default Home
