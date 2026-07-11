import { useCallback, useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import LottieView from 'lottie-react-native'
import ReactNativeHapticFeedback from 'react-native-haptic-feedback'

// Icons
import FontAwesome6 from '@react-native-vector-icons/fontawesome6'

// Contexts
import { useTheme } from '../../theme/ThemeContext'
import { useTextStyles } from '../../theme/themeUtils'
import { useAuth } from '../../auth/AuthContext'

// UI
import QPPressable from '../../ui/particles/QPPressable'
import QPAvatar from '../../ui/particles/QPAvatar'
import QPButton from '../../ui/particles/QPButton'

// Nearby
import { useNearbyPeers } from '../../nearby/useNearbyPeers'
import { buildPaymeUrl } from '../../nearby/protocol'
import { layoutPeers } from '../../nearby/radarLayout'

// API + helpers
import { userApi } from '../../api/userApi'
import { parseQRData } from '../../helpers'

// Screen components
import RadarWaves from './RadarWaves'
import PeerBubble from './PeerBubble'
import ChargeSheet from './ChargeSheet'
import NearbyPermissionGate from './NearbyPermissionGate'

// Routes
import { ROUTES } from '../../routes'

const SELF_AVATAR_SIZE = 96
const HAPTIC_OPTS = { enableVibrateFallback: true, ignoreAndroidSystemSettings: false }

/**
 * NearbyPay — AirDrop-style radar to pay QvaPay users around you.
 *
 * The proximity channel only carries a payment suggestion: tapping a peer
 * builds the SAME payme URL the Receive QR encodes and routes it through
 * parseQRData, reusing the Send/SendConfirm/PIN flow untouched. Identity on
 * screen is always the server-verified profile, never the announce.
 *
 * Route params:
 * - prefill_amount: amount typed in the Keypad before opening the radar —
 *   used to prefill charge mode and direct payments to browsing peers.
 */
const NearbyPay = ({ navigation, route }) => {

	const { prefill_amount } = route.params || {}
	const { theme } = useTheme()
	const textStyles = useTextStyles(theme)
	const { user, updateUser } = useAuth()
	const insets = useSafeAreaInsets()

	const [radarSize, setRadarSize] = useState({ width: 0, height: 0 })
	const [showChargeSheet, setShowChargeSheet] = useState(false)
	// null | { amount, confirmed }
	const [receivedOverlay, setReceivedOverlay] = useState(null)

	/**
	 * A payer acked their transfer. UNTRUSTED — show "Confirmando…" and only
	 * flip to confirmed once /user/extended returns the fresh balance.
	 */
	const handlePaymentReceived = useCallback(async (msg) => {
		setReceivedOverlay({ amount: msg.amount, confirmed: false })
		const result = await userApi.getUserProfile()
		if (result.success && result.data) {
			await updateUser(result.data)
			setReceivedOverlay({ amount: msg.amount, confirmed: true })
		}
	}, [updateUser])

	const { state, peers, pendingCount, chargeMode, startCharging, stopCharging } = useNearbyPeers({
		enabled: true,
		user,
		onPaymentReceived: handlePaymentReceived,
	})

	/** Tap on a verified peer → same routing branches as a scanned QR. */
	const handlePeerPress = (peer) => {
		ReactNativeHapticFeedback.trigger('impactMedium', HAPTIC_OPTS)

		const amount = peer.mode === 'charge' && peer.amount
			? peer.amount
			: (parseFloat(prefill_amount) > 0 ? prefill_amount : null)

		const parsed = parseQRData(buildPaymeUrl(peer.uuid, amount))
		if (!parsed) { return }

		if (parsed.amount) {
			navigation.navigate(ROUTES.SEND_CONFIRM, { user_uuid: parsed.uuid, send_amount: parsed.amount })
		} else {
			navigation.navigate(ROUTES.SEND, { user_uuid: parsed.uuid })
		}
	}

	const handleConfirmCharge = (amount) => {
		setShowChargeSheet(false)
		startCharging(amount)
	}

	const blocked = state === 'permission_denied' || state === 'unavailable' || state === 'error'
	const positions = radarSize.width > 0 ? layoutPeers(peers, { width: radarSize.width, height: radarSize.height }) : []

	return (
		<View style={[styles.container, { backgroundColor: theme.colors.background, paddingTop: insets.top }]}>

			{/* Header */}
			<View style={styles.header}>
				<QPPressable variant="opacity" onPress={() => navigation.goBack()} style={styles.closeButton}>
					<FontAwesome6 name="xmark" size={20} color={theme.colors.primaryText} iconStyle="solid" />
				</QPPressable>
				<Text style={[textStyles.h4, { color: theme.colors.primaryText }]}>Pagar cerca</Text>
				<View style={styles.closeButton} />
			</View>

			{blocked ? (
				<NearbyPermissionGate state={state} />
			) : (
				<>
					{/* Radar */}
					<View
						style={styles.radar}
						onLayout={({ nativeEvent }) => setRadarSize({ width: nativeEvent.layout.width, height: nativeEvent.layout.height })}
					>
						{/* Self avatar + waves, centered */}
						<View style={styles.center} pointerEvents="none">
							<RadarWaves size={SELF_AVATAR_SIZE + 24} />
							<QPAvatar user={user} size={SELF_AVATAR_SIZE} />
						</View>

						{/* Peers */}
						{peers.map((peer) => {
							const position = positions.find(p => p.uuid === peer.uuid)
							if (!position) { return null }
							return <PeerBubble key={peer.uuid} peer={peer} position={position} onPress={handlePeerPress} />
						})}
					</View>

					{/* Status line */}
					<Text style={[textStyles.body, { color: theme.colors.secondaryText, textAlign: 'center' }]}>
						{peers.length === 0
							? (pendingCount > 0 ? 'Verificando usuarios…' : 'Buscando usuarios cerca…')
							: `${peers.length} ${peers.length === 1 ? 'persona cerca' : 'personas cerca'}`}
					</Text>

					{/* Charge mode: banner or CTA */}
					<View style={[styles.footer, { paddingBottom: insets.bottom + 16 }]}>
						{chargeMode.active ? (
							<View style={[styles.chargeBanner, { backgroundColor: theme.colors.surface }, theme.mode === 'light' && { borderWidth: 1, borderColor: theme.colors.border }]}>
								<FontAwesome6 name="bolt" size={16} color={theme.colors.primary} iconStyle="solid" />
								<Text style={[textStyles.body, { color: theme.colors.primaryText, flex: 1, marginLeft: 10, fontFamily: theme.typography.fontFamily.medium }]}>
									Cobrando ${chargeMode.amount}
								</Text>
								<QPPressable variant="opacity" onPress={stopCharging}>
									<Text style={[textStyles.body, { color: theme.colors.danger }]}>Cancelar</Text>
								</QPPressable>
							</View>
						) : (
							<QPButton
								title="Cobrar cerca"
								onPress={() => setShowChargeSheet(true)}
								icon="bolt"
								iconStyle="solid"
							/>
						)}
					</View>
				</>
			)}

			{/* Charge amount sheet (internal overlay — the screen never blurs) */}
			{showChargeSheet && (
				<ChargeSheet
					initialAmount={parseFloat(prefill_amount) > 0 ? prefill_amount : ''}
					balance={user?.balance}
					onConfirm={handleConfirmCharge}
					onClose={() => setShowChargeSheet(false)}
				/>
			)}

			{/* Payment received overlay */}
			{receivedOverlay && (
				<Animated.View entering={FadeIn} exiting={FadeOut} style={[styles.receivedOverlay, { backgroundColor: theme.colors.background }]}>
					<LottieView source={require('../../assets/lotties/completed.json')} autoPlay loop={false} style={styles.lottie} />
					<Text style={[textStyles.h2, { color: theme.colors.primaryText, marginTop: 12 }]}>
						+${receivedOverlay.amount}
					</Text>
					<Text style={[textStyles.body, { color: receivedOverlay.confirmed ? theme.colors.success : theme.colors.secondaryText, marginTop: 6 }]}>
						{receivedOverlay.confirmed ? 'Pago confirmado' : 'Confirmando…'}
					</Text>
					<QPButton
						title="Listo"
						onPress={() => setReceivedOverlay(null)}
						style={styles.receivedButton}
					/>
				</Animated.View>
			)}
		</View>
	)
}

const styles = StyleSheet.create({
	container: {
		flex: 1,
	},
	header: {
		flexDirection: 'row',
		alignItems: 'center',
		justifyContent: 'space-between',
		paddingHorizontal: 16,
		paddingVertical: 12,
	},
	closeButton: {
		width: 36,
		height: 36,
		alignItems: 'center',
		justifyContent: 'center',
	},
	radar: {
		flex: 1,
		overflow: 'hidden',
	},
	center: {
		...StyleSheet.absoluteFillObject,
		alignItems: 'center',
		justifyContent: 'center',
	},
	footer: {
		paddingHorizontal: 20,
		paddingTop: 16,
	},
	chargeBanner: {
		flexDirection: 'row',
		alignItems: 'center',
		borderRadius: 16,
		paddingHorizontal: 16,
		paddingVertical: 14,
	},
	receivedOverlay: {
		...StyleSheet.absoluteFillObject,
		alignItems: 'center',
		justifyContent: 'center',
		paddingHorizontal: 40,
	},
	lottie: {
		width: 140,
		height: 140,
	},
	receivedButton: {
		marginTop: 32,
		alignSelf: 'stretch',
	},
})

export default NearbyPay
