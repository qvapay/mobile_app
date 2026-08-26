import { View, Text, Pressable, StyleSheet } from 'react-native'
import { useTranslation } from 'react-i18next'
import i18n from '../../i18n'

import CountryPicker from '../../ui/store/CountryPicker'
import OperatorAvatar from '../../ui/store/OperatorAvatar'
import { ROUTES } from '../../routes'

import type { Theme } from '../../theme/ThemeContext'
import type { TextStyles } from '../../theme/themeUtils'
import type { StoreBrand, StoreCountry } from './storeQueries'
import type { StoreNavigation } from './Store'

// OJO: `theme.mode` no existe en el tema (siempre undefined) — bug de runtime
// pre-existente que se preserva tal cual; el alias es solo de tipos.
type ThemeWithMode = Theme & { mode?: string }

// i18n.t en call time: se re-resuelve en cada render (el componente re-renderiza
// con useTranslation al cambiar de idioma)
const formatPriceRange = (min: number | string | null | undefined, max: number | string | null | undefined): string | null => {
	if (min == null && max == null) return null
	if (min == null) return i18n.t('store.common.upTo', { amount: `$${Number(max).toFixed(2)}` })
	if (max == null || max === min) return `$${Number(min).toFixed(2)}`
	return `$${Number(min).toFixed(2)} – $${Number(max).toFixed(2)}`
}

type Props = {
	topupCountries: StoreCountry[]
	topupSelected: StoreCountry | null
	topupBrands: StoreBrand[]
	onSelectCountry: (country: StoreCountry) => void
	numColumns: number
	theme: Theme
	textStyles: TextStyles
	navigation: StoreNavigation
}

// Mobile top-ups block of the Store screen: country picker + top-6 operators grid.
const StoreTopupSection = ({ topupCountries, topupSelected, topupBrands, onSelectCountry, numColumns, theme, textStyles, navigation }: Props) => {

	const { t } = useTranslation()

	const goToTopupBrand = (b: StoreBrand) => {
		navigation.navigate(ROUTES.PHONE_TOPUP_BRAND, {
			// El param se declara opcional (`CountryParam | undefined`) pero aquí puede
			// viajar `null` si aún no hay país elegido — se preserva tal cual
			country: topupSelected as StoreCountry,
			countryCode: topupSelected?.code,
			brandSlug: b.slug || b.brand,
		})
	}

	return (
		<View style={styles.section}>
			<View style={styles.recargasHeader}>
				<View style={{ flex: 1 }}>
					<Text style={[textStyles.h3, { color: theme.colors.primaryText, fontWeight: '600' }]}>{t('store.landing.departments.topups.title')}</Text>
					<Text style={[textStyles.caption, { color: theme.colors.tertiaryText, marginTop: 2 }]}>
						{topupSelected?.code === 'CU'
							? t('store.landing.topups.cubaHint')
							: t('store.common.latamHint')}
					</Text>
				</View>
				<Pressable
					onPress={() => navigation.navigate(ROUTES.PHONE_TOPUP_INDEX, { country: topupSelected?.code })}
					style={[styles.miniCta, { backgroundColor: theme.colors.surface }, (theme as ThemeWithMode).mode === 'light' && { borderWidth: 0.5, borderColor: theme.colors.border }]}
				>
					<Text style={[textStyles.caption, { color: theme.colors.primary, fontWeight: '600' }]}>{t('common.actions.seeAll')}</Text>
				</Pressable>
			</View>

			{/* Country picker */}
			<View style={{ marginBottom: 12 }}>
				<CountryPicker
					countries={topupCountries}
					value={topupSelected}
					onChange={onSelectCountry}
					placeholder={t('store.common.selectCountry')}
				/>
			</View>

			{/* Brands grid (top 6) */}
			<View style={styles.brandGrid}>
				{topupBrands.slice(0, 6).map(b => {
					const price = formatPriceRange(b.price_min, b.price_max)
					return (
						<Pressable
							key={`${topupSelected?.code}-${b.brand}`}
							onPress={() => goToTopupBrand(b)}
							style={[
								styles.brandCell,
								{
									backgroundColor: theme.colors.surface,
									width: numColumns === 2 ? '48%' : numColumns === 3 ? '31.5%' : '23%',
								},
								(theme as ThemeWithMode).mode === 'light' && { borderWidth: 0.5, borderColor: theme.colors.border },
							]}
						>
							<OperatorAvatar brand={b.brand} logoUrl={b.logo_url} size="md" />
							<View style={{ flex: 1, marginLeft: 10 }}>
								<Text numberOfLines={1} style={[textStyles.h6, { color: theme.colors.primaryText, fontWeight: '600' }]}>
									{b.brand}
								</Text>
								<Text numberOfLines={1} style={[textStyles.caption, { color: theme.colors.tertiaryText }]}>
									{price || t('store.common.plans', { count: b.offer_count || 0 })}
								</Text>
							</View>
						</Pressable>
					)
				})}
				{topupBrands.length === 0 && (
					<View style={[styles.empty, { backgroundColor: theme.colors.surface, width: '100%' }]}>
						<Text style={[textStyles.h6, { color: theme.colors.tertiaryText, textAlign: 'center' }]}>
							{t('store.common.noOperators')}
						</Text>
					</View>
				)}
			</View>
		</View>
	)
}

const styles = StyleSheet.create({
	section: { marginBottom: 24 },
	miniCta: {
		flexDirection: 'row',
		alignItems: 'center',
		paddingHorizontal: 12,
		paddingVertical: 8,
		borderRadius: 12,
		borderCurve: 'continuous',
	},
	recargasHeader: {
		flexDirection: 'row',
		alignItems: 'center',
		marginBottom: 14,
	},
	brandGrid: {
		flexDirection: 'row',
		flexWrap: 'wrap',
		justifyContent: 'space-between',
		gap: 10,
	},
	brandCell: {
		flexDirection: 'row',
		alignItems: 'center',
		padding: 12,
		borderRadius: 14,
	},
	empty: {
		padding: 30,
		borderRadius: 14,
		alignItems: 'center',
	},
})

export default StoreTopupSection
