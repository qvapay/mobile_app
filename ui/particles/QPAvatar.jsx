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
	const image = user?.image || ''

	// Variables
	const borderVip = size / 25
	const gradientColors = vip ? [theme.colors.danger, theme.colors.primary, theme.colors.success] : ['#ffffff', '#ffffff']
	const profile_picture = image ? `https://media.qvapay.com/${image}` : 'https://qvapay.com/android-chrome-512x512.png'
	const hasImage = !!image

	return (
		<View style={[styles.container, { width: size, height: size, borderRadius: size / 2 }]}>
			{vip && (<LinearGradient colors={gradientColors} style={[styles.gradientBorder, { width: size, height: size, borderRadius: size / 2 }]} />)}
			<View style={[styles.avatarContainer, { width: size - (borderVip * 2), height: size - (borderVip * 2), top: borderVip, left: borderVip }]}>
				<FastImage style={{ width: '100%', height: '100%', borderRadius: (size - (borderVip * 2)) / 2, backgroundColor: vip && !hasImage ? '#ffffff' : 'transparent' }}
					source={{ uri: profile_picture, priority: FastImage.priority.normal }} resizeMode={FastImage.resizeMode.cover}
				/>
			</View>
		</View>
	)
}

const styles = StyleSheet.create({
	container: {
		position: 'relative',
		overflow: 'hidden',
	},
	gradientBorder: {
		position: 'absolute',
		top: 0,
		left: 0,
	},
	avatarContainer: {
		position: 'absolute',
		borderRadius: 50,
		overflow: 'hidden',
	}
})

export default QPAvatar