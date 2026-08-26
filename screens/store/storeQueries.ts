import { useState, useEffect, useCallback } from 'react'
import { Platform } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { UseQueryResult } from '@tanstack/react-query'
import { toast } from 'sonner-native'

// APIs
import { storeApi } from '../../api/storeApi'
import { marketApi } from '../../api/marketApi'

import { unwrap } from '../../api/unwrap'

// i18n en call time (hook fuera de componentes: los toasts se resuelven al disparar)
import i18n from '../../i18n'

import type { CatalogCountry } from '../../ui/store/CountryPicker'
import type { CatalogBrand } from '../../ui/store/BrandTile'
import type { MarketShop } from './market/marketQueries'

// ---------------------------------------------------------------------------
// Formas del catálogo Zendit. No están en types/domain: se declaran aquí a
// partir de lo que las pantallas de la tienda leen realmente.
// ---------------------------------------------------------------------------

/** País del catálogo (`?countries`) con los extras que usa el wizard de recargas. */
export type StoreCountry = CatalogCountry & {
	/** Prefijo E.164 del país (`+53`), para construir el número completo. */
	dial?: string | null
	/** Regex de validación del número E.164 de ese país. */
	pattern?: string | null
}

/** Marca del catálogo (gift cards o recargas) tal y como llega en las listas. */
export type StoreBrand = CatalogBrand & {
	/** ISO-2 del país de la marca (las listas globales mezclan países). */
	country?: string
	/** País embebido en las filas destacadas/favoritas. */
	country_meta?: Partial<StoreCountry> | null
	/** Slug preferido para navegar; cae en `brand` cuando falta. */
	slug?: string
	category?: string
}

/** Categoría de gift cards (`?categories`). */
export type StoreCategory = { key: string, label: string, emoji?: string | null, count?: number | null }

/**
 * Oferta comprable: denominación de gift card, plan Zendit o paquete Cubacel
 * (`source: 'cuba'`). Un único tipo con los campos de las tres formas — es lo
 * que hacen las pantallas, que ramifican por `source` / `price_type`.
 */
export type StoreOffer = {
	offer_id?: string
	/** Solo paquetes Cubacel. */
	phone_package_id?: string | number
	/** `'cuba'` = paquete Cubacel; ausente/otro = catálogo Zendit. */
	source?: string
	brand?: string
	name?: string
	notes?: string | string[] | null
	sent_benefits?: string | null
	sub_type?: string | null
	period?: string | null
	external?: boolean | null
	price_type?: 'FIXED' | 'RANGE' | (string & {})
	price?: number | string | null
	price_min?: number | string | null
	price_max?: number | string | null
	/** Precio GOLD de un paquete Cubacel. */
	gold_price?: number | string | null
	/** Comisión de servicio (%) de las ofertas de rango. */
	service_fee_pct?: number | string | null
	/** Valor de referencia de una gift card. */
	send?: { value?: number | string | null, currency?: string | null } | null
}

/** Detalle de una marca (`?country&brand`): ofertas + metadatos de cabecera. */
export type StoreBrandDetail = {
	offers?: StoreOffer[]
	brand?: string
	brand_logo_url?: string | null
	country?: StoreCountry | null
}

/** Fila de `GET /store/my`. */
export type StorePurchase = {
	id: number | string
	status?: string
	service_name?: string
	service_logo?: string | null
	created_at?: string
	amount?: number | string | null
}

/** Recibo de `GET /store/my/{id}` (los valores se pintan crudos con `String()`). */
export type StorePurchaseDetail = {
	id?: number | string
	status?: string
	amount?: number | string | null
	notes?: string | null
	created_at?: string
	service?: { name?: string | null, logo?: string | null } | null
	service_data?: {
		brand?: string | null
		country?: string | null
		productType?: string | null
		providerTransactionId?: string | null
		providerStatus?: string | null
		receipt?: Record<string, unknown> | null
	} | null
	transaction?: { uuid?: string } | null
}

/** Raíz de las claves del catálogo de la tienda. */
export const STORE_QUERY_KEY = ['store']

export const DEFAULT_TOPUP_COUNTRY = 'CU'

// Compliance with App Store Guideline 3.1.1 — vouchers hidden on iOS.
export const SHOW_GIFT_CARDS = Platform.OS !== 'ios'

// El país seleccionado es preferencia de UI, no caché de servidor: vive en su
// propia clave de AsyncStorage (antes viajaba dentro del envelope de dataCache)
const TOPUP_COUNTRY_KEY = '@store_topup_country'

/** Países con recarga disponible. */
export const useTopupCountriesQuery = (): UseQueryResult<StoreCountry[]> => useQuery({
	queryKey: ['store', 'topup-countries'],
	queryFn: async () => (unwrap(await storeApi.getTopupCatalog({ countries: true })) as { countries?: StoreCountry[] } | null)?.countries || [],
	placeholderData: previous => previous,
})

/** Operadores de recarga del país seleccionado (clave por país). */
export const useTopupBrandsQuery = (countryCode: string | undefined): UseQueryResult<StoreBrand[]> => useQuery({
	queryKey: ['store', 'topup-brands', countryCode],
	queryFn: async () => (unwrap(await storeApi.getTopupCatalog({ country: countryCode })) as { brands?: StoreBrand[] } | null)?.brands || [],
	enabled: !!countryCode,
})

/** Escaparate del marketplace (Seller Shops) en la portada. */
export const useMarketStoresQuery = (): UseQueryResult<MarketShop[]> => useQuery({
	queryKey: ['store', 'market-stores'],
	queryFn: async () => (unwrap(await marketApi.getStores({ take: 8 })) as { stores?: MarketShop[] } | null)?.stores || [],
	placeholderData: previous => previous,
})

/** Países con gift cards disponibles. */
export const useVoucherCountriesQuery = (): UseQueryResult<StoreCountry[]> => useQuery({
	queryKey: ['store', 'voucher-countries'],
	queryFn: async () => (unwrap(await storeApi.getVoucherCatalog({ countries: true })) as { countries?: StoreCountry[] } | null)?.countries || [],
	placeholderData: previous => previous,
})

/** Marcas de gift cards de un país (clave por país). */
export const useVoucherBrandsQuery = (countryCode: string | undefined): UseQueryResult<StoreBrand[]> => useQuery({
	queryKey: ['store', 'voucher-brands', countryCode],
	queryFn: async () => (unwrap(await storeApi.getVoucherCatalog({ country: countryCode })) as { brands?: StoreBrand[] } | null)?.brands || [],
	enabled: !!countryCode,
	placeholderData: previous => previous,
})

/** Categorías de gift cards presentes en un país. */
export const useVoucherCategoriesQuery = (countryCode: string | undefined): UseQueryResult<StoreCategory[]> => useQuery({
	queryKey: ['store', 'voucher-categories', countryCode],
	queryFn: async () => (unwrap(await storeApi.getVoucherCatalog({ categories: true, country: countryCode })) as { categories?: StoreCategory[] } | null)?.categories || [],
	enabled: !!countryCode,
	placeholderData: previous => previous,
})

/** Detalle de una marca de gift card (ofertas, logo, país del catálogo). */
export const useVoucherBrandDetailQuery = (countryCode: string | undefined, brandSlug: string | undefined): UseQueryResult<StoreBrandDetail | null> => useQuery({
	queryKey: ['store', 'voucher-brand', countryCode, brandSlug],
	queryFn: async () => unwrap(await storeApi.getVoucherCatalog({ country: countryCode, brand: brandSlug })) as StoreBrandDetail | null,
	enabled: !!countryCode && !!brandSlug,
	placeholderData: previous => previous,
})

/** Operadores destacados de recarga (portada de recargas). */
export const useTopupFeaturedQuery = (): UseQueryResult<StoreBrand[]> => useQuery({
	queryKey: ['store', 'topup-featured'],
	queryFn: async () => ((unwrap(await storeApi.getTopupCatalog({ featured: true })) as { featured?: StoreBrand[] } | null)?.featured || []).slice(0, 6),
	placeholderData: previous => previous,
})

/** Detalle de un operador de recarga (ofertas, logo, país del catálogo). */
export const useTopupBrandDetailQuery = (countryCode: string | undefined, brandSlug: string | undefined): UseQueryResult<StoreBrandDetail | null> => useQuery({
	queryKey: ['store', 'topup-brand', countryCode, brandSlug],
	queryFn: async () => unwrap(await storeApi.getTopupCatalog({ country: countryCode, brand: brandSlug })) as StoreBrandDetail | null,
	enabled: !!countryCode && !!brandSlug,
	placeholderData: previous => previous,
})

/** Compras del usuario en la tienda (vouchers + recargas). */
export const useMyPurchasesQuery = (): UseQueryResult<StorePurchase[]> => useQuery({
	queryKey: ['store', 'purchases'],
	queryFn: async () => (unwrap(await storeApi.getMyPurchases()) as { data?: StorePurchase[] } | null)?.data || [],
	placeholderData: previous => previous,
})

/** Detalle de una compra (códigos/PIN incluidos). */
export const usePurchaseDetailQuery = (purchaseId: number | string | undefined): UseQueryResult<StorePurchaseDetail | null> => useQuery({
	queryKey: ['store', 'purchase', purchaseId],
	queryFn: async () => {
		const data = unwrap(await storeApi.getPurchaseDetail(purchaseId as number | string)) as (StorePurchaseDetail & { data?: StorePurchaseDetail }) | null
		return data?.data || data
	},
	enabled: !!purchaseId,
})

/** Secciones de gift cards (solo Android; en iOS quedan deshabilitadas). */
const useVoucherSectionQuery = <T>(mode: string, pick: (data: Record<string, unknown> | null) => T): UseQueryResult<T> => useQuery({
	queryKey: ['store', 'vouchers', mode],
	queryFn: async () => pick(unwrap(await storeApi.getVoucherCatalog({ [mode]: true })) as Record<string, unknown> | null),
	enabled: SHOW_GIFT_CARDS,
	placeholderData: previous => previous,
})

/** Lo que expone `useStoreCatalog` a la portada de la tienda. */
export type StoreCatalog = {
	favorites: StoreBrand[]
	featured: StoreBrand[]
	categories: StoreCategory[]
	topupCountries: StoreCountry[]
	topupBrands: StoreBrand[]
	marketStores: MarketShop[]
	topupSelected: StoreCountry | null
	setTopupSelected: (country: StoreCountry) => void
	loading: boolean
	refreshing: boolean
	onRefresh: () => Promise<void>
}

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
 * @returns Catálogos, país seleccionado y el pull-to-refresh de la portada.
 */
export const useStoreCatalog = (): StoreCatalog => {

	const queryClient = useQueryClient()
	const [refreshing, setRefreshing] = useState(false)

	const [topupSelected, setTopupSelected] = useState<StoreCountry | null>(null)
	// La restauración debe resolverse ANTES de aplicar el default (CU): si no,
	// el default ganaría la carrera y pisaría el país guardado en cada arranque
	const [selectionRestored, setSelectionRestored] = useState(false)

	const countries = useTopupCountriesQuery()
	const brands = useTopupBrandsQuery(topupSelected?.code)
	const marketStores = useMarketStoresQuery()
	const favorites = useVoucherSectionQuery('favorites', data => (data?.favorites as StoreBrand[] | undefined) || [])
	const featured = useVoucherSectionQuery('featured', data => ((data?.featured as StoreBrand[] | undefined) || []).slice(0, 6))
	const categories = useVoucherSectionQuery('categories', data => ((data?.categories as StoreCategory[] | undefined) || []).slice(0, 6))

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
			toast.error(i18n.t('store.toasts.operators'), { description: brands.error?.message })
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
