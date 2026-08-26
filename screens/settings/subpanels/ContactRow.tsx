import { View, Pressable } from 'react-native'
import FontAwesome6 from '@react-native-vector-icons/fontawesome6'
import ProfileContainerHorizontal from '../../../ui/ProfileContainerHorizontal'

// Tipos
import type { StyleProp, ViewStyle } from 'react-native'
import type { Theme } from '../../../theme/ThemeContext'
import type { ContainerStyles } from '../../../theme/themeUtils'

/** Usuario embebido en un contacto guardado (`contact.Contact` del backend). */
export type ContactUser = {
	uuid?: string
	name?: string
	lastname?: string
	username?: string
	image?: string | null
	kyc?: boolean
	vip?: boolean
	golden_check?: boolean
	phone_verified?: boolean
	telegram_verified?: boolean
}

/** Fila cruda de `GET /user/contact`: el registro de la agenda + el usuario enlazado. */
export type ApiContact = {
	id?: number | string
	uuid?: string
	name?: string
	favorite?: boolean
	Contact?: ContactUser
}

type ContactRowProps = {
	contact: ApiContact
	user: ContactUser
	isFirst: boolean
	isLast: boolean
	isOnline?: boolean
	theme: Theme
	containerStyles: ContainerStyles
	onSend: () => void
	onToggleFavorite: () => void
	onDelete: () => void
}

// A single saved-contact row. Top/bottom rows get rounded outer corners.
const ContactRow = ({ contact, user, isFirst, isLast, isOnline, theme, containerStyles, onSend, onToggleFavorite, onDelete }: ContactRowProps) => {

	const radius = theme.borderRadius?.md ?? 12
	const cardStyle: StyleProp<ViewStyle> = [
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
					<FontAwesome6 name="dollar-sign" size={18} color={theme.colors.successText} iconStyle="solid" />
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
