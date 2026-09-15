import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner-native'
import { useQueryClient } from '@tanstack/react-query'
import FontAwesome6 from '@react-native-vector-icons/fontawesome6'

// Theme
import { useTheme } from '../../../theme/ThemeContext'
import type { Theme } from '../../../theme/ThemeContext'
import { useContainerStyles, useTextStyles } from '../../../theme/themeUtils'

// Wallet
import { useWallet } from '../../../wallet/WalletContext'
import { useEffectiveRegistry } from '../../../wallet/registry/appRpcRouter'
import { addressForKind, nativeAssetId } from '../../../wallet/assets'
import { displayAmount, formatUnits, parseUnits } from '../../../wallet/chains/units'
import { AllRpcsFailedError } from '../../../wallet/registry/rpcRouter'
import { TronVerifyError } from '../../../wallet/tron/tx'
import { EvmVerifyError } from '../../../wallet/evm/tx'
import { refreshHistoryAfterSend, useWalletAssets, WALLET_BALANCES_KEY } from './walletQueries'
import { broadcastSigned, prepareSend, signPrepared } from './walletSendActions'
import type { FeeTier, PreparedSend, SignedSend } from './walletSendActions'
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

type Phase = 'preparing' | 'ready' | 'signing' | 'broadcasting' | 'error'

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
	const queryClient = useQueryClient()

	const { addresses } = useWallet()
	const registry = useEffectiveRegistry()
	const { all } = useWalletAssets()
	const asset = useMemo(() => all.find(a => a.id === assetId), [all, assetId])
	const chain = asset ? registry.chains[asset.chainKey] : undefined
	const native = useMemo(() => (asset ? all.find(a => a.id === nativeAssetId(asset.chainKey)) : undefined), [all, asset])

	const [phase, setPhase] = useState<Phase>('preparing')
	const [prepared, setPrepared] = useState<PreparedSend | null>(null)
	const [error, setError] = useState<string | null>(null)
	const [authVisible, setAuthVisible] = useState(false)
	// Nivel de comisión elegido: cambiarlo reconstruye la tx (nuevo gas/tasa, misma intención)
	const [feeTier, setFeeTier] = useState<FeeTier>('normal')
	const signedRef = useRef<SignedSend | null>(null)
	const inFlightRef = useRef(false)

	const prepare = useCallback(async () => {
		if (!asset || !addresses || !chain) return
		setPhase('preparing'); setError(null); signedRef.current = null
		try {
			const intent = { chainKey: asset.chainKey, from: addressForKind(addresses, asset.kind), fromPublicKey: addresses.stxPublicKey, to, amount: parseUnits(amount, asset.decimals), contract: asset.contract }
			setPrepared(await prepareSend(chain, intent, feeTier))
			setPhase('ready')
		} catch (err) {
			setPhase('error')
			setError(describeError(err, t))
		}
	}, [asset, addresses, chain, to, amount, feeTier, t])

	useEffect(() => { prepare() }, [prepare])

	// Nativo disponible para la fee (si se envía el propio nativo, descontando lo enviado)
	const nativeDecimals = chain?.native.decimals ?? 18
	const nativeSymbol = chain?.native.symbol ?? ''
	const nativeBalance = native ? parseUnitsSafe(native.amount, nativeDecimals) : 0n
	const feeEstimated = prepared?.summary.feeEstimated ?? 0n
	const feeMax = prepared?.summary.feeMax ?? null
	const sentNative = asset?.contract === null ? (prepared?.summary.amount ?? parseUnitsSafe(amount, nativeDecimals)) : 0n
	// En EVM la tx exige tener el MÁXIMO autorizado, aunque luego cobre menos
	const feeRequired = prepared?.kind === 'evm' ? (feeMax ?? feeEstimated) : feeEstimated
	const insufficientNative = !!prepared && nativeBalance < feeRequired + sentNative

	const isExpired = useCallback((current: PreparedSend) => current.summary.expiresAt !== null && current.summary.expiresAt <= Date.now(), [])

	const finish = useCallback((txid: string) => {
		queryClient.invalidateQueries({ queryKey: WALLET_BALANCES_KEY })
		// Solo el historial del activo enviado, diferido y saltando la caché del proxy
		refreshHistoryAfterSend(queryClient, assetId)
		navigation.replace(ROUTES.WALLET_SEND_SUCCESS, { assetId, txid, amount, to })
	}, [queryClient, navigation, assetId, amount, to])

	const broadcast = useCallback(async (current: PreparedSend, signed: SignedSend) => {
		setPhase('broadcasting')
		try {
			const result = await broadcastSigned(current, signed)
			if (result.duplicate) toast(t('crypto.wallet.send.alreadySent'))
			finish(result.txid)
		} catch (err) {
			setPhase('error')
			setError(describeError(err, t))
		}
	}, [finish, t])

	const onAuthorized = useCallback(async () => {
		setAuthVisible(false)
		if (!prepared || inFlightRef.current) return
		inFlightRef.current = true
		try {
			if (isExpired(prepared)) { await prepare(); return }
			setPhase('signing')
			// Un tick para que el spinner pinte antes del PBKDF2 (síncrono, ~1-2s en Hermes)
			await new Promise<void>(resolve => setTimeout(resolve, 30))
			const signed = signedRef.current ?? await signPrepared(prepared)
			signedRef.current = signed
			await broadcast(prepared, signed)
		} catch (err) {
			setPhase('error')
			setError(describeError(err, t))
		} finally {
			inFlightRef.current = false
		}
	}, [prepared, prepare, broadcast, isExpired, t])

	const retry = useCallback(() => {
		// Firmada y aún vigente: re-difundir la MISMA tx; si no, empezar de cero
		if (prepared && signedRef.current && !isExpired(prepared)) {
			if (inFlightRef.current) return
			inFlightRef.current = true
			broadcast(prepared, signedRef.current).finally(() => { inFlightRef.current = false })
			return
		}
		prepare()
	}, [prepared, broadcast, prepare, isExpired])

	if (!asset || !chain) {
		return <View style={[containerStyles.subContainer, styles.center]}><ActivityIndicator color={theme.colors.primary} /></View>
	}

	const verifiedAmount = prepared ? formatUnits(prepared.summary.amount, asset.decimals) : amount
	const fee = (value: bigint) => t('crypto.wallet.send.feeNative', { amount: displayAmount(formatUnits(value, nativeDecimals)), symbol: nativeSymbol })
	const busy = phase === 'signing' || phase === 'broadcasting'
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

			<View style={[styles.card, { backgroundColor: theme.colors.surface }, !theme.isDark && { borderWidth: StyleSheet.hairlineWidth, borderColor: theme.colors.border }]}>
				<Row theme={theme} label={t('crypto.wallet.send.toLabel')} value={to} mono />
				<Row theme={theme} label={t('crypto.wallet.send.fromLabel')} value={addresses ? addressForKind(addresses, asset.kind) : ''} mono />
				<Row theme={theme} label={t('crypto.wallet.send.networkFee')} value={phase === 'preparing' ? '…' : feeEstimated === 0n ? t('crypto.wallet.send.feeFree') : fee(feeEstimated)} />
				{!!prepared && prepared.summary.feeOptions.length > 0 && (
					<View style={styles.tiers}>
						{prepared.summary.feeOptions.map(option => {
							const selected = option.tier === feeTier
							return (
								<QPPressable
									key={option.tier}
									onPress={() => { if (!busy && option.tier !== feeTier) setFeeTier(option.tier) }}
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
				)}
				{feeMax !== null && feeMax > feeEstimated && (
					<Row theme={theme} label={t('crypto.wallet.send.feeLimit')} value={fee(feeMax)} />
				)}
				<Row theme={theme} label={t('crypto.wallet.send.total')} value={total} last />
			</View>

			{prepared?.kind === 'btc' && prepared.inner.selection.sendAll && (
				<Notice theme={theme} icon="circle-info" color={theme.colors.primary} text={t('crypto.wallet.send.btcSendAll', { fee: displayAmount(formatUnits(feeEstimated, 8)) })} />
			)}
			{!!prepared?.summary.activatesAccount && (
				<Notice theme={theme} icon="circle-info" color={theme.colors.primary} text={t('crypto.wallet.send.activatesAccount')} />
			)}
			{insufficientNative && (
				<Notice theme={theme} icon="triangle-exclamation" color={theme.colors.danger} text={t('crypto.wallet.send.errors.noGasForFee', { needed: displayAmount(formatUnits(feeRequired + sentNative, nativeDecimals)), have: displayAmount(native?.amount ?? '0'), symbol: nativeSymbol })} />
			)}
			{phase === 'error' && !!error && (
				<Notice theme={theme} icon="triangle-exclamation" color={theme.colors.danger} text={error} />
			)}

			<Notice theme={theme} icon="shield-halved" color={theme.colors.secondaryText} text={t('crypto.wallet.send.irreversible')} />

			<View style={styles.spacer} />

			<View style={styles.actions}>
				{phase === 'error' ? (
					<QPButton title={t('crypto.wallet.send.retry')} onPress={retry} />
				) : (
					<QPButton
						title={phase === 'signing' ? t('crypto.wallet.send.signing') : phase === 'broadcasting' ? t('crypto.wallet.send.broadcasting') : t('crypto.wallet.send.confirm')}
						onPress={() => setAuthVisible(true)}
						disabled={phase !== 'ready' || insufficientNative}
						loading={phase === 'preparing' || busy}
					/>
				)}
				<QPButton title={t('crypto.wallet.send.back')} onPress={() => navigation.goBack()} outlined disabled={busy} />
			</View>

			<WalletAuthModal visible={authVisible} subtitle={authSubtitle} onClose={() => setAuthVisible(false)} onAuthorized={onAuthorized} />
		</ScrollView>
	)
}

const Notice = ({ theme, icon, color, text }: { theme: Theme, icon: 'circle-info' | 'triangle-exclamation' | 'shield-halved', color: string, text: string }) => (
	<View style={[styles.notice, { backgroundColor: color + '12' }]}>
		<FontAwesome6 name={icon} size={14} color={color} iconStyle="solid" style={styles.noticeIcon} />
		<Text style={[styles.noticeText, { color: theme.colors.primaryText, fontFamily: theme.typography.fontFamily.regular, fontSize: theme.typography.fontSize.sm }]}>{text}</Text>
	</View>
)

const parseUnitsSafe = (decimal: string, decimals: number): bigint => {
	try { return parseUnits(decimal, decimals) } catch { return 0n }
}

/** Mensaje legible según la capa que falló (verificación, nodos, nodo concreto). */
const describeError = (err: unknown, t: (key: string, opts?: Record<string, unknown>) => string): string => {
	if (err instanceof TronVerifyError || err instanceof EvmVerifyError) return t('crypto.wallet.send.errors.verifyFailed')
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
