import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import FontAwesome6 from '@react-native-vector-icons/fontawesome6'
import { toast } from 'sonner-native'

// Theme
import { useTheme } from '../../../theme/ThemeContext'
import type { Theme } from '../../../theme/ThemeContext'
import { useContainerStyles, useTextStyles } from '../../../theme/themeUtils'

// Wallet
import { useWallet } from '../../../wallet/WalletContext'
import { useEffectiveRegistry } from '../../../wallet/registry/appRpcRouter'
import { AllRpcsFailedError } from '../../../wallet/registry/rpcRouter'
import { SolanaExpiredError } from '../../../wallet/solana/tx'
import { displayAmount, formatUnits } from '../../../wallet/chains/units'
import { useWalletAssets } from './walletQueries'
import { OnchainSwapMismatchError, planOnchainSwap } from './onchainSwapModel'
import type { OnchainSwapPlan } from './onchainSwapModel'
import { broadcastOnchainSwap, prepareOnchainSwap, signOnchainSwap, waitForApproval } from './walletSwapActions'
import type { PreparedOnchainSwap, SignedOnchainSwap } from './walletSwapActions'
import useWalletTx from './useWalletTx'
import type { TxPhase } from './useWalletTx'

// API
import { exchangeApi } from '../../../api/exchangeApi'
import { makeIdempotencyKey } from '../../../helpers/idempotency'
import { getNumberLocale } from '../../../i18n'
import type { ExchangeOnchainBuild } from '../../../types/domain'

// UI
import QPButton from '../../../ui/particles/QPButton'
import QPAssetIcon from '../../../ui/particles/QPAssetIcon'
import WalletAuthModal from './components/WalletAuthModal'

// Routes
import { ROUTES } from '../../../routes'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import type { RootStackParamList } from '../../../types/navigation'

type Props = NativeStackScreenProps<RootStackParamList, 'WalletOnchainSwap'>

const KEY = 'crypto.wallet.exchange.onchain.'

const Row = ({ label, value, theme, last }: { label: string, value: string, theme: Theme, last?: boolean }) => (
	<View style={[styles.row, !last && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.colors.border + '60' }]}>
		<Text style={{ color: theme.colors.secondaryText, fontFamily: theme.typography.fontFamily.regular, fontSize: theme.typography.fontSize.sm }}>{label}</Text>
		<Text selectable style={[styles.rowValue, { color: theme.colors.primaryText, fontFamily: theme.typography.fontFamily.medium, fontSize: theme.typography.fontSize.sm }]}>{value}</Text>
	</View>
)

const Notice = ({ theme, icon, color, text }: { theme: Theme, icon: 'shield-halved' | 'triangle-exclamation' | 'circle-info', color: string, text: string }) => (
	<View style={[styles.notice, { backgroundColor: color + '12' }]}>
		<FontAwesome6 name={icon} size={14} color={color} iconStyle="solid" style={styles.noticeIcon} />
		<Text style={[styles.noticeText, { color: theme.colors.primaryText, fontFamily: theme.typography.fontFamily.regular, fontSize: theme.typography.fontSize.sm }]}>{text}</Text>
	</View>
)

const PHASE_LABEL: Partial<Record<TxPhase, string>> = {
	signing: `${KEY}signing`,
	broadcasting: `${KEY}broadcasting`,
}

/** Reintentos del registro en qpweb: la tx YA está en la red, así que se insiste un poco. */
const SUBMIT_ATTEMPTS = 3

/**
 * Confirmación y firma de un swap ON-CHAIN (LI.FI en EVM, Jupiter en Solana).
 *
 * A diferencia del intercambio custodial, aquí no hay depósito: el usuario firma desde su
 * wallet una transacción contra el contrato del agregador. Lo que se pinta sale de la tx YA
 * VERIFICADA (y en Solana, de su simulación). En EVM puede haber un paso previo de permiso
 * (approve EXACTO): se firma, se espera a que se mine y la pantalla pasa sola al swap.
 *
 * Cuando el swap entra en la red se registra en qpweb para seguirlo, y se salta a la misma
 * pantalla de estado que los custodiales.
 */
const WalletOnchainSwap = ({ navigation, route }: Props) => {

	const { quoteId, fromAssetId, toAssetId, amount, expectedOut, providerLabel, serviceFeeBps } = route.params
	const { t } = useTranslation()
	const { theme } = useTheme()
	const textStyles = useTextStyles(theme)
	const containerStyles = useContainerStyles(theme)

	const { addresses } = useWallet()
	const registry = useEffectiveRegistry()
	const { all } = useWalletAssets()
	const from = useMemo(() => all.find(a => a.id === fromAssetId), [all, fromAssetId])
	const to = useMemo(() => all.find(a => a.id === toAssetId), [all, toAssetId])
	const chain = from ? registry.chains[from.chainKey] : undefined

	// --- La ruta, tal y como la manda qpweb (sin fiarse de ella: ver `planOnchainSwap`) ---
	const [build, setBuild] = useState<ExchangeOnchainBuild | null>(null)
	const [buildError, setBuildError] = useState<{ message: string, requote: boolean } | null>(null)
	const fromAddress = from && addresses ? (from.kind === 'solana' ? addresses.sol : addresses.evm) : null
	const toAddress = to && addresses ? (to.kind === 'solana' ? addresses.sol : addresses.evm) : null

	const loadBuild = useCallback(async () => {
		if (!fromAddress || !toAddress) return
		setBuildError(null)
		const result = await exchangeApi.onchainBuild({ quoteId, fromAddress, toAddress })
		if (result.success) {
			if (result.data) { setBuild(result.data) } else { setBuildError({ message: t(`${KEY}errors.build`), requote: false }) }
			return
		}
		const code = (result.details as { code?: string } | undefined)?.code
		setBuildError({
			message: code === 'QUOTE_MOVED' ? t(`${KEY}errors.moved`) : code === 'QUOTE_EXPIRED' ? t(`${KEY}errors.expired`) : (result.error || t(`${KEY}errors.build`)),
			requote: code === 'QUOTE_MOVED' || code === 'QUOTE_EXPIRED',
		})
	}, [quoteId, fromAddress, toAddress, t])
	useEffect(() => { loadBuild() }, [loadBuild])

	const planned = useMemo((): { plan: OnchainSwapPlan | null, error: string | null } => {
		if (!build || !from || !to || !addresses) return { plan: null, error: null }
		try {
			return { plan: planOnchainSwap({ build, from, to, addresses, amount, expectedOut, chainId: chain?.chainId, serviceFeeBps }), error: null }
		} catch (err) {
			return { plan: null, error: err instanceof OnchainSwapMismatchError ? t(`${KEY}errors.verify`) : (err as Error).message }
		}
	}, [build, from, to, addresses, amount, expectedOut, chain?.chainId, serviceFeeBps, t])
	const { plan } = planned

	// --- Firma y difusión: el núcleo común de toda tx de la wallet ---
	const [waitingApproval, setWaitingApproval] = useState(false)
	const idempotencyRef = useRef(makeIdempotencyKey())

	const describeError = useCallback((err: unknown): string => {
		if (err instanceof AllRpcsFailedError) return t(`${KEY}errors.noNodes`)
		if (err instanceof SolanaExpiredError) return t('crypto.wallet.send.errors.expired')
		if (err instanceof Error && /VerifyError$/.test(err.name)) return t(`${KEY}errors.verify`)
		const message = (err as Error)?.message ?? ''
		if (/simulación del swap falló|reverted|revert/i.test(message)) return t(`${KEY}errors.simulation`)
		if (/insufficient funds|insuficiente/i.test(message)) return t('crypto.wallet.send.errors.nodeInsufficient')
		return message ? t(`${KEY}errors.generic`, { message }) : t(`${KEY}errors.unknown`)
	}, [t])

	const prepare = useCallback(() => prepareOnchainSwap(build!, plan!), [build, plan])

	// Se declara antes que `tx` y la lee por ref: `onSent` necesita `tx.refresh` tras un permiso
	const refreshRef = useRef<() => Promise<void>>(async () => {})

	const registerSwap = useCallback(async (txid: string) => {
		for (let attempt = 0; attempt < SUBMIT_ATTEMPTS; attempt++) {
			const result = await exchangeApi.onchainSubmit({ quoteId, txid, fromAddress: fromAddress!, toAddress: toAddress!, idempotencyKey: idempotencyRef.current })
			if (result.success && result.data) {
				navigation.replace(ROUTES.WALLET_EXCHANGE_STATUS, { uuid: result.data.data.uuid })
				return
			}
			if (result.status && result.status < 500 && result.status !== 409) break
			await new Promise<void>(resolve => { setTimeout(resolve, 1500) })
		}
		// La tx YA está en la red: no registrarla no la deshace. Se cuenta como un envío normal
		toast(t(`${KEY}registerFailed`))
		navigation.replace(ROUTES.WALLET_SEND_SUCCESS, { assetId: fromAssetId, txid, amount: String(amount), to: providerLabel })
	}, [quoteId, fromAddress, toAddress, navigation, fromAssetId, amount, providerLabel, t])

	const onSent = useCallback((txid: string, prepared: PreparedOnchainSwap) => {
		if ((prepared.family === 'evm' || prepared.family === 'tron') && prepared.summary.step !== 'swap') {
			// Un permiso: hasta que se mine, el swap no se puede ni simular
			setWaitingApproval(true)
			waitForApproval(prepared.family, prepared.chainKey, txid)
				.then(ok => {
					if (!ok) { toast.error(t(`${KEY}errors.approvalFailed`)) }
					return refreshRef.current()
				})
				.catch(() => refreshRef.current())
				.finally(() => setWaitingApproval(false))
			return
		}
		registerSwap(txid)
	}, [registerSwap, t])

	const tx = useWalletTx<PreparedOnchainSwap, SignedOnchainSwap>({
		ready: !!build && !!plan,
		build: prepare,
		sign: signOnchainSwap,
		submit: broadcastOnchainSwap,
		onSent,
		describeError,
	})
	refreshRef.current = tx.refresh
	const { phase, prepared, error, busy } = tx

	if (!from || !to || !chain) {
		return <View style={[containerStyles.subContainer, styles.center]}><ActivityIndicator color={theme.colors.primary} /></View>
	}

	// --- Vista: todo sale de la tx verificada ---
	const summary = prepared?.summary
	const step = summary?.step ?? 'swap'
	const minOut = plan?.minOut ?? null
	const fmtTo = (units: bigint) => `${displayAmount(formatUnits(units, to.decimals))} ${to.symbol}`
	const nativeFee = (units: bigint) => `${displayAmount(formatUnits(units, chain.native.decimals))} ${chain.native.symbol}`
	const totalSteps = summary ? (summary.remaining + 1) : 1

	const rows: Array<{ label: string, value: string }> = [
		{ label: t(`${KEY}route`), value: providerLabel },
		...(expectedOut !== null ? [{ label: t(`${KEY}receiveEstimated`), value: `${displayAmount(String(expectedOut))} ${to.symbol}` }] : []),
		...(minOut !== null ? [{ label: t(`${KEY}receiveMin`), value: fmtTo(minOut) }] : []),
		...(summary?.simulatedOut != null ? [{ label: t(`${KEY}simulated`), value: fmtTo(summary.simulatedOut) }] : []),
		{ label: t(`${KEY}networkFee`), value: phase === 'preparing' || !summary ? '…' : nativeFee(summary.feeEstimated) },
		...(serviceFeeBps ? [{ label: t(`${KEY}serviceFee`), value: t(`${KEY}serviceFeeValue`, { percent: (serviceFeeBps / 100).toLocaleString(getNumberLocale(), { maximumFractionDigits: 2 }) }) }] : []),
		...(totalSteps > 1 || step !== 'swap' ? [{ label: t(`${KEY}step`), value: t(`${KEY}stepValue`, { current: step === 'swap' ? totalSteps : 1, total: totalSteps }) }] : []),
	]

	const confirmTitle = waitingApproval ? t(`${KEY}waitingApproval`)
		: PHASE_LABEL[phase] ? t(PHASE_LABEL[phase]!)
			: step === 'approve' ? t(`${KEY}approve`, { symbol: from.symbol })
				: step === 'reset' ? t(`${KEY}reset`, { symbol: from.symbol })
					: t(`${KEY}confirm`)
	const authSubtitle = step === 'swap'
		? t(`${KEY}authSwap`, { amount: displayAmount(String(amount)), from: from.symbol, to: to.symbol })
		: t(`${KEY}authApprove`, { symbol: from.symbol, provider: providerLabel })
	const fatal = buildError?.message ?? planned.error

	return (
		<ScrollView style={containerStyles.subContainer} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
			<View style={styles.hero}>
				<View style={styles.pair}>
					<QPAssetIcon logoTick={from.logoTick} networkTick={from.networkTick} size={44} ringColor={theme.colors.background} />
					<FontAwesome6 name="arrow-right" size={14} color={theme.colors.secondaryText} iconStyle="solid" />
					<QPAssetIcon logoTick={to.logoTick} networkTick={to.networkTick} size={44} ringColor={theme.colors.background} />
				</View>
				<Text style={[textStyles.amount, styles.heroAmount, { color: theme.colors.primaryText }]}>
					{`${displayAmount(String(amount))} ${from.symbol}`}
				</Text>
				<Text style={[textStyles.h5, { color: theme.colors.secondaryText }]}>
					{t(`${KEY}heroCaption`, { symbol: to.symbol, network: from.chainName })}
				</Text>
			</View>

			<View style={[styles.card, { backgroundColor: theme.colors.surface }, !theme.isDark && { borderWidth: StyleSheet.hairlineWidth, borderColor: theme.colors.border }]}>
				{rows.map((row, index) => <Row key={row.label} theme={theme} label={row.label} value={row.value} last={index === rows.length - 1} />)}
			</View>

			{plan?.family === 'btc' && !fatal && <Notice theme={theme} icon="circle-info" color={theme.colors.primary} text={t(`${KEY}btcNotice`, { symbol: to.symbol })} />}
			{prepared?.family === 'tron' && prepared.summary.feeEstimated > 0n && !fatal && (
				<>
					<Notice theme={theme} icon="circle-info" color={theme.colors.warning} text={t(`${KEY}tronEnergyNotice`, { amount: nativeFee(prepared.summary.feeEstimated) })} />
					<QPButton title={t(`${KEY}rentEnergy`)} onPress={() => navigation.navigate(ROUTES.WALLET_ENERGY, undefined)} outlined disabled={busy || waitingApproval} />
				</>
			)}
			{step !== 'swap' && !fatal && <Notice theme={theme} icon="circle-info" color={theme.colors.primary} text={t(step === 'reset' ? `${KEY}resetNotice` : `${KEY}approveNotice`, { symbol: from.symbol, provider: providerLabel })} />}
			{!!fatal && <Notice theme={theme} icon="triangle-exclamation" color={theme.colors.danger} text={fatal} />}
			{phase === 'error' && !!error && !fatal && <Notice theme={theme} icon="triangle-exclamation" color={theme.colors.danger} text={error} />}
			<Notice theme={theme} icon="shield-halved" color={theme.colors.secondaryText} text={t(`${KEY}nonCustodial`, { provider: providerLabel })} />

			<View style={styles.spacer} />

			<View style={styles.actions}>
				{fatal ? (
					<QPButton title={t(buildError?.requote ? `${KEY}requote` : `${KEY}retry`)} onPress={buildError?.requote ? () => navigation.goBack() : loadBuild} />
				) : phase === 'error' ? (
					<QPButton title={t(`${KEY}retry`)} onPress={tx.retry} />
				) : (
					<QPButton
						title={confirmTitle}
						onPress={tx.openAuth}
						disabled={phase !== 'ready' || waitingApproval}
						loading={phase === 'preparing' || busy || waitingApproval || (!build && !fatal)}
						testID="onchain-swap-confirm"
					/>
				)}
				<QPButton title={t(`${KEY}back`)} onPress={() => navigation.goBack()} outlined disabled={busy || waitingApproval} />
			</View>

			<WalletAuthModal visible={tx.authVisible} subtitle={authSubtitle} onClose={tx.closeAuth} onAuthorized={tx.onAuthorized} />
		</ScrollView>
	)
}

const styles = StyleSheet.create({
	center: { alignItems: 'center', justifyContent: 'center' },
	// flexGrow + el spacer empujan las acciones al fondo cuando el contenido no llena la pantalla
	content: { gap: 12, paddingTop: 8, paddingBottom: 24, flexGrow: 1 },
	spacer: { flex: 1 },
	hero: { alignItems: 'center', gap: 6, paddingBottom: 8 },
	pair: { flexDirection: 'row', alignItems: 'center', gap: 12 },
	heroAmount: { fontSize: 32, marginTop: 8, textAlign: 'center' },
	card: { borderRadius: 14, paddingHorizontal: 14 },
	row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12, paddingVertical: 12 },
	rowValue: { flex: 1, textAlign: 'right' },
	notice: { flexDirection: 'row', gap: 10, padding: 12, borderRadius: 12, alignItems: 'flex-start' },
	noticeIcon: { marginTop: 2 },
	noticeText: { flex: 1 },
	actions: { gap: 10, marginTop: 8 },
})

export default WalletOnchainSwap
