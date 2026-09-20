import { useCallback, useMemo } from 'react'
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import FontAwesome6 from '@react-native-vector-icons/fontawesome6'

// Theme
import { useTheme } from '../../../theme/ThemeContext'
import type { Theme } from '../../../theme/ThemeContext'
import { useContainerStyles, useTextStyles } from '../../../theme/themeUtils'

// Wallet
import { useWallet } from '../../../wallet/WalletContext'
import { useEffectiveRegistry } from '../../../wallet/registry/appRpcRouter'
import { addressForKind, nativeAssetId } from '../../../wallet/assets'
import { displayAmount, formatUnits } from '../../../wallet/chains/units'
import { AllRpcsFailedError } from '../../../wallet/registry/rpcRouter'
import { TronVerifyError } from '../../../wallet/tron/tx'
import { EvmVerifyError } from '../../../wallet/evm/tx'
import { StacksVerifyError } from '../../../wallet/stacks/tx'
import { SolanaExpiredError, SolanaVerifyError } from '../../../wallet/solana/tx'
import { useWalletAssets } from './walletQueries'
import type { FeeTier, PreparedSend } from './walletSendActions'
import { sendFeeState } from './sendConfirmModel'
import useWalletSendTx from './useWalletSendTx'
import type { SendPhase } from './useWalletSendTx'
import { shortAddress } from './walletFormat'

// UI
import QPButton from '../../../ui/particles/QPButton'
import QPPressable from '../../../ui/particles/QPPressable'
import AssetIcon from './components/AssetIcon'
import WalletAuthModal from './components/WalletAuthModal'

// Navigation
import { ROUTES } from '../../../routes'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import type { RootStackParamList } from '../../../types/navigation'

type Props = NativeStackScreenProps<RootStackParamList, 'WalletSendConfirm'>

const Row = ({ label, value, theme, mono, last }: { label: string, value: string, theme: Theme, mono?: boolean, last?: boolean }) => (
	<View style={[styles.row, !last && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.colors.border + '60' }]}>
		<Text style={{ color: theme.colors.secondaryText, fontFamily: theme.typography.fontFamily.regular, fontSize: theme.typography.fontSize.sm }}>{label}</Text>
		<Text selectable style={[styles.rowValue, { color: theme.colors.primaryText, fontFamily: theme.typography.fontFamily.medium, fontSize: mono ? theme.typography.fontSize.xs : theme.typography.fontSize.sm }]}>{value}</Text>
	</View>
)

/**
 * Enviar, paso 2 (TRON y EVM): la app construye la tx, la VERIFICA (lo que
 * se muestra sale de la tx, no del formulario), estima la fee en el nativo
 * de la red y, tras el gate de PIN/biometría, firma y difunde.
 *
 * Idempotencia local: la firma se retiene en un ref solo para re-difundir
 * la MISMA tx (mismo hash) si la difusión falló por red; un doble tap no
 * firma dos veces. Si la tx tiene vigencia (TRON, 60s) y expiró, se
 * reconstruye desde cero.
 */
const WalletSendConfirm = ({ navigation, route }: Props) => {

	const { assetId, to, amount } = route.params
	const { t } = useTranslation()
	const { theme } = useTheme()
	const textStyles = useTextStyles(theme)
	const containerStyles = useContainerStyles(theme)

	const { addresses } = useWallet()
	const registry = useEffectiveRegistry()
	const { all } = useWalletAssets()
	const asset = useMemo(() => all.find(a => a.id === assetId), [all, assetId])
	const chain = asset ? registry.chains[asset.chainKey] : undefined
	const native = useMemo(() => (asset ? all.find(a => a.id === nativeAssetId(asset.chainKey)) : undefined), [all, asset])

	const describe = useCallback((err: unknown) => describeError(err, t), [t])
	const onSent = useCallback((txid: string) => {
		navigation.replace(ROUTES.WALLET_SEND_SUCCESS, { assetId, txid, amount, to })
	}, [navigation, assetId, amount, to])

	const tx = useWalletSendTx({ asset, chain, addresses, to, amount, assetId, onSent, describeError: describe })
	const { phase, prepared, error, feeTier, busy } = tx

	// Cuánto exige la red y si el nativo alcanza para pagarlo
	const { feeEstimated, feeMax, sentNative, feeRequired, insufficientNative } = sendFeeState({
		prepared,
		isNativeAsset: asset?.contract === null,
		nativeAmount: native?.amount,
		nativeDecimals: chain?.native.decimals ?? 18,
		amount,
	})

	if (!asset || !chain) {
		return <View style={[containerStyles.subContainer, styles.center]}><ActivityIndicator color={theme.colors.primary} /></View>
	}

	const nativeDecimals = chain.native.decimals
	const nativeSymbol = chain.native.symbol
	// Lo que se muestra sale de la tx CONSTRUIDA, no del formulario
	const verifiedAmount = prepared ? formatUnits(prepared.summary.amount, asset.decimals) : amount
	const fee = (value: bigint) => t('crypto.wallet.send.feeNative', { amount: displayAmount(formatUnits(value, nativeDecimals)), symbol: nativeSymbol })
	const authSubtitle = t('crypto.wallet.auth.sendSubtitle', { amount: displayAmount(verifiedAmount), symbol: asset.symbol, address: shortAddress(to) })
	const total = asset.contract === null
		? fee(sentNative + feeEstimated)
		: `${displayAmount(verifiedAmount)} ${asset.symbol} + ${fee(feeEstimated)}`

	return (
		<ScrollView style={containerStyles.subContainer} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>

			<View style={styles.hero}>
				<AssetIcon logoTick={asset.logoTick} networkTick={asset.networkTick} size={56} ringColor={theme.colors.background} />
				<Text style={[textStyles.amount, styles.heroAmount, { color: theme.colors.primaryText }]}>−{displayAmount(verifiedAmount)} {asset.symbol}</Text>
				<Text style={[textStyles.h5, { color: theme.colors.secondaryText }]}>{t('crypto.wallet.send.viaNetwork', { network: asset.chainName })}</Text>
			</View>

			<SendSummaryCard
				theme={theme}
				to={to}
				from={addresses ? addressForKind(addresses, asset.kind) : ''}
				phase={phase}
				prepared={prepared}
				feeEstimated={feeEstimated}
				feeMax={feeMax}
				feeTier={feeTier}
				onPickTier={tx.setFeeTier}
				busy={busy}
				fee={fee}
				total={total}
			/>

			<SendNotices
				theme={theme}
				prepared={prepared}
				symbol={asset.symbol}
				fee={fee}
				feeEstimated={feeEstimated}
				insufficientNative={insufficientNative}
				needed={displayAmount(formatUnits(feeRequired + sentNative, nativeDecimals))}
				have={displayAmount(native?.amount ?? '0')}
				nativeSymbol={nativeSymbol}
				error={phase === 'error' ? error : null}
			/>

			<Notice theme={theme} icon="shield-halved" color={theme.colors.secondaryText} text={t('crypto.wallet.send.irreversible')} />

			<View style={styles.spacer} />

			<View style={styles.actions}>
				{phase === 'error' ? (
					<QPButton title={t('crypto.wallet.send.retry')} onPress={tx.retry} />
				) : (
					<QPButton
						title={t(CONFIRM_LABEL[phase] ?? 'crypto.wallet.send.confirm')}
						onPress={tx.openAuth}
						disabled={phase !== 'ready' || insufficientNative}
						loading={phase === 'preparing' || busy}
					/>
				)}
				<QPButton title={t('crypto.wallet.send.back')} onPress={() => navigation.goBack()} outlined disabled={busy} />
			</View>

			<WalletAuthModal visible={tx.authVisible} subtitle={authSubtitle} onClose={tx.closeAuth} onAuthorized={tx.onAuthorized} />
		</ScrollView>
	)
}

/** Texto del botón principal según la fase; el resto de fases confirma. */
const CONFIRM_LABEL: Partial<Record<SendPhase, string>> = {
	signing: 'crypto.wallet.send.signing',
	broadcasting: 'crypto.wallet.send.broadcasting',
}

/**
 * Tarjeta de resumen: destino, origen, comisión (con sus niveles si la red los ofrece),
 * techo autorizado cuando lo hay y total a debitar.
 */
const SendSummaryCard = ({ theme, to, from, phase, prepared, feeEstimated, feeMax, feeTier, onPickTier, busy, fee, total }: {
	theme: Theme, to: string, from: string, phase: SendPhase, prepared: PreparedSend | null, feeEstimated: bigint,
	feeMax: bigint | null, feeTier: FeeTier, onPickTier: (tier: FeeTier) => void, busy: boolean, fee: (value: bigint) => string, total: string
}) => {

	const { t } = useTranslation()
	const networkFee = phase === 'preparing' ? '…' : feeEstimated === 0n ? t('crypto.wallet.send.feeFree') : fee(feeEstimated)
	// El techo solo se muestra cuando de verdad difiere de lo estimado (EVM)
	const showFeeLimit = feeMax !== null && feeMax > feeEstimated

	return (
		<View style={[styles.card, { backgroundColor: theme.colors.surface }, !theme.isDark && { borderWidth: StyleSheet.hairlineWidth, borderColor: theme.colors.border }]}>
			<Row theme={theme} label={t('crypto.wallet.send.toLabel')} value={to} mono />
			<Row theme={theme} label={t('crypto.wallet.send.fromLabel')} value={from} mono />
			<Row theme={theme} label={t('crypto.wallet.send.networkFee')} value={networkFee} />
			<SendFeeTiers prepared={prepared} feeTier={feeTier} onPick={onPickTier} busy={busy} fee={fee} theme={theme} />

			{showFeeLimit && <Row theme={theme} label={t('crypto.wallet.send.feeLimit')} value={fee(feeMax)} />}
			<Row theme={theme} label={t('crypto.wallet.send.total')} value={total} last />
		</View>
	)
}

/** Niveles de comisión que ofrece la red (lento/normal/rápido), si los ofrece. */
const SendFeeTiers = ({ prepared, feeTier, onPick, busy, fee, theme }: { prepared: PreparedSend | null, feeTier: FeeTier, onPick: (tier: FeeTier) => void, busy: boolean, fee: (value: bigint) => string, theme: Theme }) => {

	const { t } = useTranslation()
	const options = prepared?.summary.feeOptions ?? []
	if (options.length === 0) return null

	return (
		<View style={styles.tiers}>
			{options.map(option => {
				const selected = option.tier === feeTier
				return (
					<QPPressable
						key={option.tier}
						onPress={() => { if (!busy && option.tier !== feeTier) onPick(option.tier) }}
						style={[styles.tier, selected ? { backgroundColor: theme.colors.primary } : { backgroundColor: theme.colors.elevation }]}
						accessibilityRole="button"
						accessibilityState={{ selected }}
					>
						<Text style={{ color: selected ? theme.colors.buttonText : theme.colors.primaryText, fontFamily: theme.typography.fontFamily.semiBold, fontSize: theme.typography.fontSize.xs }}>
							{t(`crypto.wallet.send.feeTiers.${option.tier}`)}
						</Text>
						<Text style={{ color: selected ? theme.colors.buttonText : theme.colors.secondaryText, fontFamily: theme.typography.fontFamily.regular, fontSize: theme.typography.fontSize.xs }} numberOfLines={1}>
							{fee(option.feeEstimated)}
						</Text>
						{option.etaMinutes !== null && (
							<Text style={{ color: selected ? theme.colors.buttonText : theme.colors.tertiaryText, fontFamily: theme.typography.fontFamily.regular, fontSize: theme.typography.fontSize.xs }}>
								{t('crypto.wallet.send.feeEta', { minutes: option.etaMinutes })}
							</Text>
						)}
					</QPPressable>
				)
			})}
		</View>
	)
}

/**
 * Lo que conviene saber antes de firmar: peculiaridades de la red (barrido de BTC, alta de
 * cuenta), falta de nativo para la comisión y el error del último intento.
 */
const SendNotices = ({ theme, prepared, symbol, fee, feeEstimated, insufficientNative, needed, have, nativeSymbol, error }: {
	theme: Theme, prepared: PreparedSend | null, symbol: string, fee: (value: bigint) => string, feeEstimated: bigint,
	insufficientNative: boolean, needed: string, have: string, nativeSymbol: string, error: string | null
}) => {

	const { t } = useTranslation()

	return (
		<>
			{prepared?.kind === 'btc' && prepared.inner.selection.sendAll && (
				<Notice theme={theme} icon="circle-info" color={theme.colors.primary} text={t('crypto.wallet.send.btcSendAll', { fee: displayAmount(formatUnits(feeEstimated, 8)) })} />
			)}
			{!!prepared?.summary.activatesAccount && (
				<Notice theme={theme} icon="circle-info" color={theme.colors.primary} text={t('crypto.wallet.send.activatesAccount')} />
			)}
			{!!prepared?.summary.accountCreationFee && (
				<Notice theme={theme} icon="circle-info" color={theme.colors.primary} text={t('crypto.wallet.send.createsTokenAccount', { symbol, fee: fee(prepared.summary.accountCreationFee) })} />
			)}
			{insufficientNative && (
				<Notice theme={theme} icon="triangle-exclamation" color={theme.colors.danger} text={t('crypto.wallet.send.errors.noGasForFee', { needed, have, symbol: nativeSymbol })} />
			)}
			{!!error && (
				<Notice theme={theme} icon="triangle-exclamation" color={theme.colors.danger} text={error} />
			)}
		</>
	)
}

const Notice = ({ theme, icon, color, text }: { theme: Theme, icon: 'circle-info' | 'triangle-exclamation' | 'shield-halved', color: string, text: string }) => (
	<View style={[styles.notice, { backgroundColor: color + '12' }]}>
		<FontAwesome6 name={icon} size={14} color={color} iconStyle="solid" style={styles.noticeIcon} />
		<Text style={[styles.noticeText, { color: theme.colors.primaryText, fontFamily: theme.typography.fontFamily.regular, fontSize: theme.typography.fontSize.sm }]}>{text}</Text>
	</View>
)

/** Mensaje legible según la capa que falló (verificación, nodos, nodo concreto). */
const describeError = (err: unknown, t: (key: string, opts?: Record<string, unknown>) => string): string => {
	if (err instanceof TronVerifyError || err instanceof EvmVerifyError || err instanceof StacksVerifyError || err instanceof SolanaVerifyError) return t('crypto.wallet.send.errors.verifyFailed')
	if (err instanceof SolanaExpiredError) return t('crypto.wallet.send.errors.expired')
	if (err instanceof AllRpcsFailedError) return t('crypto.wallet.send.errors.noNodes')
	const message = (err as Error)?.message ?? ''
	if (/balance is not sufficient|insufficient funds|exceeds balance|insufficient/i.test(message)) return t('crypto.wallet.send.errors.nodeInsufficient')
	return message ? t('crypto.wallet.send.errors.generic', { message }) : t('crypto.wallet.send.errors.unknown')
}

const styles = StyleSheet.create({
	center: { alignItems: 'center', justifyContent: 'center' },
	// flexGrow + el spacer empujan las acciones al fondo cuando el contenido no llena la pantalla
	content: { gap: 12, paddingTop: 8, paddingBottom: 24, flexGrow: 1 },
	spacer: { flex: 1 },
	hero: { alignItems: 'center', gap: 6, paddingBottom: 8 },
	heroAmount: { fontSize: 32, marginTop: 8 },
	card: { borderRadius: 14, paddingHorizontal: 14 },
	row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12, paddingVertical: 12 },
	rowValue: { flex: 1, textAlign: 'right' },
	tiers: { flexDirection: 'row', gap: 8, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'transparent' },
	tier: { flex: 1, borderRadius: 12, borderCurve: 'continuous', paddingVertical: 8, paddingHorizontal: 6, alignItems: 'center', gap: 2 },
	notice: { flexDirection: 'row', gap: 10, padding: 12, borderRadius: 12, alignItems: 'flex-start' },
	noticeIcon: { marginTop: 2 },
	noticeText: { flex: 1 },
	actions: { gap: 10, marginTop: 8 },
})

export default WalletSendConfirm
