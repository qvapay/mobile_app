import { StyleSheet, View } from 'react-native'

// Theme Context
import { useTheme } from '../../theme/ThemeContext'

// Imagecomponents
import FastImage from "@d11/react-native-fast-image"
import LinearGradient from 'react-native-linear-gradient'

// QvaPay Avatar Component
const QPAvatar = ({ user = {}, size = 32 }) => {

    // Contexts
    const { theme } = useTheme()

    // Optional properties
    const vip = user?.vip || false
    const rating = user?.rating || 0
    const kyc = user?.kyc || false
    const golden_check = user?.golden_check || false
    const image = user?.image || ''

    // Variables
    const borderVip = size / 25
    const gradientColors = vip ? [theme.colors.danger, theme.colors.primary, theme.colors.success] : ['#ffffff', '#ffffff']
    const profile_picture = image ? `https://media.qvapay.com/${image}` : 'https://qvapay.com/android-chrome-512x512.png'
    const hasImage = !!image

    return (
        <View style={[styles.container, { backgroundColor: theme.colors.background, width: size, height: size }]}>
            <LinearGradient colors={gradientColors} style={{ padding: borderVip, borderRadius: size }}>
                <FastImage
                    style={{ 
                        width: size - (borderVip * 2), 
                        height: size - (borderVip * 2), 
                        borderRadius: (size - (borderVip * 2)) / 2,
                        backgroundColor: vip && !hasImage ? '#ffffff' : 'transparent'
                    }}
                    source={{
                        uri: profile_picture,
                        priority: FastImage.priority.normal,
                    }}
                    resizeMode={FastImage.resizeMode.cover}
                />
            </LinearGradient>
            {/* {
                showBadge && (
                    <View style={styles.badgeRating}>
                        <View style={styles.badge}>
                            <Text style={[styles.badgeRatingText, { fontSize: badgeSize }]}>{rating}</Text>
                            <FontAwesome name="star" size={badgeSize} style={styles.faIcon} />
                        </View>
                    </View>
                )
            } */}
        </View>
    )
}

const styles = StyleSheet.create({
    container: {
        borderRadius: 50,
        overflow: 'hidden',
    }
})

export default QPAvatar