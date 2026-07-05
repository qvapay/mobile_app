import { View, Text, StyleSheet } from 'react-native'
import FastImage from '@d11/react-native-fast-image'

import { useTheme } from '../../theme/ThemeContext'
import { mediaUrl } from '../../helpers/mediaUrl'

const SIZES = { sm: 32, md: 44, lg: 64 }

const OperatorAvatar = ({ brand = '', logoUrl = null, size = 'md', bgColor = null }) => {

	const { theme } = useTheme()
	const dim = SIZES[size] || SIZES.md
	const initial = (brand?.[0] || '?').toUpperCase()
	const uri = mediaUrl(logoUrl)

	return (
		<View
			style={[
				styles.wrap,
				{
					width: dim,
					height: dim,
					borderRadius: dim / 4,
					backgroundColor: bgColor || theme.colors.elevationLight,
				},
			]}
		>
			{uri ? (
				<FastImage
					source={{ uri, priority: FastImage.priority.normal, cache: FastImage.cacheControl.immutable }}
					style={{ width: '100%', height: '100%' }}
					resizeMode={FastImage.resizeMode.contain}
				/>
			) : (
				<Text style={{ color: theme.colors.primaryText, fontSize: dim * 0.4, fontWeight: '600' }}>{initial}</Text>
			)}
		</View>
	)
}

const styles = StyleSheet.create({
	wrap: {
		justifyContent: 'center',
		alignItems: 'center',
		overflow: 'hidden',
	},
})

export default OperatorAvatar
