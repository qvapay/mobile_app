import { View, Text, Image } from 'react-native'

// Theme Context
import { useTheme } from '../theme/ThemeContext'
import { useContainerStyles, useTextStyles } from '../theme/themeUtils'

// UI Particles
import QPAvatar from './particles/QPAvatar'

// Profile Container Component
const ProfileContainer = ({ user }) => {

    // Contexts
    const { theme } = useTheme()
    // const containerStyles = useContainerStyles(theme)
    const textStyles = useTextStyles(theme)

    // Qvapay Logo based on theme
    const qvapayLogo = theme.isDark ? require('../assets/images/ui/qvapay-logo-white.png') : require('../assets/images/ui/logo-qvapay.png')

    return (
        <View style={{ alignItems: 'center', marginVertical: 20 }}>
            <QPAvatar size={120} user={user} />
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 15 }}>
                <Text style={[textStyles.h1, { marginVertical: 0, paddingVertical: 0 }]}>{user.name} {user.lastname}</Text>
                {user.kyc && (<Image source={require('../assets/images/ui/blue-badge.png')} style={{ width: 20, height: 20 }} />)}
                {user.golden_check && (<Image source={require('../assets/images/ui/gold-badge.png')} style={{ width: 20, height: 20 }} />)}
                {user.role == 'admin' && (<Image source={qvapayLogo} style={{ width: 20, height: 20 }} />)}
            </View>
            <Text style={[textStyles.h2, { color: theme.colors.secondaryText, marginVertical: 0, paddingVertical: 0 }]}>@{user.username}</Text>
        </View>
    )
}

export default ProfileContainer