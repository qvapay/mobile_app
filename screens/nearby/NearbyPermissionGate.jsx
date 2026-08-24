import { Linking, StyleSheet, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'

// Icons
import FontAwesome6 from '@react-native-vector-icons/fontawesome6'

// Theme Context
import { useTheme } from '../../theme/ThemeContext'
import { useTextStyles } from '../../theme/themeUtils'

// UI
import QPButton from '../../ui/particles/QPButton'

/**
 * Blocking state for the radar: permissions denied or hardware unavailable.
 * The iOS Local Network prompt can't be re-triggered programmatically, so
 * denial routes the user to the system Settings pane.
 *
 * @param {object} props
 * @param {'permission_denied'|'unavailable'|'error'} props.state
 */
const NearbyPermissionGate = ({ state }) => {

	const { t } = useTranslation()
	const { theme } = useTheme()
	const textStyles = useTextStyles(theme)
	const denied = state === 'permission_denied'

	return (
		<View style={styles.container}>
			<FontAwesome6
				name={denied ? 'tower-broadcast' : 'triangle-exclamation'}
				size={56}
				color={theme.colors.tertiaryText}
				iconStyle="solid"
			/>

			<Text style={[textStyles.h4, { color: theme.colors.primaryText, textAlign: 'center', marginTop: 20 }]}>
				{denied ? t('misc.nearby.gate.permissionTitle') : t('misc.nearby.gate.unavailableTitle')}
			</Text>

			<Text style={[textStyles.body, { color: theme.colors.secondaryText, textAlign: 'center', marginTop: 8, paddingHorizontal: 24 }]}>
				{denied
					? t('misc.nearby.gate.permissionBody')
					: t('misc.nearby.gate.unavailableBody')}
			</Text>

			{denied && (
				<QPButton
					title={t('misc.nearby.gate.openSettings')}
					onPress={() => Linking.openSettings()}
					icon="gear"
					iconStyle="solid"
					style={styles.button}
				/>
			)}
		</View>
	)
}

const styles = StyleSheet.create({
	container: {
		flex: 1,
		alignItems: 'center',
		justifyContent: 'center',
		paddingHorizontal: 20,
	},
	button: {
		marginTop: 24,
		alignSelf: 'stretch',
	},
})

export default NearbyPermissionGate
