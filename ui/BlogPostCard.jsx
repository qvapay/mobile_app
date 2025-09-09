import { View, Text, StyleSheet, Pressable, Image, Linking } from 'react-native'

// Theme Context
import { useTheme } from '../theme/ThemeContext'
import { useContainerStyles, useTextStyles } from '../theme/themeUtils'

// Icons
import FontAwesome6 from '@react-native-vector-icons/fontawesome6'

// Blog Post Card
const BlogPostCard = ({ post, index, totalItems }) => {

    const { theme } = useTheme()
    const containerStyles = useContainerStyles(theme)
    const textStyles = useTextStyles(theme)

    // Format date
    const formatDate = (dateString) => {
        const date = new Date(dateString)
        return date.toLocaleDateString('es-ES', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        })
    }

    // Strip HTML tags from excerpt
    const stripHtml = (html) => { return html.replace(/<[^>]*>/g, '').trim() }

    // Handle opening blog post in browser
    const handlePress = async () => {
        try {
            await Linking.openURL(post.link)
        } catch (error) { console.error('Error opening blog post:', error) }
    }

    return (
        <Pressable style={[styles.card, { backgroundColor: theme.colors.elevation, borderColor: theme.colors.border, marginBottom: index < totalItems - 1 ? 12 : 0 }]} onPress={handlePress} >

            {/* Featured Image */}
            <View style={styles.imageContainer}>
                <Image source={{ uri: post.featuredImage }} style={styles.featuredImage} resizeMode="cover" />
            </View>

            {/* Content */}
            <View style={styles.contentContainer}>

                <View style={styles.metaContainer}>
                    <Text style={[textStyles.caption, { color: theme.colors.secondaryText }]}>
                        {formatDate(post.date)}
                    </Text>
                    <View style={styles.metaSeparator}>
                        <View style={[styles.dot, { backgroundColor: theme.colors.secondaryText }]} />
                    </View>
                    <View style={styles.authorContainer}>
                        <Image source={{ uri: 'https://qvpay.me/assets/qvapay-logo-white.png' }} style={styles.authorAvatar} />
                        <Text style={[textStyles.caption, { color: theme.colors.secondaryText }]}>
                            {post.author}
                        </Text>
                    </View>
                </View>

                {/* Title */}
                <Text style={[textStyles.h6, { color: theme.colors.primaryText, marginTop: 8 }]} numberOfLines={2} >
                    {post.title}
                </Text>

                {/* Excerpt */}
                <Text style={[textStyles.body, { color: theme.colors.secondaryText, marginTop: 4 }]} numberOfLines={3} >
                    {stripHtml(post.excerpt)}
                </Text>

                {/* Arrow Icon */}
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
    featuredImage: {
        width: '100%',
        height: '100%',
    },
    imageOverlay: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
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
