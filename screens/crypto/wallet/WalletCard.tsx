import { StyleSheet, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import FontAwesome6 from '@react-native-vector-icons/fontawesome6'

// Theme
import { useTheme } from '../../../theme/ThemeContext'
import { createTextStyles } from '../../../theme/themeUtils'

// Wallet
import { useWallet } from '../../../wallet/WalletContext'

// UI
import QPPressable from '../../../ui/particles/QPPressable'

// Navigation
import { useNavigation } from '@react-navigation/native'
import { ROUTES } from '../../../routes'

import type { Theme } from '../../../theme/ThemeContext'


/**
 * Card de la wallet self-custody en el dashboard del tab Crypto, para los
 * dos estados previos a la wallet activa: sin
 * wallet (CTA crear/importar) y backup pendiente (retomarlo). Con la wallet
 * respaldada no pinta nada: manda WalletHome (saldo + activos).
 */
const WalletCard = () => {

	const { t } = useTranslation()
	const { theme } = useTheme()
	const textStyles = createTextStyles(theme)
	const navigation = useNavigation()

	const { isReady, hasWallet, isBackedUp } = useWallet()

	// Sin hidratar no se decide nada; activa y respaldada, manda WalletHome
	if (!isReady || (hasWallet && isBackedUp)) return null

	return (
		<View style={[styles.card, { backgroundColor: theme.colors.surface }, cardBorder(theme)]}>
			<View style={styles.header}>
				<View style={[styles.icon, { backgroundColor: theme.colors.primary + '15' }]}>
					<FontAwesome6 name="key" size={16} color={theme.colors.primary} iconStyle="solid" />
				</View>
				<Text style={[textStyles.h4, { color: theme.colors.primaryText }]}>{t('crypto.wallet.card.title')}</Text>
			</View>

			{!hasWallet ? (
				<QPPressable
					onPress={() => navigation.navigate(ROUTES.WALLET_ONBOARDING)}
					style={styles.ctaRow}
					accessibilityRole="button"
					// El botón no lleva rótulo: la etiqueta vive aquí para VoiceOver/TalkBack
					accessibilityLabel={t('crypto.wallet.card.create')}
				>
					<Text style={[textStyles.h5, styles.ctaText, { color: theme.colors.secondaryText }]}>{t('crypto.wallet.card.subtitle')}</Text>
					<View style={[styles.ctaIcon, { backgroundColor: theme.colors.primary + '15' }]}>
						<FontAwesome6 name="plus" size={15} color={theme.colors.primary} iconStyle="solid" />
					</View>
				</QPPressable>
			) : !isBackedUp ? (
				<QPPressable onPress={() => navigation.navigate(ROUTES.WALLET_BACKUP)} style={styles.ctaRow}>
					<FontAwesome6 name="triangle-exclamation" size={14} color={theme.colors.warning} iconStyle="solid" />
					<Text style={[textStyles.h5, styles.ctaText, { color: theme.colors.warning }]}>{t('crypto.wallet.card.resumeBackup')}</Text>
					<FontAwesome6 name="chevron-right" size={12} color={theme.colors.secondaryText} iconStyle="solid" />
				</QPPressable>
			) : null}
		</View>
	)
}

const cardBorder = (theme: Theme) =>
	!theme.isDark ? { borderWidth: StyleSheet.hairlineWidth, borderColor: theme.colors.border } : null

const styles = StyleSheet.create({
	card: { borderRadius: 14, padding: 12 },
	header: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
	icon: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
	ctaRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 4 },
	// Botón-icono = squircle con radio proporcional (34→12), no círculo: la
	// píldora/círculo queda para estado, el squircle para acción.
	ctaIcon: { width: 34, height: 34, borderRadius: 12, borderCurve: 'continuous', alignItems: 'center', justifyContent: 'center' },
	ctaText: { flex: 1 },
})

export default WalletCard
