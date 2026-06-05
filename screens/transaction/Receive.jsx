import { View, Text, StyleSheet, Share, ScrollView, Pressable, Dimensions } from 'react-native'

// QR Code
import QRCodeStyled from 'react-native-qrcode-styled'

// Theme Context
import { useTheme } from '../../theme/ThemeContext'
import { useContainerStyles, useTextStyles } from '../../theme/themeUtils'

// Auth Context
import { useAuth } from '../../auth/AuthContext'

// Icons
import FontAwesome6 from '@react-native-vector-icons/fontawesome6'

// UI
import ProfileContainer from '../../ui/ProfileContainer'

// Helpers
import { copyTextToClipboard } from '../../helpers'

const { width: screenWidth } = Dimensions.get('window')
const QR_SIZE = Math.min(screenWidth - 80, 240)

const Receive = ({ navigation, route }) => {

	const { receive_amount } = route.params || {}
	const { user } = useAuth()
	const { theme } = useTheme()
	const textStyles = useTextStyles(theme)
	const containerStyles = useContainerStyles(theme)

	// Build QR URL: https://www.qvapay.com/payme/{username}/{amount}
	const identifier = user?.username || user?.uuid || ''
	const amount = parseFloat(receive_amount) || 0
	const qrUrl = amount > 0 ? `https://www.qvapay.com/payme/${identifier}/${amount}` : `https://www.qvapay.com/payme/${identifier}`

	// Share link
	const handleShare = async () => {
		try {
			await Share.share({
				message: amount > 0
					? `Págame $${amount} en QvaPay: ${qrUrl}`
					: `Págame en QvaPay: ${qrUrl}`,
				url: qrUrl,
			})
		} catch (e) { /* user cancelled */ }
	}

	return (
		<View style={containerStyles.container}>

			<ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
				{/* Profile + Stats (cover extends behind the floating top bar) */}
				<View style={{ paddingHorizontal: theme.spacing.md }}>
					<ProfileContainer user={user || {}} />
				</View>

				{/* Amount */}
				{amount > 0 && (
					<View style={styles.amountSection}>
						<Text style={[textStyles.amount, { color: theme.colors.successText, fontSize: theme.typography.fontSize.display }]}>
							${amount.toFixed(2)}
						</Text>
					</View>
				)}

				{/* QR Code — tap to copy link */}
				<View style={styles.qrSection}>
					<Pressable onPress={() => copyTextToClipboard(qrUrl)} style={({ pressed }) => [styles.qrCard, { opacity: pressed ? 0.85 : 1 }]}>
						<QRCodeStyled
							data={qrUrl}
							style={styles.qrInner}
							size={QR_SIZE}
							padding={8}
							pieceSize={7}
							isPiecesGlued
							pieceBorderRadius={2}
							pieceCornerType={'cut'}
							errorCorrectionLevel={'H'}
							backgroundColor={'#FFFFFF'}
							color={'#000000'}
							outerEyesOptions={{
								borderRadius: 2,
								color: theme.colors.primary,
							}}
						/>
					</Pressable>
					<Text style={[textStyles.caption, { color: theme.colors.tertiaryText, textAlign: 'center', marginTop: 12 }]}>
						Toca el QR para copiar el enlace
					</Text>
				</View>
			</ScrollView>

			{/* Floating top bar — back + share, sit over the cover (like the Scan screen) */}
			<View style={styles.topControls}>
				<Pressable
					onPress={() => navigation.goBack()}
					style={[styles.topButton, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}
					hitSlop={10}
				>
					<FontAwesome6 name="arrow-left" size={20} color={theme.colors.primaryText} iconStyle="solid" />
				</Pressable>
				<Pressable
					onPress={handleShare}
					style={[styles.topButton, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}
					hitSlop={10}
				>
					<FontAwesome6 name="share-nodes" size={20} color={theme.colors.primaryText} iconStyle="solid" />
				</Pressable>
			</View>
		</View>
	)
}

const styles = StyleSheet.create({
	scrollContent: {
		paddingBottom: 40,
	},
	amountSection: {
		alignItems: 'center',
		marginTop: 8,
		marginBottom: 8,
	},
	qrSection: {
		alignItems: 'center',
		marginTop: 10,
	},
	qrCard: {
		borderRadius: 16,
		padding: 10,
		overflow: 'hidden',
		backgroundColor: '#FFFFFF',
	},
	qrInner: {
		backgroundColor: '#FFFFFF',
	},
	topControls: {
		position: 'absolute',
		top: 60,
		left: 16,
		right: 16,
		flexDirection: 'row',
		justifyContent: 'space-between',
		alignItems: 'center',
	},
	topButton: {
		width: 40,
		height: 40,
		borderRadius: 20,
		justifyContent: 'center',
		alignItems: 'center',
		borderWidth: 1,
	},
})

export default Receive
