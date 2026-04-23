import { useQuery } from '@tanstack/react-query'
import promoApi from '../../../api/promoApi'

export const homePromoQueryKey = ['home', 'promo']

export const useHomePromo = () => useQuery({
	queryKey: homePromoQueryKey,
	queryFn: async () => {
		const result = await promoApi.getPromo()
		if (!result.success) {
			return null
		}
		return result.data || null
	},
	placeholderData: previousData => previousData,
})

