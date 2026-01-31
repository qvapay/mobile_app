import { View, Text, Image } from 'react-native'
import { memo, useMemo } from 'react'

// Theme Context
import { useTheme } from '../theme/ThemeContext'
import { useTextStyles } from '../theme/themeUtils'

// UI Particles
import QPAvatar from './particles/QPAvatar'

// Icons
import FontAwesome6 from '@react-native-vector-icons/fontawesome6'

// Profile Container Horizontal Component
const ProfileContainerHorizontal = ({ user = {}, size = 56, showUsername = true }) => {

	// Contexts
	const { theme } = useTheme()
	const textStyles = useTextStyles(theme)
	const qvapayLogo = theme.isDark ? require('../assets/images/ui/qvapay-logo-white.png') : require('../assets/images/ui/logo-qvapay.png')
	const p2pCount = user?._count?.P2P ?? 0
	const p2pPeerCount = user?._count?.P2P_Peer ?? 0
	const operations = useMemo(() => p2pCount + p2pPeerCount, [p2pCount, p2pPeerCount])

	return (
		<View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
			<QPAvatar size={size} user={user} />
			<View>
				<View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
					<Text style={textStyles.h5}>{user.name || ''}</Text>
					{user.kyc && (<Image source={require('../assets/images/ui/blue-badge.png')} style={{ width: 16, height: 16 }} />)}
					{user.golden_check && (<Image source={require('../assets/images/ui/gold-badge.png')} style={{ width: 16, height: 16 }} />)}
					{user.role == 'admin' && (<Image source={qvapayLogo} style={{ width: 16, height: 16 }} />)}
				</View>
				{showUsername && (<Text style={[textStyles.h6, { color: theme.colors.secondaryText }]}>@{user.username}</Text>)}
				{!showUsername && (
					<View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
						{user.phone_verified && (<FontAwesome6 name="phone" size={theme.typography.fontSize.xs} color={theme.colors.secondaryText} iconStyle="solid" />)}
						{user.telegram_verified && (<FontAwesome6 name="telegram" size={theme.typography.fontSize.xs} color={theme.colors.secondaryText} iconStyle="brand" />)}
						{user.twitter_verified && (<FontAwesome6 name="x-twitter" size={theme.typography.fontSize.xs} color={theme.colors.secondaryText} iconStyle="solid" />)}
						{!!operations && (
							<View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
								<FontAwesome6 name="repeat" size={theme.typography.fontSize.xs} color={theme.colors.secondaryText} iconStyle="solid" />
								<Text style={[textStyles.h7, { color: theme.colors.secondaryText }]}>{operations}</Text>
							</View>
						)}
						{!!user.rating_avg && (
							<View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
								<FontAwesome6 name="star" size={theme.typography.fontSize.xs} color={theme.colors.secondaryText} iconStyle="solid" />
								<Text style={[textStyles.h7, { color: theme.colors.secondaryText }]}>{user.rating_avg}</Text>
							</View>
						)}
						{!!user.operations && (<Text style={[textStyles.h6, { color: theme.colors.secondaryText }]}>{user.operations}</Text>)}
					</View>
				)}
			</View>
		</View>
	)
}

export default memo(ProfileContainerHorizontal)
