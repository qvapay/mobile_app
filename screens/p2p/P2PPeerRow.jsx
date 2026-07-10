import { View, Text, Pressable } from "react-native"
import FontAwesome6 from "@react-native-vector-icons/fontawesome6"

import QPAvatar from "../../ui/particles/QPAvatar"
import { displayName } from "../../helpers/displayName"

// Single-row peer block: tappable avatar + name with stats inline.
// When peerStats is available it surfaces rating / completion / completed ops,
// otherwise it falls back to the @username line.
const P2PPeerRow = ({ targetUser, wrapStyle, peerStats, peerReviewsCount, isOnline, onPress, theme, textStyles }) => {

	if (!targetUser) return null

	return (
		<View style={[{ flexDirection: 'row', alignItems: 'center', gap: 10 }, wrapStyle]}>
			<Pressable onPress={() => onPress(targetUser)} hitSlop={6}>
				<QPAvatar size={40} user={targetUser} isOnline={isOnline} />
			</Pressable>
			<View style={{ flex: 1 }}>
				<View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
					<Text style={textStyles.h5} numberOfLines={1}>{displayName(targetUser)}</Text>
					{targetUser.kyc && <FontAwesome6 name="circle-check" size={12} color={theme.colors.primary} iconStyle="solid" />}
					{targetUser.golden_check && <FontAwesome6 name="crown" size={12} color={theme.colors.gold} iconStyle="solid" />}
				</View>
				{peerStats ? (
					<View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 2 }}>
						<View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
							<FontAwesome6 name="star" size={10} color={theme.colors.warning} iconStyle="solid" />
							<Text style={[textStyles.h7, { color: theme.colors.secondaryText }]}>
								{Number(peerStats.averageRating || 0).toFixed(1)} ({peerReviewsCount})
							</Text>
						</View>
						<View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
							<FontAwesome6 name="circle-check" size={10} color={theme.colors.success} iconStyle="solid" />
							<Text style={[textStyles.h7, { color: theme.colors.secondaryText }]}>{Number(peerStats.completionRate || 0)}%</Text>
						</View>
						<View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
							<FontAwesome6 name="handshake" size={10} color={theme.colors.primary} iconStyle="solid" />
							<Text style={[textStyles.h7, { color: theme.colors.secondaryText }]}>{Number(peerStats.completedP2P || 0)}</Text>
						</View>
					</View>
				) : (
					<Text style={[textStyles.h6, { color: theme.colors.secondaryText }]} numberOfLines={1}>@{targetUser.username || ''}</Text>
				)}
			</View>
		</View>
	)
}

export default P2PPeerRow
