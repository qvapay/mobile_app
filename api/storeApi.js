import { apiClient } from './client'

// Builds an axios-style { success, data, error } envelope. Used for every endpoint here.
const wrap = async (request, fallbackError) => {
	try {
		const response = await request()
		return { success: true, data: response.data, status: response.status }
	} catch (error) {
		if (error.response?.data) {
			const errorData = error.response.data
			return {
				success: false,
				error: errorData.error || errorData.message || fallbackError,
				details: errorData,
				status: error.response.status,
			}
		}
		return { success: false, error: error.message || 'Error de red', status: error.response?.status }
	}
}

const buildQuery = (params) => {
	const qs = new URLSearchParams()
	Object.entries(params || {}).forEach(([k, v]) => {
		if (v === true) qs.append(k, '')
		else if (v !== undefined && v !== null && v !== false && v !== '') qs.append(k, String(v))
	})
	return qs.toString()
}

export const storeApi = {

	// ---------------------- GIFT CARDS (VOUCHERS) ----------------------

	// Catálogo de vouchers (Zendit gift cards). Modos exclusivos vía params:
	//   { countries: true } → lista de países con conteo
	//   { featured: true }  → top 12 globales
	//   { favorites: true } → top 6 del usuario (requiere auth)
	//   { categories: true, country? } → categorías con conteo
	//   { country: 'US' }   → brands del país
	//   { country: 'US', brand: 'amazon' } → offers de un brand
	getVoucherCatalog: async (params = {}) => {
		const qs = buildQuery(params)
		const url = qs ? `/store/voucher-catalog?${qs}` : '/store/voucher-catalog'
		return wrap(() => apiClient.get(url), 'No se pudo obtener el catálogo de tarjetas')
	},

	// Compra un voucher. body: { offer_id, country, brand, amount? }
	purchaseVoucher: async (body) => {
		if (!body?.offer_id || !body?.country || !body?.brand) {
			return { success: false, error: 'Faltan datos para la compra', status: 400 }
		}
		return wrap(() => apiClient.post('/store/voucher/purchase', body), 'No se pudo realizar la compra')
	},

	// ---------------------- TOPUPS (LATAM + CUBA) ----------------------

	// Catálogo unificado de recargas. Cuba devuelve 'cubacel' (source: 'cuba'),
	// el resto brands Zendit (source: 'global').
	//   { countries: true } | { featured: true }
	//   { country: 'CU' } | { country: 'MX', brand: 'telcel', subType? }
	getTopupCatalog: async (params = {}) => {
		const qs = buildQuery(params)
		const url = qs ? `/store/topup-catalog?${qs}` : '/store/topup-catalog'
		return wrap(() => apiClient.get(url), 'No se pudo obtener el catálogo de recargas')
	},

	// Compra LATAM (Zendit). body: { offer_id, phone_number, country, amount? }
	purchaseTopup: async (body) => {
		if (!body?.offer_id || !body?.phone_number || !body?.country) {
			return { success: false, error: 'Faltan datos para la recarga', status: 400 }
		}
		return wrap(() => apiClient.post('/store/topup', body), 'No se pudo realizar la recarga')
	},

	// Compra Cuba (Cubacel phone_packages). body: { phone_package_id, phone_number }
	purchasePhonePackage: async (body) => {
		if (!body?.phone_package_id || !body?.phone_number) {
			return { success: false, error: 'Faltan datos para la recarga', status: 400 }
		}
		return wrap(() => apiClient.post('/store/phone_package', body), 'No se pudo realizar la recarga')
	},

	// ---------------------- COMPRAS ----------------------

	getMyPurchases: async () => wrap(() => apiClient.get('/store/my'), 'No se pudieron obtener tus compras'),

	getPurchaseDetail: async (id) => wrap(() => apiClient.get(`/store/my/${id}`), 'No se pudo obtener el detalle'),
}

export { apiClient }
export default storeApi
