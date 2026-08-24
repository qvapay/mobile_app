import { View, Text, ScrollView, Pressable, StyleSheet } from 'react-native'
import { useTranslation } from 'react-i18next'

import StoreTile from '../../ui/store/StoreTile'
import { ROUTES } from '../../routes'

const SectionHeader = ({ title, hint, actionLabel, onAction, theme, textStyles }) => (
	<View style={styles.sectionHeader}>
		<View style={{ flex: 1 }}>
			<Text style={[textStyles.h5, { color: theme.colors.primaryText, fontWeight: '600' }]}>{title}</Text>
			{hint && <Text style={[textStyles.caption, { color: theme.colors.tertiaryText, marginTop: 2 }]}>{hint}</Text>}
		</View>
		{actionLabel && onAction && (
			<Pressable onPress={onAction} hitSlop={8}>
				<Text style={[textStyles.caption, { color: theme.colors.primary, fontWeight: '600' }]}>
					{actionLabel} ›
				</Text>
			</Pressable>
		)}
	</View>
)

/**
 * Marketplace block of the Store screen: horizontal shelf of approved-store
 * tiles (featured first — the API already orders by featured/sales) with a
 * "Ver todas" action into the MarketStores index. Presentational only: data
 * and theme arrive via props from Store.jsx. Hidden while the slice is empty
 * (rollout: few stores approved yet).
 */
const StoreMarketSection = ({ marketStores, theme, textStyles, navigation }) => {

	const { t } = useTranslation()

	if (!marketStores?.length) return null

	return (
		<View style={styles.section}>
			<SectionHeader
				title={t('store.landing.departments.stores.title')}
				hint={t('store.landing.departments.stores.subtitle')}
				actionLabel={t('common.actions.seeAll')}
				onAction={() => navigation.navigate(ROUTES.MARKET_STORES)}
				theme={theme}
				textStyles={textStyles}
			/>
			<ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingRight: 10 }}>
				{marketStores.map(s => (
					<View key={s.slug} style={{ width: 168 }}>
						<StoreTile
							store={s}
							onPress={() => navigation.navigate(ROUTES.MARKET_STORE, { slug: s.slug })}
						/>
					</View>
				))}
			</ScrollView>
		</View>
	)
}

const styles = StyleSheet.create({
	section: { marginBottom: 24 },
	sectionHeader: {
		flexDirection: 'row',
		alignItems: 'center',
		marginBottom: 10,
	},
})

export default StoreMarketSection
