import { StyleSheet, View } from 'react-native'
import { useNavigation } from '@react-navigation/native'
import { ROUTES } from '../../../routes'
import QPSectionHeader from '../../../ui/particles/QPSectionHeader'
import WatchlistCard from '../../../ui/WatchlistCard'
import { useHomeWatchlist } from '../hooks/useHomeWatchlist'

const HomeWatchlistSection = () => {
	const navigation = useNavigation()
	const { data: watchlistData = [] } = useHomeWatchlist()

	if (watchlistData.length === 0) return null

	return (
		<View style={styles.section}>
			<QPSectionHeader title="Mi Watchlist" subtitle="Ver todo" iconName="arrow-right" onPress={() => navigation.navigate(ROUTES.INVEST_SCREEN)} />
			<View style={styles.watchlistGrid}>
				{watchlistData.map(coin => (
					<WatchlistCard key={coin.tick} coin={coin} onPress={() => { }} />
				))}
			</View>
		</View>
	)
}

const styles = StyleSheet.create({
	section: {
		marginVertical: 10,
		gap: 8,
	},
	watchlistGrid: {
		flexDirection: 'row',
		flexWrap: 'wrap',
		gap: 10,
	},
})

export default HomeWatchlistSection

