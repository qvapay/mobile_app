import { View, Text, Pressable, StyleSheet } from 'react-native'

import CountryPicker from '../../ui/store/CountryPicker'
import OperatorAvatar from '../../ui/store/OperatorAvatar'
import { ROUTES } from '../../routes'

const formatPriceRange = (min, max) => {
	if (min == null && max == null) return null
	if (min == null) return `Hasta $${Number(max).toFixed(2)}`
	if (max == null || max === min) return `$${Number(min).toFixed(2)}`
	return `$${Number(min).toFixed(2)} – $${Number(max).toFixed(2)}`
}

// Mobile top-ups block of the Store screen: country picker + top-6 operators grid.
const StoreTopupSection = ({ topupCountries, topupSelected, topupBrands, onSelectCountry, numColumns, theme, textStyles, navigation }) => {

	const goToTopupBrand = (b) => {
		navigation.navigate(ROUTES.PHONE_TOPUP_BRAND, {
			country: topupSelected,
			countryCode: topupSelected?.code,
			brandSlug: b.slug || b.brand,
		})
	}

	return (
		<View style={styles.section}>
			<View style={styles.recargasHeader}>
				<View style={{ flex: 1 }}>
					<Text style={[textStyles.h3, { color: theme.colors.primaryText, fontWeight: '800' }]}>Recargas móviles</Text>
					<Text style={[textStyles.caption, { color: theme.colors.tertiaryText, marginTop: 2 }]}>
						{topupSelected?.code === 'CU'
							? 'Cubacel local — tarifa P2P sin recargo.'
							: 'Recarga el móvil de cualquier persona en LATAM.'}
					</Text>
				</View>
				<Pressable
					onPress={() => navigation.navigate(ROUTES.PHONE_TOPUP_INDEX, { country: topupSelected?.code })}
					style={[styles.miniCta, { backgroundColor: theme.colors.surface }, theme.mode === 'light' && { borderWidth: 0.5, borderColor: theme.colors.border }]}
				>
					<Text style={[textStyles.caption, { color: theme.colors.primary, fontWeight: '700' }]}>Ver todas</Text>
				</Pressable>
			</View>

			{/* Country picker */}
			<View style={{ marginBottom: 12 }}>
				<CountryPicker
					countries={topupCountries}
					value={topupSelected}
					onChange={onSelectCountry}
					placeholder="Selecciona país"
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
								theme.mode === 'light' && { borderWidth: 0.5, borderColor: theme.colors.border },
							]}
						>
							<OperatorAvatar brand={b.brand} logoUrl={b.logo_url} size="md" />
							<View style={{ flex: 1, marginLeft: 10 }}>
								<Text numberOfLines={1} style={[textStyles.h6, { color: theme.colors.primaryText, fontWeight: '700' }]}>
									{b.brand}
								</Text>
								<Text numberOfLines={1} style={[textStyles.caption, { color: theme.colors.tertiaryText }]}>
									{price || `${b.offer_count || 0} planes`}
								</Text>
							</View>
						</Pressable>
					)
				})}
				{topupBrands.length === 0 && (
					<View style={[styles.empty, { backgroundColor: theme.colors.surface, width: '100%' }]}>
						<Text style={[textStyles.h6, { color: theme.colors.tertiaryText, textAlign: 'center' }]}>
							No hay operadores disponibles
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
		borderRadius: 999,
	},
	recargasHeader: {
		flexDirection: 'row',
		alignItems: 'center',
		marginBottom: 14,
	},
	brandGrid: {
		flexDirection: 'row',
		flexWrap: 'wrap',
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
