import { StyleSheet, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import FontAwesome6 from '@react-native-vector-icons/fontawesome6'
import { useNavigation } from '@react-navigation/native'
import type { NavigationProp } from '@react-navigation/native'

// Theme
import { useTheme } from '../../../../theme/ThemeContext'
import { useTextStyles } from '../../../../theme/themeUtils'

// UI
import QPButton from '../../../../ui/particles/QPButton'
import QPPressable from '../../../../ui/particles/QPPressable'

// Navigation
import { ROUTES } from '../../../../routes'
import type { RootStackParamList } from '../../../../types/navigation'

type Props = {
	/**
	 * `full`: tarjeta de WalletOnly con todo lo que añade la cuenta.
	 * `history`: hueco del historial en WalletAsset (el proxy exige sesión).
	 */
	variant?: 'full' | 'history'
}

/**
 * Invitación a crear la cuenta QvaPay desde el modo wallet (sin sesión). La
 * wallet sigue siendo la misma al registrarse: la seed vive en el teléfono y
 * WalletContext registra sus direcciones públicas en cuanto hay sesión.
 */
const AccountUpsellCard = ({ variant = 'full' }: Props) => {

	const { t } = useTranslation()
	const { theme } = useTheme()
	const textStyles = useTextStyles(theme)
	const navigation = useNavigation<NavigationProp<RootStackParamList>>()

	const openRegister = () => navigation.navigate(ROUTES.REGISTER_SCREEN)
	const cardStyle = [styles.card, { backgroundColor: theme.colors.surface }, !theme.isDark && { borderWidth: StyleSheet.hairlineWidth, borderColor: theme.colors.border }]

	if (variant === 'history') {
		return (
			<View testID="account-upsell-history" style={[cardStyle, styles.compact]}>
				<FontAwesome6 name="clock-rotate-left" size={20} color={theme.colors.secondaryText} iconStyle="solid" />
				<Text style={[textStyles.h5, styles.centered, { color: theme.colors.secondaryText }]}>{t('crypto.wallet.guest.historyLocked')}</Text>
				<QPPressable onPress={openRegister} style={styles.link} accessibilityRole="button">
					<Text style={{ color: theme.colors.primary, fontFamily: theme.typography.fontFamily.medium, fontSize: theme.typography.fontSize.sm }}>{t('crypto.wallet.guest.upsell.cta')}</Text>
				</QPPressable>
			</View>
		)
	}

	return (
		<View testID="account-upsell-full" style={cardStyle}>
			<View style={styles.header}>
				<View style={[styles.icon, { backgroundColor: theme.colors.primary + '15' }]}>
					<FontAwesome6 name="user-plus" size={16} color={theme.colors.primary} iconStyle="solid" />
				</View>
				<View style={styles.fill}>
					<Text style={[textStyles.h4, { color: theme.colors.primaryText, fontFamily: theme.typography.fontFamily.medium }]}>{t('crypto.wallet.guest.upsell.title')}</Text>
					<Text style={[textStyles.h6, { color: theme.colors.secondaryText }]}>{t('crypto.wallet.guest.upsell.body')}</Text>
				</View>
			</View>
			<QPButton title={t('crypto.wallet.guest.upsell.cta')} onPress={openRegister} />
		</View>
	)
}

const styles = StyleSheet.create({
	card: { borderRadius: 14, padding: 16, gap: 14 },
	compact: { alignItems: 'center', gap: 8, paddingVertical: 20 },
	header: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
	icon: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
	fill: { flex: 1, gap: 4 },
	centered: { textAlign: 'center' },
	link: { paddingVertical: 6, paddingHorizontal: 10 },
})

export default AccountUpsellCard
