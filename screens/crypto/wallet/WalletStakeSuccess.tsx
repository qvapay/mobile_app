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
import { isStakingKind } from '../../../wallet/staking/types'
import { useAssetCatalog } from './walletQueries'
import { shortAddress } from './walletFormat'

// UI
import QPButton from '../../../ui/particles/QPButton'
import QPPressable from '../../../ui/particles/QPPressable'
import QPAssetIcon from '../../../ui/particles/QPAssetIcon'

// Navigation
import { ROUTES } from '../../../routes'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import type { RootStackParamList } from '../../../types/navigation'

type Props = NativeStackScreenProps<RootStackParamList, 'WalletStakeSuccess'>

/** Acciones de ENTRADA: tras ellas se cuenta "qué pasa ahora" (activación, ciclo). */
const ENTRY_ACTIONS = new Set(['stake', 'delegate'])
/** Acciones de SALIDA: tras ellas se cuenta cuándo vuelve el dinero. */
const EXIT_ACTIONS = new Set(['unstake', 'revoke'])

/**
 * Tx de staking difundida: qué se hizo, qué pasa ahora en esa red, hash y
 * explorador. "Ver mi staking" vuelve a la ficha de staking del activo
 * (la que ya está en la pila si se llegó desde ella; nunca vuelve al formulario).
 */
const WalletStakeSuccess = ({ navigation, route }: Props) => {

	const { assetId, action, txid, amount, note } = route.params
	const { t } = useTranslation()
	const { theme } = useTheme()
	const textStyles = useTextStyles(theme)
	const containerStyles = useContainerStyles(theme)

	const catalog = useAssetCatalog()
	const registry = useEffectiveRegistry()
	const asset = useMemo(() => catalog.find(a => a.id === assetId), [catalog, assetId])
	const explorer = asset ? explorerTxUrl(registry.chains[asset.chainKey], txid) : null
	const kind = asset && isStakingKind(asset.kind) ? asset.kind : null
	const next = !kind ? null
		: ENTRY_ACTIONS.has(action) ? t(`crypto.staking.success.next.${kind}`)
			: EXIT_ACTIONS.has(action) ? t(`crypto.staking.success.exit.${kind}`)
				: null

	const copy = () => { Clipboard.setString(txid); toast.success(t('crypto.wallet.send.hashCopied')) }

	return (
		<View style={[containerStyles.subContainer, styles.container]}>
			<View style={styles.body}>
				<View style={[styles.check, { backgroundColor: theme.colors.successText + '18' }]}>
					<FontAwesome6 name={ENTRY_ACTIONS.has(action) ? 'seedling' : 'check'} size={34} color={theme.colors.successText} iconStyle="solid" />
				</View>
				<Text style={[textStyles.h1, styles.centered, { color: theme.colors.primaryText }]}>{t(`crypto.staking.success.title.${action}`)}</Text>
				{!!next && <Text style={[textStyles.h4, styles.centered, { color: theme.colors.secondaryText }]}>{next}</Text>}
				{note === 'votePending' && (
					<View style={[styles.notice, { backgroundColor: theme.colors.warning + '14' }]}>
						<FontAwesome6 name="triangle-exclamation" size={14} color={theme.colors.warning} iconStyle="solid" />
						<Text style={[styles.noticeText, { color: theme.colors.primaryText, fontFamily: theme.typography.fontFamily.regular, fontSize: theme.typography.fontSize.sm }]}>{t('crypto.staking.success.votePending')}</Text>
					</View>
				)}

				<View style={[styles.card, { backgroundColor: theme.colors.surface }, !theme.isDark && { borderWidth: StyleSheet.hairlineWidth, borderColor: theme.colors.border }]}>
					{!!amount && (
						<View style={styles.amountRow}>
							{asset && <QPAssetIcon logoTick={asset.logoTick} networkTick={asset.networkTick} size={34} />}
							<Text style={[textStyles.h2, { color: theme.colors.primaryText }]}>{displayAmount(amount)} {asset?.symbol ?? ''}</Text>
						</View>
					)}
					<Text style={[textStyles.h6, { color: theme.colors.secondaryText }]}>{t('crypto.staking.success.txid')}</Text>
					<QPPressable onPress={copy} style={styles.hashRow} accessibilityRole="button" accessibilityLabel={t('crypto.wallet.send.copyHash')}>
						<Text style={[textStyles.h6, styles.hash, { color: theme.colors.tertiaryText }]} numberOfLines={1}>{shortAddress(txid, 10, 10)}</Text>
						<FontAwesome6 name="copy" size={12} color={theme.colors.tertiaryText} iconStyle="regular" />
					</QPPressable>
				</View>
			</View>

			<View style={styles.actions}>
				{!!explorer && <QPButton title={t('crypto.wallet.asset.openExplorer')} icon="up-right-from-square" outlined onPress={() => Linking.openURL(explorer).catch(() => {})} />}
				<QPButton title={t('crypto.staking.success.viewStaking')} onPress={() => navigation.popTo(ROUTES.WALLET_STAKE, { assetId })} testID="stake-success-view" />
				<QPButton title={t('crypto.staking.success.done')} outlined onPress={() => navigation.popToTop()} />
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
	notice: { flexDirection: 'row', gap: 10, padding: 12, borderRadius: 12, alignItems: 'flex-start', alignSelf: 'stretch', marginTop: 8 },
	noticeText: { flex: 1, lineHeight: 20 },
})

export default WalletStakeSuccess
