import { Modal, View, Text, ScrollView, Pressable, StyleSheet, Linking } from 'react-native'
import { useTranslation } from 'react-i18next'

// Theme
import { useTheme } from '../theme/ThemeContext'
import { createTextStyles } from '../theme/themeUtils'

// Icons
import FontAwesome6 from '@react-native-vector-icons/fontawesome6'

// UI
import QPButton from './particles/QPButton'

const PRIVACY_URL = 'https://www.qvapay.com/privacy'

type ContactsDisclosureModalProps = {
	visible: boolean
	onAccept: () => void
	onDecline: () => void
}

/**
 * Pre-permission disclosure modal shown before requesting device-contacts
 * access (Settings > Contacts screen). Explains that phone numbers are
 * uploaded only to match friends already on QvaPay, links to the privacy
 * policy, and offers accept/decline. This is the app's reference
 * centered-card modal pattern: transparent + fade, dark overlay, card on the
 * theme surface. Android back button triggers `onDecline`.
 *
 * @param props
 * @param props.visible - Controls modal visibility.
 * @param props.onAccept - User consented; proceed to the OS permission prompt.
 * @param props.onDecline - User declined (also fired by back button).
 */
const ContactsDisclosureModal = ({ visible, onAccept, onDecline }: ContactsDisclosureModalProps) => {

	const { t } = useTranslation()
	const { theme, styles: themeStyles } = useTheme()
	const textStyles = createTextStyles(theme)

	return (
		<Modal visible={visible} transparent animationType="fade" onRequestClose={onDecline}>
			<View style={themeStyles.container.modalOverlay}>
				<View style={themeStyles.container.modalCard}>
					<FontAwesome6 name="address-book" size={40} color={theme.colors.primary} iconStyle="solid" style={{ alignSelf: 'center', marginBottom: 16 }} />
					<Text style={[textStyles.h3, { textAlign: 'center', marginBottom: 8 }]}>
						{t('ui.contactsDisclosure.title')}
					</Text>
					<ScrollView style={styles.scrollArea} bounces={false}>
						<Text style={[textStyles.body, { color: theme.colors.secondaryText, textAlign: 'center', lineHeight: 22 }]}>
							{t('ui.contactsDisclosure.body')}
						</Text>
					</ScrollView>
					<Pressable onPress={() => Linking.openURL(PRIVACY_URL)} style={styles.privacyLink}>
						<Text style={[textStyles.body, { color: theme.colors.primary, textAlign: 'center' }]}>
							{t('ui.contactsDisclosure.privacyLink')}
						</Text>
					</Pressable>
					<QPButton
						title={t('ui.contactsDisclosure.accept')}
						onPress={onAccept}
						style={{ backgroundColor: theme.colors.primary, marginBottom: 8 }}
						textStyle={{ color: theme.colors.almostWhite }}
					/>
					<QPButton
						title={t('ui.contactsDisclosure.decline')}
						onPress={onDecline}
						style={{ backgroundColor: 'transparent' }}
						textStyle={{ color: theme.colors.secondaryText }}
					/>
				</View>
			</View>
		</Modal>
	)
}

const styles = StyleSheet.create({
	scrollArea: {
		maxHeight: 200,
		marginBottom: 16,
	},
	privacyLink: {
		marginBottom: 20,
		paddingVertical: 4,
	},
})

export default ContactsDisclosureModal
