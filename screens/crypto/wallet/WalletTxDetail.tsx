import { useMemo } from 'react'
import { Linking, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner-native'
import FontAwesome6 from '@react-native-vector-icons/fontawesome6'
import type { FontAwesome6SolidIconName } from '@react-native-vector-icons/fontawesome6'

// Theme
import { useTheme } from '../../../theme/ThemeContext'
import type { Theme } from '../../../theme/ThemeContext'
import { useContainerStyles, useTextStyles } from '../../../theme/themeUtils'

// Wallet
import { useEffectiveRegistry } from '../../../wallet/registry/appRpcRouter'
import { assetPrice, explorerTxUrl } from '../../../wallet/assets'
import { displayAmount } from '../../../wallet/chains/units'
import { useAssetCatalog, usePriceMap } from './walletQueries'
import { formatUsd } from './walletFormat'

// Helpers
import { copyTextToClipboard, getShortDateTime } from '../../../helpers'

// UI
import QPButton from '../../../ui/particles/QPButton'
import QPPressable from '../../../ui/particles/QPPressable'
import QPAssetIcon from '../../../ui/particles/QPAssetIcon'

// Navigation
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import type { RootStackParamList } from '../../../types/navigation'
import type { WalletTx } from '../../../types/domain'

type Props = NativeStackScreenProps<RootStackParamList, 'WalletTxDetail'>

const DIRECTION_ICON: Record<WalletTx['direction'], FontAwesome6SolidIconName> = { in: 'arrow-down', out: 'arrow-up', self: 'arrows-rotate' }

type RowProps = { label: string, value: string, theme: Theme, mono?: boolean, copy?: boolean, last?: boolean }

/** Fila etiqueta/valor; con `copy`, tocar el valor lo copia (direcciones y hash). */
const Row = ({ label, value, theme, mono, copy, last }: RowProps) => {
	const body = (
		<View style={[styles.row, !last && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.colors.border + '60' }]}>
			<Text style={[styles.rowLabel, { color: theme.colors.secondaryText, fontFamily: theme.typography.fontFamily.regular, fontSize: theme.typography.fontSize.sm }]}>{label}</Text>
			<Text selectable={!copy} style={[styles.rowValue, { color: theme.colors.primaryText, fontFamily: theme.typography.fontFamily.medium, fontSize: mono ? theme.typography.fontSize.xs : theme.typography.fontSize.sm }]}>{value}</Text>
			{copy && <FontAwesome6 name="copy" size={12} color={theme.colors.tertiaryText} iconStyle="regular" />}
		</View>
	)
	return copy ? <QPPressable onPress={() => copyTextToClipboard(value)} accessibilityRole="button">{body}</QPPressable> : body
}

/**
 * Detalle de un movimiento on-chain de la wallet: cantidad y valor al precio
 * actual, estado, fecha, contrapartes y hash (copiables), comisión y red. El
 * explorador queda como botón, no como único destino del toque.
 */
const WalletTxDetail = ({ route }: Props) => {

	const { assetId, tx } = route.params
	const { t } = useTranslation()
	const { theme } = useTheme()
	const textStyles = useTextStyles(theme)
	const containerStyles = useContainerStyles(theme)

	const catalog = useAssetCatalog()
	const registry = useEffectiveRegistry()
	const prices = usePriceMap()
	const asset = useMemo(() => catalog.find(a => a.id === assetId), [catalog, assetId])
	const chain = asset ? registry.chains[asset.chainKey] : undefined
	const explorer = explorerTxUrl(chain, tx.hash)

	const isFee = tx.kind === 'fee'
	const failed = tx.status === 'failed'
	const tint = failed ? theme.colors.danger : isFee ? theme.colors.secondaryText : tx.direction === 'in' ? theme.colors.successText : theme.colors.primary
	const sign = isFee || tx.direction === 'out' ? '−' : tx.direction === 'in' ? '+' : ''
	// Valor al precio de HOY (no al del momento de la tx): se dice en la etiqueta
	const price = asset ? assetPrice(asset, prices) : null
	const usd = price !== null && Number.isFinite(Number(tx.amount)) ? Number(tx.amount) * price : null
	const nativeSymbol = chain?.native.symbol ?? ''

	const title = isFee ? t('crypto.wallet.asset.feeEntry') : t(`crypto.wallet.asset.direction.${tx.direction}`)
	const statusKey = tx.status === 'confirmed' ? 'crypto.wallet.txDetail.confirmed' : `crypto.wallet.asset.status.${tx.status}`

	return (
		<ScrollView style={containerStyles.subContainer} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>

			<View style={styles.hero}>
				<View style={styles.heroIcon}>
					{asset && <QPAssetIcon logoTick={asset.logoTick} networkTick={asset.networkTick} size={56} ringColor={theme.colors.background} />}
					<View style={[styles.badge, { backgroundColor: tint, borderColor: theme.colors.background }]}>
						<FontAwesome6 name={failed ? 'xmark' : isFee ? 'fire' : DIRECTION_ICON[tx.direction]} size={11} color={theme.colors.buttonText} iconStyle="solid" />
					</View>
				</View>
				<Text style={[textStyles.h5, { color: theme.colors.secondaryText }]}>{title}</Text>
				<Text style={[textStyles.amount, styles.heroAmount, { color: failed ? theme.colors.danger : theme.colors.primaryText }]}>{sign}{displayAmount(tx.amount)} {tx.symbol}</Text>
				<Text style={[textStyles.h5, { color: theme.colors.secondaryText }]}>{usd !== null ? t('crypto.wallet.txDetail.usdNow', { value: formatUsd(usd) }) : ' '}</Text>
				<View style={[styles.statusPill, { backgroundColor: (failed ? theme.colors.danger : tx.status === 'pending' ? theme.colors.warning : theme.colors.successText) + '18' }]}>
					<Text style={{ color: failed ? theme.colors.danger : tx.status === 'pending' ? theme.colors.warning : theme.colors.successText, fontFamily: theme.typography.fontFamily.semiBold, fontSize: theme.typography.fontSize.xs }}>
						{t(statusKey)}
					</Text>
				</View>
			</View>

			<View style={[styles.card, { backgroundColor: theme.colors.surface }, !theme.isDark && { borderWidth: StyleSheet.hairlineWidth, borderColor: theme.colors.border }]}>
				<Row theme={theme} label={t('crypto.wallet.txDetail.date')} value={getShortDateTime(tx.time * 1000)} />
				<Row theme={theme} label={t('crypto.wallet.txDetail.network')} value={asset?.chainName ?? ''} />
				{!!tx.from && <Row theme={theme} label={t('crypto.wallet.send.fromLabel')} value={tx.from} mono copy />}
				{!!tx.to && <Row theme={theme} label={isFee ? t('crypto.wallet.txDetail.contract') : t('crypto.wallet.send.toLabel')} value={tx.to} mono copy />}
				{!!tx.fee && !isFee && <Row theme={theme} label={t('crypto.wallet.send.networkFee')} value={`${displayAmount(tx.fee)} ${nativeSymbol}`} />}
				<Row theme={theme} label={t('crypto.wallet.txDetail.hash')} value={tx.hash} mono copy last />
			</View>

			{tx.status === 'pending' && (
				<View style={[styles.notice, { backgroundColor: theme.colors.warning + '14' }]}>
					<FontAwesome6 name="clock" size={14} color={theme.colors.warning} iconStyle="solid" />
					<Text style={[styles.noticeText, { color: theme.colors.primaryText, fontFamily: theme.typography.fontFamily.regular, fontSize: theme.typography.fontSize.sm }]}>{t('crypto.wallet.txDetail.pendingHint')}</Text>
				</View>
			)}

			<View style={styles.spacer} />

			{!!explorer && (
				<QPButton title={t('crypto.wallet.asset.openExplorer')} icon="up-right-from-square" outlined onPress={() => Linking.openURL(explorer).catch(() => toast.error(t('crypto.wallet.asset.explorerFailed')))} />
			)}
		</ScrollView>
	)
}

const styles = StyleSheet.create({
	content: { gap: 12, paddingTop: 8, paddingBottom: 24, flexGrow: 1 },
	hero: { alignItems: 'center', gap: 4, paddingBottom: 8 },
	heroIcon: { marginBottom: 8 },
	badge: { position: 'absolute', right: -4, bottom: -4, width: 24, height: 24, borderRadius: 12, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
	heroAmount: { fontSize: 32, marginTop: 2 },
	statusPill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, marginTop: 6 },
	card: { borderRadius: 14, paddingHorizontal: 14 },
	row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12 },
	rowLabel: { minWidth: 76 },
	rowValue: { flex: 1, textAlign: 'right' },
	notice: { flexDirection: 'row', gap: 10, padding: 12, borderRadius: 12, alignItems: 'flex-start' },
	noticeText: { flex: 1 },
	spacer: { flex: 1 },
})

export default WalletTxDetail
