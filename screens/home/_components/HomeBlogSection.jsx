import { Linking, Platform, StyleSheet, View } from 'react-native'
import QPSectionHeader from '../../../ui/particles/QPSectionHeader'
import BlogPostCard from '../../../ui/BlogPostCard'
import { useHomeBlogPosts } from '../hooks/useHomeBlogPosts'

const HomeBlogSection = () => {
	const { data: latestBlogPosts = [] } = useHomeBlogPosts()

	return (
		<View style={styles.section}>
			<QPSectionHeader title="Últimas noticias" subtitle="Ver todas" iconName="arrow-right" onPress={() => Linking.openURL('https://qvapay.blog')} />
			<View style={Platform.isPad ? styles.blogGrid : undefined}>
				{latestBlogPosts.map((post, index) => (
					<BlogPostCard key={post.id} post={post} index={index} totalItems={latestBlogPosts.length} iPad={Platform.isPad} />
				))}
			</View>
		</View>
	)
}

const styles = StyleSheet.create({
	section: {
		marginVertical: 10,
		gap: 8,
	},
	blogGrid: {
		flexDirection: 'row',
		flexWrap: 'wrap',
		gap: 12,
	},
})

export default HomeBlogSection

