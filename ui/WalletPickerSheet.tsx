import { Modal, View, Text, ScrollView, Pressable, StyleSheet, useWindowDimensions } from 'react-native'
import { useTranslation } from 'react-i18next'

import { useTheme } from '../theme/ThemeContext'
import { createContainerStyles, createTextStyles } from '../theme/themeUtils'

import FontAwesome6 from '@react-native-vector-icons/fontawesome6'

import { openInWallet } from '../helpers/walletDeeplinks'

// Entrada del registro de wallets (helpers/walletDeeplinks, aún JS): aquí solo
// se leen id y name — el resto viaja opaco hacia openInWallet
type InstalledWallet = { id: string, name: string } & Record<string, unknown>

// Contexto del depósito que se reenvía a openInWallet
type WalletDepositCtx = {
	address: string
	amount?: string | number
	memo?: string
	coin: string
	network?: string
}

type WalletPickerSheetProps = {
	visible: boolean
	wallets: InstalledWallet[]
	ctx?: WalletDepositCtx
	onClose?: () => void
	onOpened?: (wallet: InstalledWallet, ok: boolean) => void
}

/**
 * "Open in your wallet" picker for crypto deposits (Add screen): lists the
 * installed wallets detected by `helpers/walletDeeplinks` and launches the
 * chosen one via its universal link with the deposit context (address, amount,
 * memo). Shows a warning strip when the coin requires a memo, since deep links
 * can't always carry it. Centered-card overlay; backdrop tap dismisses.
 *
 * @param props
 * @param props.visible - Controls modal visibility.
 * @param props.wallets - Installed compatible wallets (empty state if none).
 * @param props.ctx - Deposit context forwarded to `openInWallet` (includes optional `memo`).
 * @param props.onClose - Dismiss handler.
 * @param props.onOpened - Fired after a launch attempt with its result.
 */
const WalletPickerSheet = ({ visible, wallets, ctx, onClose, onOpened }: WalletPickerSheetProps) => {

	const { t } = useTranslation()
	const { theme } = useTheme()
	const textStyles = createTextStyles(theme)
	const containerStyles = createContainerStyles(theme)
	const { height: windowHeight } = useWindowDimensions()

	const handlePick = async (wallet: InstalledWallet) => {
		const ok = await openInWallet(wallet, ctx as WalletDepositCtx)
		onClose?.()
		onOpened?.(wallet, ok)
	}

	const needsMemo = !!ctx?.memo

	return (
		<Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={onClose}>
			<Pressable style={containerStyles.modalOverlay} onPress={onClose}>
				<Pressable onPress={() => { }} style={[containerStyles.modalCard, { maxHeight: windowHeight * 0.75 }]} >
					<View style={styles.header}>
						<Text style={[textStyles.h4, { color: theme.colors.primaryText }]}>{t('ui.walletPicker.title')}</Text>
						<Pressable onPress={onClose} hitSlop={8}>
							<FontAwesome6 name="xmark" size={20} color={theme.colors.secondaryText} iconStyle="solid" />
						</Pressable>
					</View>

					{needsMemo && (
						<View style={[styles.memoWarning, { backgroundColor: theme.colors.warning + '20', borderColor: theme.colors.warning }]}>
							<FontAwesome6 name="triangle-exclamation" size={14} color={theme.colors.warning} iconStyle="solid" />
							<Text style={[textStyles.caption, { color: theme.colors.warning, flex: 1, marginLeft: 8 }]}>
								{t('ui.walletPicker.memoWarning')}
							</Text>
						</View>
					)}

					<ScrollView showsVerticalScrollIndicator={false} bounces={false}>
						{wallets?.length ? (
							wallets.map((w) => (
								<Pressable key={w.id} onPress={() => handlePick(w)} style={({ pressed }) => [styles.walletRow, { backgroundColor: pressed ? theme.colors.elevation : 'transparent' }]}>
									<View style={[styles.iconCircle, { backgroundColor: theme.colors.primary + '20' }]}>
										<FontAwesome6 name="wallet" size={16} color={theme.colors.primary} iconStyle="solid" />
									</View>
									<Text style={[textStyles.h5, { color: theme.colors.primaryText, flex: 1, marginLeft: 12 }]} numberOfLines={1}>
										{w.name}
									</Text>
									<FontAwesome6 name="arrow-up-right-from-square" size={14} color={theme.colors.secondaryText} iconStyle="solid" />
								</Pressable>
							))
						) : (
							<View style={styles.emptyState}>
								<Text style={[textStyles.body, { color: theme.colors.secondaryText, textAlign: 'center' }]}>
									{t('ui.walletPicker.empty')}
								</Text>
							</View>
						)}
					</ScrollView>
				</Pressable>
			</Pressable>
		</Modal>
	)
}

const styles = StyleSheet.create({
	header: {
		flexDirection: 'row',
		justifyContent: 'space-between',
		alignItems: 'center',
		marginBottom: 14,
	},
	memoWarning: {
		flexDirection: 'row',
		alignItems: 'center',
		padding: 10,
		borderRadius: 10,
		borderWidth: 1,
		marginBottom: 10,
	},
	walletRow: {
		flexDirection: 'row',
		alignItems: 'center',
		paddingVertical: 12,
		paddingHorizontal: 10,
		borderRadius: 12,
	},
	iconCircle: {
		width: 36,
		height: 36,
		borderRadius: 18,
		alignItems: 'center',
		justifyContent: 'center',
	},
	emptyState: {
		paddingVertical: 24,
		paddingHorizontal: 12,
	},
})

export default WalletPickerSheet
