import FastImage from '@d11/react-native-fast-image'
import { View, Text, StyleSheet, Pressable, Linking, useWindowDimensions } from 'react-native'

// Theme Context
import { useTheme } from '../theme/ThemeContext'
import { useTextStyles } from '../theme/themeUtils'

// Icons
import FontAwesome6 from '@react-native-vector-icons/fontawesome6'

// i18n (locale de fechas acorde al idioma activo)
import { getDateLocale } from '../i18n'

// Tipos (el post ya llega transformado por blogApi desde el REST de WordPress)
import type { BlogPost } from '../api/blogApi'

// Format date
const formatDate = (dateString: string) => {
	const date = new Date(dateString)
	return date.toLocaleDateString(getDateLocale(), {
		year: 'numeric',
		month: 'long',
		day: 'numeric'
	})
}

// Strip HTML tags from excerpt
const stripHtml = (html: string) => { return html.replace(/<[^>]*>/g, '').trim() }

type BlogPostCardProps = {
	post: BlogPost
	index: number
	totalItems: number
	iPad?: boolean
}

/**
 * Card for a WordPress blog post (featured image, date, author, title, excerpt)
 * shown in the Home feed; tapping opens the post in the external browser.
 * Excerpt HTML is stripped client-side; dates follow the active i18n locale.
 * On iPad the cards render two-up, so width is computed from the window width
 * and the bottom margin is dropped.
 *
 * @param props
 * @param props.post - WP REST post: `{ title, excerpt, link, date, author, featuredImage }`.
 * @param props.index - Position in the list (controls bottom spacing on phones).
 * @param props.totalItems - Total posts rendered (last card gets no margin).
 * @param props.iPad - Enables the two-column iPad layout.
 */
const BlogPostCard = ({ post, index, totalItems, iPad }: BlogPostCardProps) => {

	const { theme, styles: themeStyles } = useTheme()
	const textStyles = useTextStyles(theme)
	const { width: screenWidth } = useWindowDimensions()
	const cardWidth = iPad ? (screenWidth - 32 - 12) / 2 : undefined

	// Handle opening blog post in browser
	const handlePress = async () => {
		try {
			await Linking.openURL(post.link)
		} catch (error) { /* error opening blog post */ }
	}

	return (
		<Pressable style={[styles.card, { backgroundColor: theme.colors.elevation, borderColor: theme.colors.border, marginBottom: iPad ? 0 : (index < totalItems - 1 ? 12 : 0), width: cardWidth }]} onPress={handlePress} >
			<View style={styles.imageContainer}>
				<FastImage source={{ uri: post.featuredImage, cache: FastImage.cacheControl.immutable }} style={themeStyles.container.fill} resizeMode={FastImage.resizeMode.cover} />
			</View>
			<View style={styles.contentContainer}>
				<View style={styles.metaContainer}>
					<Text style={[textStyles.caption, { color: theme.colors.secondaryText }]}>
						{formatDate(post.date)}
					</Text>
					<View style={styles.metaSeparator}>
						<View style={[styles.dot, { backgroundColor: theme.colors.secondaryText }]} />
					</View>
					<View style={styles.authorContainer}>
						<FastImage source={{ uri: 'https://www.qvapay.com/assets/qvapay-logo-white.png', cache: FastImage.cacheControl.immutable }} style={styles.authorAvatar} resizeMode={FastImage.resizeMode.cover} />
						<Text style={[textStyles.caption, { color: theme.colors.secondaryText }]}>
							{post.author}
						</Text>
					</View>
				</View>
				<Text style={[textStyles.h6, { color: theme.colors.primaryText, marginTop: 8 }]} numberOfLines={2}>{post.title}</Text>
				<Text style={[textStyles.body, { color: theme.colors.secondaryText, marginTop: 4 }]} numberOfLines={3}>{stripHtml(post.excerpt)}</Text>
				<View style={styles.arrowContainer}>
					<FontAwesome6 name="arrow-up-right-from-square" size={12} color={theme.colors.primary} iconStyle="solid" />
				</View>
			</View>
		</Pressable>
	)
}

const styles = StyleSheet.create({
	card: {
		borderRadius: 12,
		overflow: 'hidden',
	},
	imageContainer: {
		position: 'relative',
		height: 200,
	},
	contentContainer: {
		padding: 16,
		position: 'relative',
	},
	metaContainer: {
		flexDirection: 'row',
		alignItems: 'center',
		gap: 8,
	},
	metaSeparator: {
		flexDirection: 'row',
		alignItems: 'center',
	},
	dot: {
		width: 4,
		height: 4,
		borderRadius: 2,
	},
	authorContainer: {
		flexDirection: 'row',
		alignItems: 'center',
		gap: 6,
	},
	authorAvatar: {
		width: 20,
		height: 20,
		borderRadius: 10,
	},
	arrowContainer: {
		position: 'absolute',
		top: 16,
		right: 16,
		width: 24,
		height: 24,
		borderRadius: 12,
		justifyContent: 'center',
		alignItems: 'center',
	},
})

export default BlogPostCard
