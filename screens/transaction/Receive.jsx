import { View, Text, StyleSheet, Share, ScrollView } from 'react-native'

// QR Code
import QRCodeStyled from 'react-native-qrcode-styled'

// Theme Context
import { useTheme } from '../../theme/ThemeContext'
import { useContainerStyles, useTextStyles } from '../../theme/themeUtils'

// Auth Context
import { useAuth } from '../../auth/AuthContext'

// UI
import QPButton from '../../ui/particles/QPButton'
import ProfileContainer from '../../ui/ProfileContainer'

// Helpers
import { copyTextToClipboard } from '../../helpers'

const Receive = ({ route }) => {

	const { receive_amount } = route.params || {}
	const { user } = useAuth()
	const { theme } = useTheme()
	const textStyles = useTextStyles(theme)
	const containerStyles = useContainerStyles(theme)

	// Build QR URL: https://www.qvapay.com/payme/{username}/{amount}
	const identifier = user?.username || user?.uuid || ''
	const amount = parseFloat(receive_amount) || 0
	const qrUrl = amount > 0
		? `https://www.qvapay.com/payme/${identifier}/${amount}`
		: `https://www.qvapay.com/payme/${identifier}`

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
		<View style={containerStyles.subContainer}>
			<ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>

				{/* Profile */}
				<ProfileContainer user={user || {}} />

				{/* Amount */}
				{amount > 0 && (
					<View style={styles.amountSection}>
						<Text style={[textStyles.amount, { color: theme.colors.successText, fontSize: 48 }]}>
							${amount.toFixed(2)}
						</Text>
					</View>
				)}

				{/* QR Code */}
				<View style={styles.qrSection}>
					<View style={[styles.qrCard, { backgroundColor: theme.colors.surface }]}>
						<QRCodeStyled
							data={qrUrl}
							style={[styles.svg, { backgroundColor: '#FFFFFF' }]}
							size={280}
							padding={12}
							pieceSize={8}
							isPiecesGlued
							pieceBorderRadius={2}
							pieceCornerType={'cut'}
							errorCorrectionLevel={'H'}
							preserveAspectRatio="none"
							backgroundColor={'#FFFFFF'}
							color={'#000000'}
							outerEyesOptions={{
								borderRadius: 2,
								color: theme.colors.primary,
							}}
						/>
					</View>
					<Text style={[textStyles.caption, { color: theme.colors.tertiaryText, textAlign: 'center', marginTop: 12 }]}>
						Escanea este QR para enviar el pago
					</Text>
				</View>

				{/* Action Buttons */}
				<View style={styles.actions}>
					<QPButton
						title="Compartir"
						icon="share-nodes"
						iconColor="white"
						onPress={handleShare}
						style={{ backgroundColor: theme.colors.primary }}
						textStyle={{ color: theme.colors.almostWhite }}
						iconStyle="solid"
					/>
					<QPButton
						title="Copiar enlace"
						icon="copy"
						iconColor={theme.colors.contrast}
						onPress={() => copyTextToClipboard(qrUrl)}
						style={{ backgroundColor: theme.colors.elevation, marginTop: 10 }}
						textStyle={{ color: theme.colors.contrast }}
						iconStyle="solid"
					/>
				</View>

			</ScrollView>
		</View>
	)
}

const styles = StyleSheet.create({
	scrollContent: {
		paddingBottom: 40,
	},
	amountSection: {
		alignItems: 'center',
		marginBottom: 8,
	},
	qrSection: {
		alignItems: 'center',
		marginTop: 10,
	},
	qrCard: {
		padding: 16,
		borderRadius: 20,
		alignItems: 'center',
	},
	svg: {
		borderRadius: 12,
		overflow: 'hidden',
	},
	actions: {
		marginTop: 24,
		paddingHorizontal: 16,
	},
})

export default Receive
