import { useState } from 'react'
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
import QPSwitch from '../../ui/particles/QPSwitch'
import QPButton from '../../ui/particles/QPButton'
import LnQrCard, { SATS_COLOR } from '../settings/subpanels/lightning/LnQrCard'

// Lightning Address (compartida con Ajustes: misma clave, una petición)
import { selectLightningAddress, useLightningAddressQuery } from '../../hooks/useLightningAddressQuery'
import { ROUTES } from '../../routes'

// Helpers
import { copyTextToClipboard } from '../../helpers'
import QPFitText from '../../ui/particles/QPFitText'
import useMaxBrightness from '../../hooks/useMaxBrightness'

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

	// El QR se escanea mejor a plena luz; se restaura al salir
	useMaxBrightness()

	// Pestaña: enlace de pago de QvaPay o Lightning Address (`name@qvpay.me`).
	// La query está persistida: con la dirección ya activada pinta al instante
	const [segment, setSegment] = useState<'qvapay' | 'lightning'>('qvapay')
	const lnQuery = useLightningAddressQuery()
	const { state: lnState } = selectLightningAddress(lnQuery.data)
	const lnAddress = lnState?.address ?? null
	// Sin `visible` (función apagada para esta cuenta) no se ofrece la pestaña
	const showLightning = lnState ? lnState.visible : false
	const lightning = segment === 'lightning' && showLightning

	// Build QR URL: https://www.qvapay.com/payme/{username}/{amount}
	const identifier = user?.username || user?.uuid || ''
	// `receive_amount` es opcional: sin él, parseFloat(undefined) da NaN y el `|| 0`
	// lo absorbe — el cast conserva ese camino tal cual
	const amount = parseFloat(receive_amount as string) || 0
	const qrUrl = amount > 0 ? `https://www.qvapay.com/payme/${identifier}/${amount}` : `https://www.qvapay.com/payme/${identifier}`

	// Share link (o la Lightning Address, según la pestaña)
	const handleShare = async () => {
		try {
			if (lightning) {
				if (!lnAddress) return
				await Share.share({ message: t('transactions.receive.lnShare', { address: lnAddress.address }) })
				return
			}
			await Share.share({
				message: amount > 0
					? t('transactions.receive.shareWithAmount', { amount, url: qrUrl })
					: t('transactions.receive.share', { url: qrUrl }),
				url: qrUrl,
			})
		} catch (e) { /* user cancelled */ }
	}

	const openLightningSettings = () => navigation.navigate(ROUTES.SETTINGS_STACK, { screen: ROUTES.LIGHTNING_ADDRESS, initial: false })

	return (
		<View style={containerStyles.container}>

			<ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
				{/* Profile + Stats (cover extends behind the floating top bar) */}
				<View style={{ paddingHorizontal: theme.spacing.md }}>
					<ProfileContainer user={user || {}} />
				</View>

				{showLightning && (
					<View style={styles.segment}>
						<QPSwitch
							value={segment === 'lightning' ? 'right' : 'left'}
							leftText={t('transactions.receive.segmentQvapay')}
							rightText={t('transactions.receive.segmentLightning')}
							rightColor={SATS_COLOR}
							onChange={(v) => setSegment(v === 'right' ? 'lightning' : 'qvapay')}
						/>
					</View>
				)}

				{lightning ? (
					lnAddress ? (
						<View style={styles.qrSection}>
							<LnQrCard address={lnAddress} hint={t('transactions.receive.lnTapToCopy')} maxSize={qrSize} />
							{lnAddress.status !== 'active' && (
								<Pressable onPress={openLightningSettings}>
									<Text style={[textStyles.caption, { color: theme.colors.warning, textAlign: 'center', marginTop: 4 }]}>
										{t(lnAddress.status === 'paused' ? 'transactions.receive.lnPaused' : 'transactions.receive.lnBlocked')}
									</Text>
								</Pressable>
							)}
						</View>
					) : (
						<View style={[styles.activateCard, { backgroundColor: theme.colors.surface }, !theme.isDark && { borderWidth: 1, borderColor: theme.colors.border }]}>
							<View style={[styles.activateIcon, { backgroundColor: SATS_COLOR + '1A' }]}>
								<FontAwesome6 name="bolt" size={22} color={SATS_COLOR} iconStyle="solid" />
							</View>
							<Text style={[textStyles.h4, { color: theme.colors.primaryText, textAlign: 'center' }]}>{t('transactions.receive.activateTitle')}</Text>
							<Text style={[textStyles.caption, { color: theme.colors.secondaryText, textAlign: 'center' }]}>{t('transactions.receive.activateText')}</Text>
							<QPButton title={t('transactions.receive.activateButton')} icon="bolt" onPress={openLightningSettings} />
						</View>
					)
				) : (
					<>
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
				</>
			)}
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
	segment: {
		paddingHorizontal: 16,
		marginTop: 12,
		marginBottom: 4,
	},
	activateCard: {
		marginHorizontal: 16,
		marginTop: 12,
		padding: 20,
		borderRadius: 16,
		borderCurve: 'continuous',
		alignItems: 'center',
		gap: 8,
	},
	activateIcon: {
		width: 48,
		height: 48,
		borderRadius: 16,
		borderCurve: 'continuous',
		alignItems: 'center',
		justifyContent: 'center',
		marginBottom: 4,
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
