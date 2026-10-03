import { View, Text, ScrollView, Pressable, StyleSheet, useWindowDimensions } from 'react-native'
import { useTranslation } from 'react-i18next'

import StoreTile from '../../ui/store/StoreTile'
import { ROUTES } from '../../routes'

import type { Theme } from '../../theme/ThemeContext'
import type { TextStyles } from '../../theme/themeUtils'
import type { MarketShop } from './market/marketQueries'
import type { StoreNavigation } from './Store'

type SectionHeaderProps = {
	title: string
	hint?: string
	actionLabel?: string
	onAction?: () => void
	theme: Theme
	textStyles: TextStyles
}

const SectionHeader = ({ title, hint, actionLabel, onAction, theme, textStyles }: SectionHeaderProps) => (
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
 * tiles (featured first — the API already orders by featured/sales) laid out
 * in rows that scroll together (two by default, three on tall phones), filled
 * column by column so the top-left tile stays the most featured one. Rows drop
 * while there aren't enough stores for at least two columns, so a short slice
 * never leaves a half-empty grid. Comes with a
 * "Ver todas" action into the MarketStores index. Presentational only: data
 * and theme arrive via props from Store.jsx. Hidden while the slice is empty
 * (rollout: few stores approved yet).
 */
type Props = {
	marketStores: MarketShop[]
	theme: Theme
	textStyles: TextStyles
	navigation: StoreNavigation
}

const TILE_WIDTH = 168
const TILE_GAP = 10
/** Pro Max / Ultra class phones (iPhone Pro Max ≈ 932–956 dp, big Androids ≈ 915). */
const TALL_SCREEN_MIN_HEIGHT = 900

/** Rows that still leave at least two full columns for `count` stores. */
const rowsFor = (count: number, preferred: number): number => {
	let rows = preferred
	while (rows > 1 && count < rows * 2) rows--
	return rows
}

/** Column-major chunks: [[0,1],[2,3],…] for two rows, [[0,1,2],…] for three. */
const toColumns = <T,>(items: T[], rows: number): T[][] => {
	const columns: T[][] = []
	for (let i = 0; i < items.length; i += rows) columns.push(items.slice(i, i + rows))
	return columns
}

const StoreMarketSection = ({ marketStores, theme, textStyles, navigation }: Props) => {

	const { t } = useTranslation()
	const { height } = useWindowDimensions()

	if (!marketStores?.length) return null

	const columns = toColumns(marketStores, rowsFor(marketStores.length, height >= TALL_SCREEN_MIN_HEIGHT ? 3 : 2))

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
			<ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.shelf}>
				{columns.map(column => (
					<View key={column[0].slug} style={styles.column}>
						{column.map(s => (
							<StoreTile
								key={s.slug}
								store={s}
								onPress={() => navigation.navigate(ROUTES.MARKET_STORE, { slug: s.slug as string })}
							/>
						))}
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
	shelf: { gap: TILE_GAP, paddingRight: TILE_GAP },
	column: { width: TILE_WIDTH, gap: TILE_GAP },
})

export default StoreMarketSection
