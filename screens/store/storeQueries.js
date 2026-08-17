import { useState, useEffect, useCallback } from 'react'
import { Platform } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner-native'

// APIs
import { storeApi } from '../../api/storeApi'
import { marketApi } from '../../api/marketApi'

import { unwrap } from '../../api/unwrap'

/** Raíz de las claves del catálogo de la tienda. */
export const STORE_QUERY_KEY = ['store']

export const DEFAULT_TOPUP_COUNTRY = 'CU'

// Compliance with App Store Guideline 3.1.1 — vouchers hidden on iOS.
export const SHOW_GIFT_CARDS = Platform.OS !== 'ios'

// El país seleccionado es preferencia de UI, no caché de servidor: vive en su
// propia clave de AsyncStorage (antes viajaba dentro del envelope de dataCache)
const TOPUP_COUNTRY_KEY = '@store_topup_country'

/** Países con recarga disponible. */
export const useTopupCountriesQuery = () => useQuery({
	queryKey: ['store', 'topup-countries'],
	queryFn: async () => unwrap(await storeApi.getTopupCatalog({ countries: true }))?.countries || [],
	placeholderData: previous => previous,
})

/** Operadores de recarga del país seleccionado (clave por país). */
export const useTopupBrandsQuery = (countryCode) => useQuery({
	queryKey: ['store', 'topup-brands', countryCode],
	queryFn: async () => unwrap(await storeApi.getTopupCatalog({ country: countryCode }))?.brands || [],
	enabled: !!countryCode,
})

/** Escaparate del marketplace (Seller Shops) en la portada. */
export const useMarketStoresQuery = () => useQuery({
	queryKey: ['store', 'market-stores'],
	queryFn: async () => unwrap(await marketApi.getStores({ take: 8 }))?.stores || [],
	placeholderData: previous => previous,
})

/** Países con gift cards disponibles. */
export const useVoucherCountriesQuery = () => useQuery({
	queryKey: ['store', 'voucher-countries'],
	queryFn: async () => unwrap(await storeApi.getVoucherCatalog({ countries: true }))?.countries || [],
	placeholderData: previous => previous,
})

/** Marcas de gift cards de un país (clave por país). */
export const useVoucherBrandsQuery = (countryCode) => useQuery({
	queryKey: ['store', 'voucher-brands', countryCode],
	queryFn: async () => unwrap(await storeApi.getVoucherCatalog({ country: countryCode }))?.brands || [],
	enabled: !!countryCode,
	placeholderData: previous => previous,
})

/** Categorías de gift cards presentes en un país. */
export const useVoucherCategoriesQuery = (countryCode) => useQuery({
	queryKey: ['store', 'voucher-categories', countryCode],
	queryFn: async () => unwrap(await storeApi.getVoucherCatalog({ categories: true, country: countryCode }))?.categories || [],
	enabled: !!countryCode,
	placeholderData: previous => previous,
})

/** Detalle de una marca de gift card (ofertas, logo, país del catálogo). */
export const useVoucherBrandDetailQuery = (countryCode, brandSlug) => useQuery({
	queryKey: ['store', 'voucher-brand', countryCode, brandSlug],
	queryFn: async () => unwrap(await storeApi.getVoucherCatalog({ country: countryCode, brand: brandSlug })),
	enabled: !!countryCode && !!brandSlug,
	placeholderData: previous => previous,
})

/** Operadores destacados de recarga (portada de recargas). */
export const useTopupFeaturedQuery = () => useQuery({
	queryKey: ['store', 'topup-featured'],
	queryFn: async () => (unwrap(await storeApi.getTopupCatalog({ featured: true }))?.featured || []).slice(0, 6),
	placeholderData: previous => previous,
})

/** Detalle de un operador de recarga (ofertas, logo, país del catálogo). */
export const useTopupBrandDetailQuery = (countryCode, brandSlug) => useQuery({
	queryKey: ['store', 'topup-brand', countryCode, brandSlug],
	queryFn: async () => unwrap(await storeApi.getTopupCatalog({ country: countryCode, brand: brandSlug })),
	enabled: !!countryCode && !!brandSlug,
	placeholderData: previous => previous,
})

/** Compras del usuario en la tienda (vouchers + recargas). */
export const useMyPurchasesQuery = () => useQuery({
	queryKey: ['store', 'purchases'],
	queryFn: async () => unwrap(await storeApi.getMyPurchases())?.data || [],
	placeholderData: previous => previous,
})

/** Detalle de una compra (códigos/PIN incluidos). */
export const usePurchaseDetailQuery = (purchaseId) => useQuery({
	queryKey: ['store', 'purchase', purchaseId],
	queryFn: async () => {
		const data = unwrap(await storeApi.getPurchaseDetail(purchaseId))
		return data?.data || data
	},
	enabled: !!purchaseId,
})

/** Secciones de gift cards (solo Android; en iOS quedan deshabilitadas). */
const useVoucherSectionQuery = (mode, pick) => useQuery({
	queryKey: ['store', 'vouchers', mode],
	queryFn: async () => pick(unwrap(await storeApi.getVoucherCatalog({ [mode]: true }))),
	enabled: SHOW_GIFT_CARDS,
	placeholderData: previous => previous,
})

/**
 * Owns the Store landing catalog: países y operadores de recarga, escaparate
 * del marketplace y (solo Android) las tres secciones de gift cards — todo en
 * queries independientes bajo `['store', …]`, persistidas por separado. Los
 * operadores van con clave POR PAÍS, que reemplaza al caché manual
 * `store_topup_brands:{code}` de dataCache.
 *
 * También posee la selección de país (preferencia de UI persistida en
 * AsyncStorage): restaura la última, y solo si no había nada cae en Cuba.
 *
 * @returns {{
 *   favorites: Array, featured: Array, categories: Array,
 *   topupCountries: Array, topupBrands: Array, marketStores: Array,
 *   topupSelected: Object|null, setTopupSelected: Function,
 *   loading: boolean, refreshing: boolean, onRefresh: Function,
 * }}
 */
export const useStoreCatalog = () => {

	const queryClient = useQueryClient()
	const [refreshing, setRefreshing] = useState(false)

	const [topupSelected, setTopupSelected] = useState(null)
	// La restauración debe resolverse ANTES de aplicar el default (CU): si no,
	// el default ganaría la carrera y pisaría el país guardado en cada arranque
	const [selectionRestored, setSelectionRestored] = useState(false)

	const countries = useTopupCountriesQuery()
	const brands = useTopupBrandsQuery(topupSelected?.code)
	const marketStores = useMarketStoresQuery()
	const favorites = useVoucherSectionQuery('favorites', data => data?.favorites || [])
	const featured = useVoucherSectionQuery('featured', data => (data?.featured || []).slice(0, 6))
	const categories = useVoucherSectionQuery('categories', data => (data?.categories || []).slice(0, 6))

	// Restaurar el último país seleccionado
	useEffect(() => {
		AsyncStorage.getItem(TOPUP_COUNTRY_KEY)
			.then(raw => { if (raw) setTopupSelected(prev => prev || JSON.parse(raw)) })
			.catch(() => { /* preferencia corrupta — cae al default */ })
			.finally(() => setSelectionRestored(true))
	}, [])

	// Default: Cuba (o el primero) cuando llegan los países y no hay selección
	useEffect(() => {
		if (!selectionRestored) return
		const list = countries.data
		if (!list?.length) return
		setTopupSelected(prev => prev || list.find(c => c.code === DEFAULT_TOPUP_COUNTRY) || list[0])
	}, [selectionRestored, countries.data])

	// Persistir la selección
	useEffect(() => {
		if (topupSelected) {
			AsyncStorage.setItem(TOPUP_COUNTRY_KEY, JSON.stringify(topupSelected)).catch(() => { })
		}
	}, [topupSelected])

	// El toast de operadores solo cuando no hay NADA que pintar (paridad con la
	// versión anterior: offline con caché se quedaba la lista, sin toast)
	useEffect(() => {
		if (brands.isError && !brands.data) {
			toast.error('Operadores', { description: brands.error?.message })
		}
	}, [brands.isError, brands.data, brands.error])

	const onRefresh = useCallback(async () => {
		setRefreshing(true)
		try {
			await queryClient.refetchQueries({ queryKey: STORE_QUERY_KEY })
		} catch { /* los datos anteriores siguen en pantalla */ }
		finally { setRefreshing(false) }
	}, [queryClient])

	return {
		favorites: favorites.data || [],
		featured: featured.data || [],
		categories: categories.data || [],
		topupCountries: countries.data || [],
		topupBrands: brands.data || [],
		marketStores: marketStores.data || [],
		topupSelected,
		setTopupSelected,
		loading: countries.isPending,
		refreshing,
		onRefresh,
	}
}
