import { Pressable, StyleSheet, Text, View } from 'react-native'
import FontAwesome6 from '@react-native-vector-icons/fontawesome6'
import { useTheme } from '../../../theme/ThemeContext'
import usePushPrompt from '../../../hooks/usePushPrompt'

const HomePushBannerSection = () => {
	const { theme } = useTheme()
	const { shouldShowBanner, enablePush, dismissBanner } = usePushPrompt()

	if (!shouldShowBanner) return null

	return (
		<View style={[styles.pushBanner, { backgroundColor: theme.colors.surface }, theme.mode === 'light' && { borderWidth: 1, borderColor: theme.colors.border }]}>
			<View style={[styles.pushBannerIcon, { backgroundColor: theme.colors.primary + '20' }]}>
				<FontAwesome6 name="bell" size={16} color={theme.colors.primary} iconStyle="solid" />
			</View>
			<View style={{ flex: 1 }}>
				<Text style={[styles.pushBannerText, { color: theme.colors.primaryText, fontSize: theme.typography.fontSize.sm, fontFamily: theme.typography.fontFamily.regular }]}>Recibe alertas de tus pagos al instante</Text>
			</View>
			<Pressable
				onPress={() => { enablePush(); dismissBanner() }}
				style={[styles.pushBannerButton, { backgroundColor: theme.colors.primary }]}
			>
				<Text style={[styles.pushBannerButtonText, { color: theme.colors.almostWhite, fontSize: theme.typography.fontSize.sm, fontFamily: theme.typography.fontFamily.medium }]}>Activar</Text>
			</Pressable>
			<Pressable onPress={dismissBanner} hitSlop={8}>
				<FontAwesome6 name="xmark" size={14} color={theme.colors.tertiaryText} iconStyle="solid" />
			</Pressable>
		</View>
	)
}

const styles = StyleSheet.create({
	pushBanner: {
		flexDirection: 'row',
		alignItems: 'center',
		borderRadius: 12,
		padding: 12,
		marginVertical: 10,
		gap: 10,
	},
	pushBannerIcon: {
		width: 36,
		height: 36,
		borderRadius: 18,
		justifyContent: 'center',
		alignItems: 'center',
	},
	pushBannerText: {},
	pushBannerButton: {
		borderRadius: 8,
		paddingHorizontal: 12,
		paddingVertical: 6,
	},
	pushBannerButtonText: {},
})

export default HomePushBannerSection

