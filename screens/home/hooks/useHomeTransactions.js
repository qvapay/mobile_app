import FastImage from '@d11/react-native-fast-image'
import { useQuery } from '@tanstack/react-query'
import { transferApi } from '../../../api/transferApi'

const DEFAULT_TAKE = 6

export const homeTransactionsQueryKey = (take = DEFAULT_TAKE) => ['home', 'transactions', { take }]

export const useHomeTransactions = (take = DEFAULT_TAKE) => useQuery({
	queryKey: homeTransactionsQueryKey(take),
	queryFn: async () => {
		const result = await transferApi.getLatestTransactions({ take })
		if (!result.success) {
			throw new Error(result.error || 'No se pudieron cargar las transacciones')
		}

		const transactions = result.data || []
		const avatarUrls = transactions
			.map(t => (t.paid_by_user || t.user)?.image)
			.filter(Boolean)
			.map(image => ({ uri: `https://media.qvapay.com/${image}` }))

		if (avatarUrls.length) {
			FastImage.preload(avatarUrls)
		}

		return transactions
	},
	placeholderData: previousData => previousData,
})

