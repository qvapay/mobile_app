import { useQuery } from '@tanstack/react-query'
import { userApi } from '../../../api/userApi'

export const homeProfileQueryKey = ['home', 'profile']

export const useHomeProfile = (updateUser) => useQuery({
	queryKey: homeProfileQueryKey,
	queryFn: async () => {
		const result = await userApi.getUserProfile()
		if (!result.success || !result.data) {
			throw new Error(result.error || 'No se pudo cargar el perfil')
		}
		updateUser(result.data)
		return result.data
	},
	staleTime: 60000,
})

