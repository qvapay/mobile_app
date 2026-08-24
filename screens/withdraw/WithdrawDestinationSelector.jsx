import { View, Text, StyleSheet } from 'react-native'
import { useTranslation } from 'react-i18next'

import FontAwesome6 from '@react-native-vector-icons/fontawesome6'

import QPButton from '../../ui/particles/QPButton'
import QPPressable from '../../ui/particles/QPPressable'

/**
 * Destination gate for crypto withdrawals, mirroring the web wizard's
 * DestinationStep: the user must declare whether the funds go to their own
 * wallet or to a third party before the address fields appear. Picking
 * "Pago a terceros" swaps the cards for a blocking notice (we don't support
 * third-party payouts) with a CTA back to the personal-wallet path; picking
 * the personal wallet also shows the exchanges/third-party-systems warning.
 *
 * @param {object} props
 * @param {null|'personal'|'third_party'} props.destination - Current selection.
 * @param {function} props.onSelect - Receives 'personal', 'third_party' or null (dismiss the notice).
 * @param {object} props.theme - Theme from useTheme (passed down like the other withdraw cards).
 * @param {object} props.textStyles - Memoized text styles from the parent screen.
 */
const WithdrawDestinationSelector = ({ destination, onSelect, theme, textStyles }) => {

	const { t } = useTranslation()

	if (destination === 'third_party') {
		return (
			<View style={[styles.blockedCard, { backgroundColor: theme.colors.danger + '15', borderColor: theme.colors.danger }]}>
				<QPPressable variant="opacity" onPress={() => onSelect(null)} style={styles.closeButton} accessibilityLabel={t('withdraw.destination.closeAccessibility')}>
					<FontAwesome6 name="xmark" size={18} color={theme.colors.secondaryText} iconStyle="solid" />
				</QPPressable>
				<FontAwesome6 name="ban" size={32} color={theme.colors.danger} iconStyle="solid" />
				<Text style={[textStyles.h5, { color: theme.colors.primaryText, marginTop: 12, textAlign: 'center' }]}>{t('withdraw.destination.blockedTitle')}</Text>
				<Text style={[textStyles.caption, { color: theme.colors.secondaryText, marginTop: 4, textAlign: 'center' }]}>{t('withdraw.destination.blockedSubtitle')}</Text>
				<QPButton
					title={t('withdraw.destination.useMyWallet')}
					onPress={() => onSelect('personal')}
					style={{ marginTop: 16, width: '100%' }}
					textStyle={{ color: theme.colors.almostWhite }}
				/>
			</View>
		)
	}

	const options = [
		{ key: 'personal', icon: 'wallet', title: t('withdraw.destination.personalTitle'), subtitle: t('withdraw.destination.personalSubtitle') },
		{ key: 'third_party', icon: 'users', title: t('withdraw.destination.thirdPartyTitle'), subtitle: t('withdraw.destination.thirdPartySubtitle') },
	]

	return (
		<View style={styles.container}>
			<Text style={[textStyles.h5, { color: theme.colors.secondaryText, marginBottom: 10 }]}>{t('withdraw.destination.question')}</Text>
			{options.map(({ key, icon, title, subtitle }) => {
				const selected = destination === key
				return (
					<QPPressable
						key={key}
						onPress={() => onSelect(key)}
						style={[
							styles.optionCard,
							{ backgroundColor: theme.colors.surface },
							selected
								? { borderWidth: 1.5, borderColor: theme.colors.primary }
								: theme.mode === 'light' && { borderWidth: 1, borderColor: theme.colors.border },
						]}
					>
						<View style={[styles.iconCircle, { backgroundColor: theme.colors.primary + '20' }]}>
							<FontAwesome6 name={icon} size={16} color={theme.colors.primary} iconStyle="solid" />
						</View>
						<View style={styles.optionTexts}>
							<Text style={[textStyles.h5, { color: theme.colors.primaryText }]}>{title}</Text>
							<Text style={[textStyles.caption, { color: theme.colors.secondaryText, marginTop: 2 }]}>{subtitle}</Text>
						</View>
					</QPPressable>
				)
			})}

			{destination === 'personal' && (
				<View style={[styles.warningStrip, { backgroundColor: theme.colors.warning + '20', borderColor: theme.colors.warning }]}>
					<FontAwesome6 name="triangle-exclamation" size={14} color={theme.colors.warning} iconStyle="solid" />
					<Text style={[textStyles.caption, { color: theme.colors.warning, flex: 1, marginLeft: 8 }]}>
						{t('withdraw.destination.exchangeWarning')}
					</Text>
				</View>
			)}
		</View>
	)
}

const styles = StyleSheet.create({
	container: {
		marginTop: 20,
	},
	optionCard: {
		flexDirection: 'row',
		alignItems: 'center',
		borderRadius: 12,
		padding: 14,
		marginBottom: 10,
	},
	iconCircle: {
		width: 36,
		height: 36,
		borderRadius: 18,
		justifyContent: 'center',
		alignItems: 'center',
	},
	optionTexts: {
		flex: 1,
		marginLeft: 12,
	},
	blockedCard: {
		marginTop: 20,
		borderRadius: 12,
		borderWidth: 1,
		padding: 20,
		alignItems: 'center',
	},
	closeButton: {
		position: 'absolute',
		top: 12,
		right: 12,
		zIndex: 1,
		padding: 4,
	},
	warningStrip: {
		flexDirection: 'row',
		alignItems: 'flex-start',
		borderRadius: 10,
		borderWidth: 1,
		padding: 10,
		marginTop: 2,
	},
})

export default WithdrawDestinationSelector
