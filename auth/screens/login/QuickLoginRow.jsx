import { View, Pressable, ActivityIndicator, StyleSheet } from 'react-native'

import FontAwesome6 from '@react-native-vector-icons/fontawesome6'
import FaceIDIcon from '../../../ui/particles/FaceIDIcon'

// Biometric + passkey quick-login buttons shown on the credentials screen.
const QuickLoginRow = ({ hasBiometrics, biometryType, isLoading, onBiometricLogin, onPasskeyLogin, theme }) => (
	<View style={styles.row}>
		{hasBiometrics && biometryType && (
			<Pressable
				onPress={onBiometricLogin}
				disabled={isLoading}
				style={({ pressed }) => [
					styles.button,
					{ backgroundColor: theme.colors.surface, opacity: pressed ? 0.7 : isLoading ? 0.5 : 1 }
				]}
			>
				{isLoading ? (
					<ActivityIndicator size="small" color={theme.colors.primary} />
				) : biometryType === 'FaceID' ? (
					<FaceIDIcon size={30} color={theme.colors.primary} />
				) : (
					<FontAwesome6 name="fingerprint" size={28} color={theme.colors.primary} iconStyle="solid" />
				)}
			</Pressable>
		)}
		<Pressable
			onPress={onPasskeyLogin}
			disabled={isLoading}
			style={({ pressed }) => [
				styles.button,
				{ backgroundColor: theme.colors.surface, opacity: pressed ? 0.7 : isLoading ? 0.5 : 1 }
			]}
		>
			<FontAwesome6 name="key" size={24} color={theme.colors.primary} iconStyle="solid" />
		</Pressable>
	</View>
)

const styles = StyleSheet.create({
	row: {
		flexDirection: 'row',
		justifyContent: 'center',
		gap: 16,
	},
	button: {
		width: 56,
		height: 56,
		borderRadius: 28,
		alignItems: 'center',
		justifyContent: 'center',
	},
})

export default QuickLoginRow
