import { View, Text, ScrollView, Pressable, StyleSheet } from 'react-native'
import { useTranslation } from 'react-i18next'

import BrandTile from '../../ui/store/BrandTile'
import { ROUTES } from '../../routes'

import type { Theme } from '../../theme/ThemeContext'
import type { TextStyles } from '../../theme/themeUtils'
import type { StoreBrand, StoreCategory } from './storeQueries'
import type { StoreNavigation } from './Store'

// OJO: `theme.mode` no existe en el tema (siempre undefined) — bug de runtime
// pre-existente que se preserva tal cual; el alias es solo de tipos.
type ThemeWithMode = Theme & { mode?: string }

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

type Props = {
	favorites: StoreBrand[]
	featured: StoreBrand[]
	categories: StoreCategory[]
	numColumns: number
	theme: Theme
	textStyles: TextStyles
	navigation: StoreNavigation
}

// Gift-cards block of the Store screen: favourites, featured brands, categories, empty CTA.
const StoreGiftCardsSection = ({ favorites, featured, categories, numColumns, theme, textStyles, navigation }: Props) => {

	const { t } = useTranslation()

	const goToVoucherBrand = (b: StoreBrand) => {
		navigation.navigate(ROUTES.GIFT_CARD_BRAND, {
			country: { code: b.country, ...(b.country_meta || {}) },
			countryCode: b.country,
			brandSlug: b.slug || b.brand,
		})
	}

	return (
		<View style={styles.section}>
			<SectionHeader
				title={t('store.landing.departments.giftCards.title')}
				hint={t('store.landing.giftCards.hint')}
				actionLabel={t('common.actions.seeAll')}
				onAction={() => navigation.navigate(ROUTES.GIFT_CARDS)}
				theme={theme}
				textStyles={textStyles}
			/>

			{/* Favoritos del usuario */}
			{favorites.length > 0 && (
				<View style={{ marginBottom: 14 }}>
					<Text style={[textStyles.caption, { color: theme.colors.tertiaryText, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 }]}>
						{t('store.landing.giftCards.favorites')}
					</Text>
					<ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingRight: 10 }}>
						{favorites.map(b => (
							<View key={`fav-${b.country}-${b.brand}`} style={{ width: 150 }}>
								<BrandTile
									brand={b}
									country={{ code: b.country, ...(b.country_meta || {}) }}
									onPress={() => goToVoucherBrand(b)}
								/>
							</View>
						))}
					</ScrollView>
				</View>
			)}

			{/* Populares */}
			{featured.length > 0 && (
				<View style={{ marginBottom: 14 }}>
					<Text style={[textStyles.caption, { color: theme.colors.tertiaryText, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 }]}>
						{t('store.landing.giftCards.featured')}
					</Text>
					<ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingRight: 10 }}>
						{featured.map(b => (
							<View key={`feat-${b.country}-${b.brand}`} style={{ width: 150 }}>
								<BrandTile
									brand={b}
									country={{ code: b.country, ...(b.country_meta || {}) }}
									onPress={() => goToVoucherBrand(b)}
								/>
							</View>
						))}
					</ScrollView>
				</View>
			)}

			{/* Categorías */}
			{categories.length > 0 && (
				<View>
					<Text style={[textStyles.caption, { color: theme.colors.tertiaryText, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 }]}>
						{t('store.landing.giftCards.byCategory')}
					</Text>
					<View style={styles.catGrid}>
						{categories.map(c => (
							<Pressable
								key={c.key}
								onPress={() => navigation.navigate(ROUTES.GIFT_CARDS, { category: c.key })}
								style={[
									styles.catCard,
									{ backgroundColor: theme.colors.surface, width: numColumns === 2 ? '48%' : numColumns === 3 ? '31.5%' : '23%' },
									(theme as ThemeWithMode).mode === 'light' && { borderWidth: 0.5, borderColor: theme.colors.border },
								]}
							>
								<Text style={{ fontSize: 26 }}>{c.emoji}</Text>
								<View style={{ flex: 1, marginLeft: 10 }}>
									<Text style={[textStyles.h6, { color: theme.colors.primaryText, fontWeight: '600' }]} numberOfLines={1}>
										{c.label}
									</Text>
									<Text style={[textStyles.caption, { color: theme.colors.tertiaryText }]}>
										{t('store.common.brandCount', { count: c.count })}
									</Text>
								</View>
							</Pressable>
						))}
					</View>
				</View>
			)}

			{/* Empty state: aún sin featured/favorites/categorías → CTA único */}
			{favorites.length === 0 && featured.length === 0 && categories.length === 0 && (
				<Pressable
					onPress={() => navigation.navigate(ROUTES.GIFT_CARDS)}
					style={[styles.giftCardCta, { backgroundColor: theme.colors.surface }, (theme as ThemeWithMode).mode === 'light' && { borderWidth: 0.5, borderColor: theme.colors.border }]}
				>
					<Text style={{ fontSize: 36 }}>🎁</Text>
					<View style={{ flex: 1, marginLeft: 14 }}>
						<Text style={[textStyles.h5, { color: theme.colors.primaryText, fontWeight: '600' }]}>
							{t('store.landing.giftCards.exploreCta')}
						</Text>
						<Text style={[textStyles.caption, { color: theme.colors.tertiaryText, marginTop: 2 }]}>
							{t('store.landing.giftCards.exploreCtaHint')}
						</Text>
					</View>
					<Text style={[textStyles.h5, { color: theme.colors.primary, fontWeight: '600' }]}>›</Text>
				</Pressable>
			)}
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
	catGrid: {
		flexDirection: 'row',
		flexWrap: 'wrap',
		justifyContent: 'space-between',
		gap: 10,
	},
	catCard: {
		flexDirection: 'row',
		alignItems: 'center',
		padding: 12,
		borderRadius: 14,
	},
	giftCardCta: {
		flexDirection: 'row',
		alignItems: 'center',
		padding: 18,
		borderRadius: 16,
	},
})

export default StoreGiftCardsSection
