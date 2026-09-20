import { useMemo } from 'react'
import { Linking, StyleSheet, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner-native'
import Clipboard from '@react-native-clipboard/clipboard'
import FontAwesome6 from '@react-native-vector-icons/fontawesome6'

// Theme
import { useTheme } from '../../../theme/ThemeContext'
import { useContainerStyles, useTextStyles } from '../../../theme/themeUtils'

// Wallet
import { useEffectiveRegistry } from '../../../wallet/registry/appRpcRouter'
import { explorerTxUrl } from '../../../wallet/assets'
import { displayAmount } from '../../../wallet/chains/units'
import { useAssetCatalog } from './walletQueries'
import { shortAddress } from './walletFormat'

// UI
import QPButton from '../../../ui/particles/QPButton'
import QPPressable from '../../../ui/particles/QPPressable'
import AssetIcon from './components/AssetIcon'

// Navigation
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import type { RootStackParamList } from '../../../types/navigation'

type Props = NativeStackScreenProps<RootStackParamList, 'WalletSendSuccess'>

/** Tx difundida: hash, destino y salida al explorador. `Listo` vuelve a la wallet. */
const WalletSendSuccess = ({ navigation, route }: Props) => {

	const { assetId, txid, amount, to } = route.params
	const { t } = useTranslation()
	const { theme } = useTheme()
	const textStyles = useTextStyles(theme)
	const containerStyles = useContainerStyles(theme)

	const catalog = useAssetCatalog()
	const registry = useEffectiveRegistry()
	const asset = useMemo(() => catalog.find(a => a.id === assetId), [catalog, assetId])
	const explorer = asset ? explorerTxUrl(registry.chains[asset.chainKey], txid) : null

	const copy = () => { Clipboard.setString(txid); toast.success(t('crypto.wallet.send.hashCopied')) }

	return (
		<View style={[containerStyles.subContainer, styles.container]}>
			<View style={styles.body}>
				<View style={[styles.check, { backgroundColor: theme.colors.successText + '18' }]}>
					<FontAwesome6 name="check" size={34} color={theme.colors.successText} iconStyle="solid" />
				</View>
				<Text style={[textStyles.h1, styles.centered, { color: theme.colors.primaryText }]}>{t('crypto.wallet.send.successTitle')}</Text>
				<Text style={[textStyles.h4, styles.centered, { color: theme.colors.secondaryText }]}>{t('crypto.wallet.send.successSubtitle')}</Text>

				<View style={[styles.card, { backgroundColor: theme.colors.surface }, !theme.isDark && { borderWidth: StyleSheet.hairlineWidth, borderColor: theme.colors.border }]}>
					<View style={styles.amountRow}>
						{asset && <AssetIcon logoTick={asset.logoTick} networkTick={asset.networkTick} size={34} />}
						<Text style={[textStyles.h2, { color: theme.colors.primaryText }]}>−{displayAmount(amount)} {asset?.symbol ?? ''}</Text>
					</View>
					<Text style={[textStyles.h6, styles.centered, { color: theme.colors.secondaryText }]}>{t('crypto.wallet.asset.to', { address: shortAddress(to, 8, 8) })}</Text>
					<QPPressable onPress={copy} style={styles.hashRow} accessibilityRole="button" accessibilityLabel={t('crypto.wallet.send.copyHash')}>
						<Text style={[textStyles.h6, styles.hash, { color: theme.colors.tertiaryText }]} numberOfLines={1}>{shortAddress(txid, 10, 10)}</Text>
						<FontAwesome6 name="copy" size={12} color={theme.colors.tertiaryText} iconStyle="regular" />
					</QPPressable>
				</View>
			</View>

			<View style={styles.actions}>
				{!!explorer && <QPButton title={t('crypto.wallet.asset.openExplorer')} icon="up-right-from-square" outlined onPress={() => Linking.openURL(explorer).catch(() => {})} />}
				<QPButton title={t('crypto.wallet.send.done')} onPress={() => navigation.popToTop()} />
			</View>
		</View>
	)
}

const styles = StyleSheet.create({
	container: { paddingBottom: 30 },
	body: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 },
	check: { width: 84, height: 84, borderRadius: 42, alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
	centered: { textAlign: 'center' },
	card: { alignSelf: 'stretch', borderRadius: 14, padding: 16, alignItems: 'center', gap: 6, marginTop: 18 },
	amountRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
	hashRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 4 },
	hash: { letterSpacing: 0.3 },
	actions: { gap: 10 },
})

export default WalletSendSuccess
