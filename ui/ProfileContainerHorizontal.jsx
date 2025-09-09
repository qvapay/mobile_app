import { View, Text, Image } from 'react-native'

// Theme Context
import { useTheme } from '../theme/ThemeContext'
import { useTextStyles } from '../theme/themeUtils'

// UI Particles
import QPAvatar from './particles/QPAvatar'

// Icons
import FontAwesome6 from '@react-native-vector-icons/fontawesome6'

// Profile Container Horizontal Component
const ProfileContainerHorizontal = ({ user = {}, size = 64, showUsername = true }) => {

    // Contexts
    const { theme } = useTheme()
    const textStyles = useTextStyles(theme)

    // Qvapay Logo based on theme
    const qvapayLogo = theme.isDark ? require('../assets/images/ui/qvapay-logo-white.png') : require('../assets/images/ui/logo-qvapay.png')

    return (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <QPAvatar size={size} user={user} />
            <View style={{  }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                    <Text style={textStyles.h4}>{user.name || ''}</Text>
                    {user.kyc && (<Image source={require('../assets/images/ui/blue-badge.png')} style={{ width: 20, height: 20 }} />)}
                    {user.golden_check && (<Image source={require('../assets/images/ui/gold-badge.png')} style={{ width: 20, height: 20 }} />)}
                    {user.role == 'admin' && (<Image source={qvapayLogo} style={{ width: 20, height: 20 }} />)}
                </View>
                {showUsername && (<Text style={[textStyles.h5, { color: theme.colors.secondaryText }]}>@{user.username}</Text>)}
                {!showUsername && (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                        {user.phone_verified && (<FontAwesome6 name="phone" size={theme.typography.fontSize.sm} color={theme.colors.secondaryText} iconStyle="solid" />)}
                        {user.telegram_verified && (<FontAwesome6 name="telegram" size={theme.typography.fontSize.sm} color={theme.colors.secondaryText} iconStyle="brand" />)}
                        {user.twitter_verified && (<FontAwesome6 name="x-twitter" size={theme.typography.fontSize.sm} color={theme.colors.secondaryText} iconStyle="solid" />)}
                        {user._count?.P2P && (<Text style={[textStyles.h6, { color: theme.colors.secondaryText }]}>{user._count?.P2P}</Text>)}
                        {user._count?.P2P_Peer && (<Text style={[textStyles.h6, { color: theme.colors.secondaryText }]}>{user._count?.P2P_Peer}</Text>)}
                        {user.rating && (<Text style={[textStyles.h6, { color: theme.colors.secondaryText }]}>{user.rating}</Text>)}
                        {user.operations && (<Text style={[textStyles.h6, { color: theme.colors.secondaryText }]}>{user.operations}</Text>)}
                    </View>
                )}
            </View>
        </View>
    )
}

export default ProfileContainerHorizontal
