import React from 'react'
import { StyleSheet, View } from 'react-native'

// Auth Context
import { useAuth } from '../../auth/authContext'

// Theme Context
import { useTheme } from '../../theme/ThemeContext'

// Imagecomponents
import FastImage from "@d11/react-native-fast-image"
import LinearGradient from 'react-native-linear-gradient'

// QvaPay Avatar Component
const QPAvatar = ({ size = 32, source_uri = 'https://qvapay.com/android-chrome-512x512.png', vip = false }) => {

    // Contexts
    const { user } = useAuth()
    const { theme } = useTheme()

    // Debug logging
    console.log('QPAvatar - Props vip:', vip)
    console.log('QPAvatar - User object:', user)
    console.log('QPAvatar - User vip:', user?.vip)
    console.log('QPAvatar - User image:', user?.image)

    // Variables
    const borderVip = size / 25
    const gradientColors = vip ? [theme.colors.danger, theme.colors.primary, theme.colors.success] : ['#ffffff', '#ffffff']
    const profile_picture = user.image ? `https://media.qvapay.com/${user.image}` : source_uri

    return (
        <View style={[styles.container, { backgroundColor: theme.colors.background, width: size, height: size }]}>
            <LinearGradient colors={gradientColors} style={{ padding: borderVip, borderRadius: size }}>
                <FastImage
                    style={{ width: size - (borderVip * 2), height: size - (borderVip * 2), borderRadius: (size - (borderVip * 2)) / 2 }}
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