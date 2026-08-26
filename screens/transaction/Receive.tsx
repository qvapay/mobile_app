import { View, Text, StyleSheet, Share, ScrollView, Pressable, useWindowDimensions } from 'react-native'
import { useTranslation } from 'react-i18next'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'

// QR Code
import QRCodeStyled from 'react-native-qrcode-styled'
import type { ComponentProps, ComponentType } from 'react'

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
import QPFitText from '../../ui/particles/QPFitText'

// Tipos
import type { RootStackParamList } from '../../types/navigation'

/**
 * Dos huecos de tipos de `react-native-qrcode-styled`, ambos resueltos aquí sin
 * tocar el runtime:
 * - la variante SVG hace `Omit<PieceOptions, 'pieceSize'>` (deriva el tamaño de
 *   pieza de `size`), así que el `pieceSize` de esta pantalla se ignora;
 * - sus `QRCodeOptions` vienen de `qrcode`, que no trae tipos ni tiene
 *   `@types/qrcode` instalado, así que `errorCorrectionLevel` no es visible;
 * - `backgroundColor` solo existe en la variante canvas (aquí el fondo blanco
 *   lo pinta el `style` de la tarjeta).
 */
const QRCode = QRCodeStyled as ComponentType<ComponentProps<typeof QRCodeStyled> & { pieceSize?: number, errorCorrectionLevel?: string, backgroundColor?: string }>

type Props = NativeStackScreenProps<RootStackParamList, 'Receive'>

const Receive = ({ navigation, route }: Props) => {

	const { receive_amount } = route.params || {}
	const { t } = useTranslation()
	const { user } = useAuth()
	const { theme } = useTheme()
	const { width: screenWidth } = useWindowDimensions()
	const qrSize = Math.min(screenWidth - 80, 240)
	const textStyles = useTextStyles(theme)
	const containerStyles = useContainerStyles(theme)

	// Build QR URL: https://www.qvapay.com/payme/{username}/{amount}
	const identifier = user?.username || user?.uuid || ''
	// `receive_amount` es opcional: sin él, parseFloat(undefined) da NaN y el `|| 0`
	// lo absorbe — el cast conserva ese camino tal cual
	const amount = parseFloat(receive_amount as string) || 0
	const qrUrl = amount > 0 ? `https://www.qvapay.com/payme/${identifier}/${amount}` : `https://www.qvapay.com/payme/${identifier}`

	// Share link
	const handleShare = async () => {
		try {
			await Share.share({
				message: amount > 0
					? t('transactions.receive.shareWithAmount', { amount, url: qrUrl })
					: t('transactions.receive.share', { url: qrUrl }),
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
						<QPFitText style={[textStyles.amount, { color: theme.colors.successText, fontSize: theme.typography.fontSize.display }]}>
							${amount.toFixed(2)}
						</QPFitText>
					</View>
				)}

				{/* QR Code — tap to copy link */}
				<View style={styles.qrSection}>
					<Pressable onPress={() => copyTextToClipboard(qrUrl)} style={({ pressed }) => [styles.qrCard, { opacity: pressed ? 0.85 : 1 }]}>
						<QRCode
							data={qrUrl}
							style={styles.qrInner}
							size={qrSize}
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
						{t('transactions.receive.tapToCopy')}
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
		// Squircle proporcional (mismo lenguaje que QPButton)
		borderRadius: 12,
		borderCurve: 'continuous',
		justifyContent: 'center',
		alignItems: 'center',
		borderWidth: 1,
	},
})

export default Receive
