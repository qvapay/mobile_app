import { View, Pressable } from 'react-native'
import FontAwesome6 from '@react-native-vector-icons/fontawesome6'
import ProfileContainerHorizontal from '../../../ui/ProfileContainerHorizontal'

// A single saved-contact row. Top/bottom rows get rounded outer corners.
const ContactRow = ({ contact, user, isFirst, isLast, isOnline, theme, containerStyles, onSend, onToggleFavorite, onDelete }) => {

	const radius = theme.borderRadius?.md ?? 12
	const cardStyle = [
		containerStyles.card,
		{
			flexDirection: 'row',
			alignItems: 'center',
			justifyContent: 'space-between',
			marginVertical: 0,
			borderRadius: 0,
			...(isFirst && { borderTopLeftRadius: radius, borderTopRightRadius: radius }),
			...(isLast && { borderBottomLeftRadius: radius, borderBottomRightRadius: radius }),
		},
	]
	
	return (
		<View style={cardStyle}>
			<View style={{ flex: 1 }}>
				<ProfileContainerHorizontal user={user} size={52} isOnline={isOnline} />
			</View>
			<View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
				<Pressable onPress={onSend} hitSlop={8}>
					<FontAwesome6 name="dollar-sign" size={18} color={theme.colors.success} iconStyle="solid" />
				</Pressable>
				<Pressable onPress={onToggleFavorite} hitSlop={8}>
					<FontAwesome6 name="star" size={18} color={contact.favorite ? theme.colors.warning : theme.colors.tertiaryText} iconStyle={contact.favorite ? 'solid' : 'regular'} />
				</Pressable>
				<Pressable onPress={onDelete} hitSlop={8}>
					<FontAwesome6 name="trash" size={16} color={theme.colors.danger} iconStyle="solid" />
				</Pressable>
			</View>
		</View>
	)
}

export default ContactRow
