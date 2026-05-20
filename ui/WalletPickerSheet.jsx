import { Modal, View, Text, ScrollView, Pressable, StyleSheet, useWindowDimensions } from 'react-native'

import { useTheme } from '../theme/ThemeContext'
import { createTextStyles } from '../theme/themeUtils'

import FontAwesome6 from '@react-native-vector-icons/fontawesome6'

import { openInWallet } from '../helpers/walletDeeplinks'

const WalletPickerSheet = ({ visible, wallets, ctx, onClose, onOpened }) => {

	const { theme } = useTheme()
	const textStyles = createTextStyles(theme)
	const { height: windowHeight } = useWindowDimensions()

	const handlePick = async (wallet) => {
		const ok = await openInWallet(wallet, ctx)
		onClose?.()
		onOpened?.(wallet, ok)
	}

	const needsMemo = !!ctx?.memo

	return (
		<Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={onClose}>
			<Pressable style={styles.overlay} onPress={onClose}>
				<Pressable onPress={() => { }} style={[styles.container, { backgroundColor: theme.colors.surface, maxHeight: windowHeight * 0.75 }]} >
					<View style={styles.header}>
						<Text style={[textStyles.h4, { color: theme.colors.primaryText }]}>Abre en tu wallet</Text>
						<Pressable onPress={onClose} hitSlop={8}>
							<FontAwesome6 name="xmark" size={20} color={theme.colors.secondaryText} iconStyle="solid" />
						</Pressable>
					</View>

					{needsMemo && (
						<View style={[styles.memoWarning, { backgroundColor: theme.colors.warning + '20', borderColor: theme.colors.warning }]}>
							<FontAwesome6 name="triangle-exclamation" size={14} color={theme.colors.warning} iconStyle="solid" />
							<Text style={[textStyles.caption, { color: theme.colors.warning, flex: 1, marginLeft: 8 }]}>
								Verifica que el memo se haya copiado en tu wallet antes de enviar.
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
									No detectamos ninguna wallet instalada compatible con esta moneda.
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
	overlay: {
		flex: 1,
		backgroundColor: 'rgba(0,0,0,0.5)',
		justifyContent: 'center',
		alignItems: 'center',
		padding: 20,
	},
	container: {
		width: '100%',
		borderRadius: 16,
		padding: 20,
	},
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
