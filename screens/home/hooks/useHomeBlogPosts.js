import { Platform } from 'react-native'
import { useQuery } from '@tanstack/react-query'
import { blogApi } from '../../../api/blogApi'

export const homeBlogPostsQueryKey = (take) => ['home', 'blog', { take }]

export const useHomeBlogPosts = () => {
	const take = Platform.isPad ? 4 : 3

	return useQuery({
		queryKey: homeBlogPostsQueryKey(take),
		queryFn: async () => {
			const result = await blogApi.getLatestPosts(take)
			if (!result.success) {
				throw new Error(result.error || 'No se pudieron cargar las noticias')
			}
			return result.data || []
		},
		placeholderData: previousData => previousData,
	})
}

