import { View, Text, Image } from 'react-native'

// Theme Context
import { useTheme } from '../theme/ThemeContext'
import { useTextStyles } from '../theme/themeUtils'

// UI Particles
import QPAvatar from './particles/QPAvatar'

// Profile Container Horizontal Component
const ProfileContainerHorizontal = ({ user = {} }) => {

    // Contexts
    const { theme } = useTheme()
    const textStyles = useTextStyles(theme)

    // Qvapay Logo based on theme
    const qvapayLogo = theme.isDark ? require('../assets/images/ui/qvapay-logo-white.png') : require('../assets/images/ui/logo-qvapay.png')

    return (
        <View style={{ flexDirection: 'row', alignItems: 'center', marginVertical: 10, gap: 15 }}>
            <QPAvatar size={64} user={user} />
            <View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 5 }}>
                    <Text style={[textStyles.h2, { marginVertical: 0, paddingVertical: 0 }]}>{user.name || ''}</Text>
                    {user.kyc && (<Image source={require('../assets/images/ui/blue-badge.png')} style={{ width: 20, height: 20 }} />)}
                    {user.golden_check && (<Image source={require('../assets/images/ui/gold-badge.png')} style={{ width: 20, height: 20 }} />)}
                    {user.role == 'admin' && (<Image source={qvapayLogo} style={{ width: 20, height: 20 }} />)}
                </View>
                <Text style={[textStyles.h3, { color: theme.colors.secondaryText, marginVertical: 0, paddingVertical: 0 }]}>@{user.username}</Text>
            </View>
        </View>
    )
}

export default ProfileContainerHorizontal
