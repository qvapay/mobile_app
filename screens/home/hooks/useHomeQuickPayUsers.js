import { useQuery } from '@tanstack/react-query'
import { transferApi } from '../../../api/transferApi'

const DEFAULT_TAKE = 10

export const homeQuickPayUsersQueryKey = (take = DEFAULT_TAKE) => ['home', 'quick-pay-users', { take }]

export const useHomeQuickPayUsers = (take = DEFAULT_TAKE) => useQuery({
	queryKey: homeQuickPayUsersQueryKey(take),
	queryFn: async () => {
		const result = await transferApi.getLatestSentTransfers(take)
		if (!result.success) {
			throw new Error(result.error || 'No se pudieron cargar los usuarios recientes')
		}
		return (result.data || []).filter(user => user.image)
	},
	placeholderData: previousData => previousData,
})

