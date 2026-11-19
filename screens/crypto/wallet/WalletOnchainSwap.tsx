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
import { getAppRpcRouter, useEffectiveRegistry } from '../../../wallet/registry/appRpcRouter'
import { computeTronBurnBreakdown, getTronResources, TRON_TX_RPC } from '../../../wallet/tron/tx'
import { rentVolumeFor } from '../../../wallet/tron/energy'
import { useAuth } from '../../../auth/AuthContext'
import { addressForKind } from '../../../wallet/assets'
import { AllRpcsFailedError } from '../../../wallet/registry/rpcRouter'
import { EvmRouteExpiredError, EvmUnsupportedRouteError } from '../../../wallet/evm/lifi'
import { EvmVerifyError, isGasPriceOutOfRange, isInsufficientFunds } from '../../../wallet/evm/tx'
import { SolanaExpiredError } from '../../../wallet/solana/tx'
import { displayAmount, formatUnits } from '../../../wallet/chains/units'
import { useWalletAssets } from './walletQueries'
import { estimatePrice, useEnergyPricesQuery } from './energyQueries'
import { OnchainSwapMismatchError, planOnchainSwap, routeForPrepare } from './onchainSwapModel'
import type { OnchainRoute, OnchainSwapPlan } from './onchainSwapModel'
import { broadcastOnchainSwap, lookupOnchainSwap, prepareOnchainSwap, signOnchainSwap, waitForApproval } from './walletSwapActions'
import type { PreparedOnchainSwap, SignedOnchainSwap } from './walletSwapActions'
import useWalletTx, { TxExpiredError, TxUnconfirmedError } from './useWalletTx'
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
import EnergyRentModal from './components/EnergyRentModal'
import usePendingEnergyOrder from './usePendingEnergyOrder'

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

const Notice = ({ theme, icon, color, text }: { theme: Theme, icon: 'shield-halved' | 'triangle-exclamation' | 'circle-info' | 'circle-check' | 'bolt', color: string, text: string }) => (
	<View style={[styles.notice, { backgroundColor: color + '12' }]}>
		<FontAwesome6 name={icon} size={14} color={color} iconStyle="solid" style={styles.noticeIcon} />
		<Text style={[styles.noticeText, { color: theme.colors.primaryText, fontFamily: theme.typography.fontFamily.regular, fontSize: theme.typography.fontSize.sm }]}>{text}</Text>
	</View>
)

const PHASE_LABEL: Partial<Record<TxPhase, string>> = {
	signing: `${KEY}signing`,
	broadcasting: `${KEY}broadcasting`,
	// Ya en la red: mientras se registra (o se espera el permiso) el botón sigue ocupado
	sent: `${KEY}broadcasting`,
}

/** Reintentos del registro en qpweb: la tx YA está en la red, así que se insiste un poco. */
const SUBMIT_ATTEMPTS = 3

/** Espera a ver la energía recién alquilada en el nodo (mismos tiempos que el envío). */
const ENERGY_WAIT_DEADLINE_MS = 45_000
const ENERGY_WAIT_INTERVAL_MS = 2_000

/** Qué se dice mientras la energía alquilada no se ve: recién comprada, lenta, o comprada antes de entrar. */
const ENERGY_WAIT_COPY = {
	waiting: 'crypto.wallet.send.energy.waiting',
	slow: 'crypto.wallet.send.energy.waitingSlow',
	pending: 'crypto.wallet.send.energy.pendingOrder',
} as const

/** qpweb no dio la ruta. `requote`: la cotización caducó o el precio se movió, hay que volver a cotizar. */
class RouteBuildError extends Error {
	requote: boolean
	constructor(message: string, requote: boolean) { super(message); this.name = 'RouteBuildError'; this.requote = requote }
}

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
	// La red de destino, también del registry de la wallet: contra ella se decodifica la ruta
	const toChain = to ? registry.chains[to.chainKey] : undefined

	// --- La ruta, tal y como la manda qpweb (sin fiarse de ella: ver `planOnchainSwap`) ---
	// Con el momento en que llegó: una ruta EVM vieja no se firma (O-06). Va también por ref,
	// para que quien prepara lea la última sin que su identidad cambie con cada ruta nueva
	const [swapRoute, setSwapRoute] = useState<OnchainRoute | null>(null)
	const routeRef = useRef<OnchainRoute | null>(null)
	const applyRoute = useCallback((next: OnchainRoute) => { routeRef.current = next; setSwapRoute(next) }, [])
	const build = swapRoute?.build ?? null
	const [buildError, setBuildError] = useState<{ message: string, requote: boolean } | null>(null)
	// Cada lado con la dirección de SU familia: SunSwap (TRON) y THORChain (BTC) también son
	// on-chain, y mandar la EVM ahí hacía que qpweb rechazase el destino por formato
	const fromAddress = from && addresses ? addressForKind(addresses, from.kind) : null
	const toAddress = to && addresses ? addressForKind(addresses, to.kind) : null

	/** Pide la ruta a qpweb. Lanza `RouteBuildError` con lo que hay que enseñar. */
	const fetchRoute = useCallback(async (): Promise<OnchainRoute> => {
		const result = await exchangeApi.onchainBuild({ quoteId, fromAddress: fromAddress!, toAddress: toAddress! })
		if (result.success) {
			if (result.data) return { build: result.data, at: Date.now() }
			throw new RouteBuildError(t(`${KEY}errors.build`), false)
		}
		const code = (result.details as { code?: string } | undefined)?.code
		throw new RouteBuildError(
			code === 'QUOTE_MOVED' ? t(`${KEY}errors.moved`) : code === 'QUOTE_EXPIRED' ? t(`${KEY}errors.expired`) : (result.error || t(`${KEY}errors.build`)),
			code === 'QUOTE_MOVED' || code === 'QUOTE_EXPIRED',
		)
	}, [quoteId, fromAddress, toAddress, t])
	const buildErrorOf = useCallback((err: unknown) => (err instanceof RouteBuildError
		? { message: err.message, requote: err.requote }
		: { message: t(`${KEY}errors.build`), requote: false }), [t])

	const loadBuild = useCallback(async () => {
		if (!fromAddress || !toAddress) return
		setBuildError(null)
		try { applyRoute(await fetchRoute()) } catch (err) { setBuildError(buildErrorOf(err)) }
	}, [fromAddress, toAddress, fetchRoute, applyRoute, buildErrorOf])
	useEffect(() => { loadBuild() }, [loadBuild])

	/** De la ruta a la intención verificada. Lanza si la ruta no dice lo que el usuario confirmó. */
	const planFor = useCallback((current: ExchangeOnchainBuild) => planOnchainSwap({
		build: current, from: from!, to: to!, addresses: addresses!, amount, expectedOut, chainId: chain?.chainId, toChainId: toChain?.chainId, serviceFeeBps,
	}), [from, to, addresses, amount, expectedOut, chain?.chainId, toChain?.chainId, serviceFeeBps])

	const planned = useMemo((): { plan: OnchainSwapPlan | null, error: string | null } => {
		if (!build || !from || !to || !addresses) return { plan: null, error: null }
		try {
			return { plan: planFor(build), error: null }
		} catch (err) {
			// Una ruta por una función que la wallet no sabe leer no es un engaño: es que no se puede comprobar
			if (err instanceof EvmUnsupportedRouteError) return { plan: null, error: t(`${KEY}errors.unsupportedRoute`) }
			if (err instanceof EvmRouteExpiredError) return { plan: null, error: t(`${KEY}errors.expired`) }
			return { plan: null, error: err instanceof OnchainSwapMismatchError || err instanceof EvmVerifyError ? t(`${KEY}errors.verify`) : (err as Error).message }
		}
	}, [build, from, to, addresses, planFor, t])
	const { plan } = planned

	// --- Firma y difusión: el núcleo común de toda tx de la wallet ---
	const [waitingApproval, setWaitingApproval] = useState(false)
	// Hubo un permiso y ya se minó: el paso que queda es el swap (se dice, para no desorientar)
	const [approved, setApproved] = useState(false)
	const idempotencyRef = useRef(makeIdempotencyKey())

	const describeError = useCallback((err: unknown): string => {
		// Ningún nodo dio un precio de gas razonable: no es que no haya nodos
		if (isGasPriceOutOfRange(err)) return t('crypto.wallet.send.errors.feeTooHigh')
		// El saldo no alcanza para el importe más la comisión: tampoco es que no haya nodos
		// Pagando con un token, bajar el importe no arregla nada: lo que falta es el nativo de ESA red
		if (isInsufficientFunds(err)) {
			return from?.contract && chain
				? t(`${KEY}errors.noGasForSwap`, { symbol: chain.native.symbol, network: from.chainName })
				: t(`${KEY}errors.insufficientFunds`)
		}
		if (err instanceof AllRpcsFailedError) return t(`${KEY}errors.noNodes`)
		if (err instanceof SolanaExpiredError) return t('crypto.wallet.send.errors.expired')
		if (err instanceof TxExpiredError) return t('crypto.wallet.send.errors.expired')
		if (err instanceof TxUnconfirmedError) return t('crypto.wallet.send.errors.unconfirmed')
		if (err instanceof EvmUnsupportedRouteError) return t(`${KEY}errors.unsupportedRoute`)
		// La ruta llevaba una orden con fecha y se ha hecho vieja mientras se esperaba (el permiso, el PIN)
		if (err instanceof EvmRouteExpiredError) return t(`${KEY}errors.expired`)
		if (err instanceof Error && /VerifyError$/.test(err.name)) return t(`${KEY}errors.verify`)
		const message = (err as Error)?.message ?? ''
		if (/simulación del swap falló|reverted|revert/i.test(message)) return t(`${KEY}errors.simulation`)
		if (/insufficient funds|insuficiente/i.test(message)) return t('crypto.wallet.send.errors.nodeInsufficient')
		return message ? t(`${KEY}errors.generic`, { message }) : t(`${KEY}errors.unknown`)
	}, [t, from, chain])

	const prepare = useCallback(async () => {
		// Una ruta EVM vieja no se vuelve a preparar (O-06): se pide otra, que pasa las mismas
		// comprobaciones que la primera, y la pantalla pasa a enseñar la nueva. Si qpweb ya no
		// la da (la cotización caducó, el precio se movió), toca volver a cotizar
		let fresh
		try { fresh = await routeForPrepare(routeRef.current!, Date.now(), fetchRoute) } catch (err) { setBuildError(buildErrorOf(err)); throw err }
		if (fresh.refreshed) applyRoute(fresh.route)
		return prepareOnchainSwap(fresh.route.build, planFor(fresh.route.build), { routeAt: fresh.route.at })
	}, [fetchRoute, buildErrorOf, applyRoute, planFor])

	// Se declaran antes que `tx` y se leen por ref. `advance` es para después de un permiso
	// (lo que entró era un paso previo: toca construir el swap); `refresh`, para recalcular
	// el paso actual (energía recién alquilada). Con el swap ya en la red el motor queda en
	// `sent` y `refresh` no hace nada: un recálculo tardío no reabre «Confirmar»
	const refreshRef = useRef<() => Promise<void>>(async () => {})
	const advanceRef = useRef<() => Promise<void>>(async () => {})

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
					if (ok) { setApproved(true) } else { toast.error(t(`${KEY}errors.approvalFailed`)) }
					return advanceRef.current()
				})
				.catch(() => advanceRef.current())
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
		// Antes de firmar otro paso tras una difusión sin respuesta: ¿entró el anterior?
		lookup: lookupOnchainSwap,
	})
	// Tras el commit, no en render: un render descartado no debe dejar su `refresh` en la ref
	useEffect(() => { refreshRef.current = tx.refresh; advanceRef.current = tx.advance }, [tx.refresh, tx.advance])
	const { phase, prepared, error, busy } = tx

	// El total de pasos se fija con la PRIMERA preparación: tras el permiso, `remaining` baja a
	// 0 y recalcularlo hacía desaparecer "Paso 1 de 2" en vez de pasar a "Paso 2 de 2"
	const [stepsTotal, setStepsTotal] = useState(1)
	const remaining = prepared?.summary.remaining
	useEffect(() => {
		if (remaining !== undefined) setStepsTotal(prev => Math.max(prev, remaining + 1))
	}, [remaining])

	// --- Energía TRON: se alquila AQUÍ, sin salir del swap ---
	// Antes el botón llevaba a la pantalla de Energía y, al volver, la tx seguía preparada con
	// los recursos viejos: la comisión no bajaba y el aviso seguía pidiendo alquilar. Ahora es
	// el patrón de Enviar: modal en sitio, se espera a ver la delegación y se re-prepara.
	const { isAuthenticated, user } = useAuth()
	const tronInner = prepared?.family === 'tron' ? prepared.inner : null
	// El alquiler se cobra del saldo QvaPay: sin sesión ni se pide ni se ofrece
	const energyPrices = useEnergyPricesQuery(isAuthenticated && !!tronInner)
	const [rentOpen, setRentOpen] = useState(false)
	// Latch POR PASO, armado al COBRAR: reofrecer la compra mientras el nodo no la ve sería un
	// doble cargo. Por paso porque permiso y swap gastan energía cada uno: la del permiso no
	// cubre el swap, y tras él hay que poder alquilar otra vez
	const [rentedForStep, setRentedForStep] = useState<string | null>(null)
	const tronStep = tronInner?.step ?? null
	const energyRented = !!tronStep && rentedForStep === tronStep
	const [energyWait, setEnergyWait] = useState<'waiting' | 'slow' | 'pending' | null>(null)
	const mountedRef = useRef(true)
	useEffect(() => {
		mountedRef.current = true
		return () => { mountedRef.current = false }
	}, [])

	const energyOffer = useMemo(() => {
		if (!tronInner) return null
		const breakdown = computeTronBurnBreakdown(tronInner.fee, tronInner.resources, tronInner.params)
		const meta = energyPrices.data?.meta
		// null si no falta energía (lo que se quema es ancho de banda, que alquilar no paga)
		const volume = rentVolumeFor(breakdown.energyShort, { min: meta?.min_volume, max: meta?.max_volume })
		if (volume === null) return null
		return { volume, needed: tronInner.fee.energyNeeded, owner: tronInner.intent.owner, priceUsd: estimatePrice(energyPrices.data?.data, volume, '1h') }
	}, [tronInner, energyPrices.data])

	// Un alquiler ya COBRADO para quien firma y aún sin entregar (se compró antes de abrir
	// esta pantalla): el mismo latch que al comprarlo aquí, mientras a este paso le falte energía
	const pendingEnergy = usePendingEnergyOrder(isAuthenticated ? user?.uuid : null)
	const pendingForOwner = !!pendingEnergy && !!energyOffer && pendingEnergy.target_address === energyOffer.owner
	useEffect(() => {
		if (!pendingForOwner || !tronStep) return
		setRentedForStep(tronStep)
		setEnergyWait(current => current ?? 'pending')
	}, [pendingForOwner, tronStep])

	const onEnergyRented = useCallback(async () => {
		setRentOpen(false)
		setRentedForStep(tronStep)
		if (!energyOffer) { await refreshRef.current(); return }
		setEnergyWait('waiting')
		const deadline = Date.now() + ENERGY_WAIT_DEADLINE_MS
		while (Date.now() < deadline && mountedRef.current) {
			try {
				const resources = await getAppRpcRouter().call('tron', (rpc, signal) => getTronResources(rpc, energyOffer.owner, { signal }), { accept: TRON_TX_RPC })
				if (resources.energy >= energyOffer.needed) {
					setEnergyWait(null)
					await refreshRef.current()
					return
				}
			} catch { /* nodo caído o rezagado: se vuelve a preguntar */ }
			await new Promise<void>(resolve => { setTimeout(resolve, ENERGY_WAIT_INTERVAL_MS) })
		}
		if (!mountedRef.current) return
		// La energía es suya pero el nodo aún no la refleja: se re-prepara igual y se avisa
		setEnergyWait('slow')
		await refreshRef.current()
	}, [energyOffer, tronStep])

	if (!from || !to || !chain) {
		return <View style={[containerStyles.subContainer, styles.center]}><ActivityIndicator color={theme.colors.primary} /></View>
	}

	// --- Vista: todo sale de la tx verificada ---
	const summary = prepared?.summary
	const step = summary?.step ?? 'swap'
	const minOut = plan?.minOut ?? null
	const fmtTo = (units: bigint) => `${displayAmount(formatUnits(units, to.decimals))} ${to.symbol}`
	const nativeFee = (units: bigint) => `${displayAmount(formatUnits(units, chain.native.decimals))} ${chain.native.symbol}`
	const totalSteps = Math.max(stepsTotal, summary ? summary.remaining + 1 : 1)
	const currentStep = summary ? totalSteps - summary.remaining : 1

	const rows: Array<{ label: string, value: string }> = [
		{ label: t(`${KEY}route`), value: providerLabel },
		...(expectedOut !== null ? [{ label: t(`${KEY}receiveEstimated`), value: `${displayAmount(String(expectedOut))} ${to.symbol}` }] : []),
		...(minOut !== null ? [{ label: t(`${KEY}receiveMin`), value: fmtTo(minOut) }] : []),
		...(summary?.simulatedOut != null ? [{ label: t(`${KEY}simulated`), value: fmtTo(summary.simulatedOut) }] : []),
		{ label: t(`${KEY}networkFee`), value: phase === 'preparing' || !summary ? '…' : nativeFee(summary.feeEstimated) },
		...(serviceFeeBps ? [{ label: t(`${KEY}serviceFee`), value: t(`${KEY}serviceFeeValue`, { percent: (serviceFeeBps / 100).toLocaleString(getNumberLocale(), { maximumFractionDigits: 2 }) }) }] : []),
		...(totalSteps > 1 ? [{ label: t(`${KEY}step`), value: t(`${KEY}stepValue`, { current: currentStep, total: totalSteps }) }] : []),
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
				<Text style={[textStyles.amount, styles.heroAmount, { color: theme.colors.primaryText, fontSize: theme.typography.fontSize.displaySm }]}>
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
			{!!energyWait && !fatal && (energyWait !== 'pending' || !!energyOffer) && <Notice theme={theme} icon="bolt" color={theme.colors.primary} text={t(ENERGY_WAIT_COPY[energyWait])} />}
			{!!energyOffer && isAuthenticated && !energyRented && prepared?.family === 'tron' && prepared.summary.feeEstimated > 0n && !fatal && (
				<>
					<Notice theme={theme} icon="circle-info" color={theme.colors.warning} text={t(`${KEY}tronEnergyNotice`, { amount: nativeFee(prepared.summary.feeEstimated) })} />
					<QPButton title={t(`${KEY}rentEnergy`)} onPress={() => setRentOpen(true)} outlined disabled={busy || waitingApproval} />
				</>
			)}
			{approved && step === 'swap' && !fatal && phase !== 'error' && <Notice theme={theme} icon="circle-check" color={theme.colors.successText} text={t(`${KEY}approvedNotice`, { symbol: from.symbol })} />}
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
						disabled={phase !== 'ready' || waitingApproval || energyWait === 'waiting'}
						loading={phase === 'preparing' || busy || waitingApproval || energyWait === 'waiting' || (!build && !fatal)}
						testID="onchain-swap-confirm"
					/>
				)}
				<QPButton title={t(`${KEY}back`)} onPress={() => navigation.goBack()} outlined disabled={busy || waitingApproval} />
			</View>

			<WalletAuthModal visible={tx.authVisible} subtitle={authSubtitle} onClose={tx.closeAuth} onAuthorized={tx.onAuthorized} />

			{!!energyOffer && (
				<EnergyRentModal
					visible={rentOpen}
					// SIEMPRE quien FIRMA el swap: es a esa dirección a la que se delega la energía
					targetAddress={energyOffer.owner}
					volume={energyOffer.volume}
					duration="1h"
					estimatedUsd={energyOffer.priceUsd}
					onClose={() => setRentOpen(false)}
					onCharged={() => setRentedForStep(tronStep)}
					onRented={onEnergyRented}
					onSeeOrders={() => { setRentOpen(false); navigation.navigate(ROUTES.WALLET_ENERGY_ORDERS) }}
				/>
			)}
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
	heroAmount: { marginTop: 8, textAlign: 'center' },
	card: { borderRadius: 14, paddingHorizontal: 14 },
	row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12, paddingVertical: 12 },
	rowValue: { flex: 1, textAlign: 'right' },
	notice: { flexDirection: 'row', gap: 10, padding: 12, borderRadius: 12, alignItems: 'flex-start' },
	noticeIcon: { marginTop: 2 },
	noticeText: { flex: 1 },
	actions: { gap: 10, marginTop: 8 },
})

export default WalletOnchainSwap
