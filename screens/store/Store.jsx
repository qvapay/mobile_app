import { View, Text, StyleSheet, ScrollView, Platform, Pressable, useWindowDimensions } from 'react-native'
import useContentPadding from '../../hooks/useContentPadding'
import FontAwesome6 from '@react-native-vector-icons/fontawesome6'
import { useTranslation } from 'react-i18next'

import { useTheme } from '../../theme/ThemeContext'
import { createContainerStyles, createTextStyles } from '../../theme/themeUtils'

import QPLoader from '../../ui/particles/QPLoader'
import StoreTopupSection from './StoreTopupSection'
import StoreGiftCardsSection from './StoreGiftCardsSection'
import StoreMarketSection from './StoreMarketSection'
import { createHiddenRefreshControl } from '../../ui/QPRefreshIndicator'

// Data (React Query: catálogos en paralelo, persistidos por separado)
import { useStoreCatalog, SHOW_GIFT_CARDS } from './storeQueries'

import { ROUTES } from '../../routes'

/**
 * Store tab landing: department cards (compras asistidas, recargas and — on
 * Android only — gift cards) followed by the mobile top-up and gift-card
 * sections. Vouchers are hidden on iOS to comply with App Store Guideline 3.1.1.
 * Los catálogos viven en React Query (`useStoreCatalog`): Zendit vía
 * `GET /store/topup-catalog` y `GET /store/voucher-catalog` con mode params;
 * el país de recarga restaura la última selección y cae en Cuba (CU).
 */
const Store = ({ navigation }) => {

	const { t } = useTranslation()
	const { theme } = useTheme()
	const containerStyles = createContainerStyles(theme)
	const textStyles = createTextStyles(theme)
	const contentPadding = useContentPadding(30)
	const { width } = useWindowDimensions()
	const numColumns = width >= 1024 ? 4 : width >= 600 ? 3 : 2

	const {
		favorites, featured, categories, topupCountries, topupBrands, marketStores,
		topupSelected, setTopupSelected, loading, refreshing, onRefresh,
	} = useStoreCatalog()

	if (loading) {
		return (
			<View style={[containerStyles.subContainer, { justifyContent: 'center', alignItems: 'center' }]}>
				<QPLoader />
			</View>
		)
	}

	return (
		<View style={containerStyles.subContainer}>
			<ScrollView
				contentContainerStyle={contentPadding}
				showsVerticalScrollIndicator={false}
				refreshControl={createHiddenRefreshControl(refreshing, onRefresh)}
			>

				{/* Hero */}
				<View style={styles.heroRow}>
					<View style={{ flex: 1 }}>
						<Text style={[textStyles.h2, { color: theme.colors.primaryText, fontWeight: '600' }]}>{t('store.landing.title')}</Text>
						<Text style={[textStyles.caption, { color: theme.colors.tertiaryText, marginTop: 2 }]}>
							{SHOW_GIFT_CARDS ? t('store.landing.subtitleGiftCards') : t('store.landing.subtitleTopupsOnly')}
						</Text>
					</View>
				</View>

				{/* Departamentos — entradas a cada vertical, como en la web */}
				<View style={styles.departmentsBlock}>
					<DepartmentCard
						icon="shop"
						color="#F59E0B"
						title={t('store.landing.departments.stores.title')}
						subtitle={t('store.landing.departments.stores.subtitle')}
						theme={theme}
						textStyles={textStyles}
						onPress={() => navigation.navigate(ROUTES.MARKET_STORES)}
					/>
					<DepartmentCard
						icon="basket-shopping"
						color="#10B981"
						title={t('store.landing.departments.assisted.title')}
						subtitle={t('store.landing.departments.assisted.subtitle')}
						theme={theme}
						textStyles={textStyles}
						onPress={() => navigation.navigate(ROUTES.ASSISTED_SHOPPING)}
					/>
					{/* Recargas por Google Play Billing — consumibles, solo Android por ahora */}
					{Platform.OS === 'android' && (
						<DepartmentCard
							icon="google-play"
							iconStyle="brand"
							color="#34A853"
							title={t('store.landing.departments.googlePlay.title')}
							subtitle={t('store.landing.departments.googlePlay.subtitle')}
							theme={theme}
							textStyles={textStyles}
							onPress={() => navigation.navigate(ROUTES.TOPUP_SCREEN)}
						/>
					)}
					<View style={styles.departmentsRow}>
						<DepartmentCard
							icon="mobile-screen-button"
							color={theme.colors.primary}
							title={t('store.landing.departments.topups.title')}
							subtitle={t('store.landing.departments.topups.subtitle')}
							compact
							theme={theme}
							textStyles={textStyles}
							onPress={() => navigation.navigate(ROUTES.PHONE_TOPUP_INDEX)}
						/>
						{SHOW_GIFT_CARDS && (
							<DepartmentCard
								icon="gift"
								color="#8B5CF6"
								title={t('store.landing.departments.giftCards.title')}
								subtitle={t('store.landing.departments.giftCards.subtitle')}
								compact
								theme={theme}
								textStyles={textStyles}
								onPress={() => navigation.navigate(ROUTES.GIFT_CARDS)}
							/>
						)}
					</View>
				</View>

				{/* Tiendas del marketplace — oculta mientras no haya aprobadas */}
				<StoreMarketSection
					marketStores={marketStores}
					theme={theme}
					textStyles={textStyles}
					navigation={navigation}
				/>

				{/* Tarjetas de regalo — entry point siempre presente en Android */}
				{SHOW_GIFT_CARDS && (
					<StoreGiftCardsSection
						favorites={favorites}
						featured={featured}
						categories={categories}
						numColumns={numColumns}
						theme={theme}
						textStyles={textStyles}
						navigation={navigation}
					/>
				)}

				{/* Recargas móviles */}
				<StoreTopupSection
					topupCountries={topupCountries}
					topupSelected={topupSelected}
					topupBrands={topupBrands}
					onSelectCountry={setTopupSelected}
					numColumns={numColumns}
					theme={theme}
					textStyles={textStyles}
					navigation={navigation}
				/>
			</ScrollView>
		</View>
	)
}

/**
 * Entry card for a Store vertical (recargas, gift cards, compras asistidas) —
 * mobile version of the web shop hub's DepartmentCard. `compact` renders the
 * half-width variant used in the second row.
 */
const DepartmentCard = ({ icon, iconStyle = 'solid', color, title, subtitle, compact = false, theme, textStyles, onPress }) => (
	<Pressable
		style={[
			styles.departmentCard,
			compact && styles.departmentCardCompact,
			{ backgroundColor: theme.colors.surface },
			theme.mode === 'light' && { borderWidth: 1, borderColor: theme.colors.elevationLight },
		]}
		onPress={onPress}
	>
		<View style={[styles.departmentIcon, { backgroundColor: `${color}1A` }]}>
			<FontAwesome6 name={icon} size={16} color={color} iconStyle={iconStyle} />
		</View>
		<View style={styles.departmentContent}>
			<Text style={[textStyles.h6, { fontWeight: '600' }]} numberOfLines={1}>{title}</Text>
			<Text style={[textStyles.caption, { color: theme.colors.secondaryText, marginTop: 2 }]} numberOfLines={2}>
				{subtitle}
			</Text>
		</View>
		<FontAwesome6 name="chevron-right" size={11} color={theme.colors.tertiaryText} iconStyle="solid" />
	</Pressable>
)

const styles = StyleSheet.create({
	heroRow: {
		flexDirection: 'row',
		alignItems: 'center',
		marginBottom: 22,
	},
	departmentsBlock: {
		gap: 10,
		marginBottom: 26,
	},
	departmentsRow: {
		flexDirection: 'row',
		gap: 10,
	},
	departmentCard: {
		flexDirection: 'row',
		alignItems: 'center',
		gap: 12,
		padding: 14,
		borderRadius: 14,
	},
	departmentCardCompact: {
		flex: 1,
		gap: 10,
		padding: 12,
	},
	departmentContent: {
		flex: 1,
	},
	departmentIcon: {
		width: 38,
		height: 38,
		borderRadius: 11,
		alignItems: 'center',
		justifyContent: 'center',
	},
})

export default Store
