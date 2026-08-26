import { StyleSheet, Text, View } from 'react-native'
import Animated, { ZoomIn, ZoomOut } from 'react-native-reanimated'

// Icons
import FontAwesome6 from '@react-native-vector-icons/fontawesome6'

// Theme Context
import { useTheme } from '../../theme/ThemeContext'

// UI
import QPPressable from '../../ui/particles/QPPressable'
import QPAvatar from '../../ui/particles/QPAvatar'

// Helpers
import { displayName } from '../../helpers/displayName'

// Nearby
import type { NearbyPeer } from '../../nearby/peersReducer'
import type { RadarPosition } from '../../nearby/radarLayout'

export const BUBBLE_SIZE = 76

/**
 * Forma del perfil verificado que la burbuja lee. `peer.server` viaja como
 * `Record<string, unknown>` (payload crudo de `/user/search`), así que se
 * estrecha localmente a los campos que se pintan.
 */
type PeerProfile = {
	username?: string | null
	name?: string | null
	image?: string | null
	vip?: boolean | number | null
	golden_check?: boolean | number | null
}

type PeerBubbleProps = {
	peer: NearbyPeer
	position: RadarPosition
	onPress: (peer: NearbyPeer) => void
}

/**
 * A nearby user floating on the radar. Renders ONLY the server-verified
 * profile (peer.server) — never the self-reported announce. Shows a charge
 * chip when the peer is asking for a specific amount.
 *
 * Positioned absolutely by the parent from radarLayout; QPPressable is the
 * app's Fabric-safe pressable (never wrap Pressable in Animated).
 *
 * @param props
 * @param props.peer - Peer entry from useNearbyPeers (verified).
 * @param props.position - Bubble center.
 * @param props.onPress
 */
const PeerBubble = ({ peer, position, onPress }: PeerBubbleProps) => {

	const { theme } = useTheme()
	// El padre solo monta burbujas de peers verificados, así que `server` no es
	// null aquí (el tipo del reducer sí lo admite mientras se resuelve)
	const profile = peer.server as PeerProfile
	const isCharging = peer.mode === 'charge' && peer.amount

	return (
		<Animated.View
			entering={ZoomIn.springify().damping(14)}
			exiting={ZoomOut.duration(200)}
			style={[styles.container, { left: position.x - BUBBLE_SIZE / 2, top: position.y - BUBBLE_SIZE / 2 }]}
		>
			<QPPressable onPress={() => onPress(peer)} style={styles.pressable}>
				<QPAvatar user={profile} size={56} />

				<View style={styles.nameRow}>
					<Text
						numberOfLines={1}
						style={[styles.name, { color: theme.colors.primaryText, fontFamily: theme.typography.fontFamily.medium }]}
					>
						{displayName(profile) || profile.username}
					</Text>
					{!!profile.golden_check && (
						<FontAwesome6 name="circle-check" size={11} color={theme.colors.gold} iconStyle="solid" style={styles.goldBadge} />
					)}
				</View>

				{isCharging && (
					<View style={[styles.chargeChip, { backgroundColor: theme.colors.primary }]}>
						<Text style={[styles.chargeText, { fontFamily: theme.typography.fontFamily.semiBold }]}>
							${peer.amount}
						</Text>
					</View>
				)}
			</QPPressable>
		</Animated.View>
	)
}

const styles = StyleSheet.create({
	container: {
		position: 'absolute',
		width: BUBBLE_SIZE,
		alignItems: 'center',
	},
	pressable: {
		alignItems: 'center',
		width: BUBBLE_SIZE + 20,
	},
	nameRow: {
		flexDirection: 'row',
		alignItems: 'center',
		marginTop: 4,
		maxWidth: BUBBLE_SIZE + 16,
	},
	name: {
		fontSize: 12,
		flexShrink: 1,
	},
	goldBadge: {
		marginLeft: 3,
	},
	chargeChip: {
		marginTop: 3,
		paddingHorizontal: 8,
		paddingVertical: 2,
		borderRadius: 10,
	},
	chargeText: {
		color: '#ffffff',
		fontSize: 12,
	},
})

export default PeerBubble
