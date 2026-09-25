import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native'
import type { TextInput } from 'react-native'
import { useTranslation } from 'react-i18next'

// Theme
import { useTheme } from '../../../theme/ThemeContext'
import { useContainerStyles, useTextStyles } from '../../../theme/themeUtils'

// Auth / settings / wallet
import { useAuth } from '../../../auth/AuthContext'
import { useSettings } from '../../../settings/SettingsContext'
import { useWallet } from '../../../wallet/WalletContext'
import { buildSwapForm, isInUnsupported, percentAmount, sanitizeAmountInput } from './swapModel'
import { buildSwapView } from './swapView'
import type { SwapSide } from './swapView'
import { assetIdOf, directionFor, flip, isBalance, routeFor } from './swapRouting'
import { formatUsd } from './walletFormat'
import type { SwapSideRef } from './swapRouting'
import useSwapPairs from './useSwapPairs'
import useSwapFlow from './useSwapFlow'
import { useWalletAssets } from './walletQueries'
import useCoins from '../../../hooks/useCoins'
import { addressForKind, findAssetForCoin } from '../../../wallet/assets'

// Intercambio cripto↔cripto
import { buildExchangeView } from './exchangeView'
import useExchangeFlow from './useExchangeFlow'
import { useExchangeCatalogQuery } from './exchangeQueries'

// UI
import QPButton from '../../../ui/particles/QPButton'
import PinConfirmStep from '../../transaction/PinConfirmStep'
import WalletAuthModal from './components/WalletAuthModal'
import SwapAmountCard from './components/swap/SwapAmountCard'
import QPAssetSheet from '../../../ui/QPAssetSheet'
import type { QPAssetOption } from '../../../ui/QPAssetSheet'
import SwapDetails from './components/swap/SwapDetails'
import SwapFlipButton, { FLIP_BUTTON_SIZE } from './components/swap/SwapFlipButton'
import SwapNotices from './components/swap/SwapNotices'
import SwapReviewSheet from './components/swap/SwapReviewSheet'

// Navigation
import { ROUTES } from '../../../routes'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import type { RootStackParamList } from '../../../types/navigation'
import type { AssetView } from '../../../wallet/assets'
import type { Coin, ExchangeOrder, Swap } from '../../../types/domain'

type Props = NativeStackScreenProps<RootStackParamList, 'WalletSwap'>

export { SWAP_PAIRS_KEY } from './useSwapPairs'
const PERCENT_CHIPS = [25, 50, 100] as const
const BALANCE_SIDE: SwapSideRef = { kind: 'balance' }

/**
 * UNA pantalla de intercambio para dos motores.
 *
 * El usuario elige qué entrega y qué quiere recibir; cada lado puede ser el saldo QvaPay o
 * cualquier activo de la wallet. De esa combinación se deriva el motor (`swapRouting.ts`),
 * que el usuario no ve:
 *
 *   saldo ↔ QUSD          → motor custodial, con PIN de cuenta (`useSwapFlow`)
 *   activo ↔ activo       → agregador de proveedores, modelo de dirección de depósito
 *                           (`useExchangeFlow`): el envío posterior es un envío NORMAL de la
 *                           wallet, con la verificación de firma intacta
 *   saldo ↔ otro activo   → no soportado, y el selector dice por qué
 *
 * Las dos ramas pintan los MISMOS componentes (`SwapAmountCard`, `SwapDetails`,
 * `SwapNotices`, `SwapReviewSheet`) alimentados por su propio modelo de vista, así que la
 * pantalla sigue siendo cableado: `swapModel`/`swapView` para el motor custodial y
 * `exchangeModel`/`exchangeView` para el agregador.
 */
const WalletSwap = ({ navigation, route }: Props) => {

	const { t } = useTranslation()
	const { theme } = useTheme()
	const textStyles = useTextStyles(theme)
	const containerStyles = useContainerStyles(theme)
	const { user } = useAuth()
	const { addresses } = useWallet()
	const { getSetting } = useSettings()
	const showBalance = getSetting('privacy', 'showBalance', true) as boolean
	const amountRef = useRef<TextInput>(null)

	const [amountText, setAmountText] = useState('')
	const [sheet, setSheet] = useState<'pay' | 'receive' | null>(null)

	const { query: pairs, enabledPairs, pair, asset, assetFor, setPairId, registered, walletReady, limitAvailable } = useSwapPairs()
	const { all } = useWalletAssets()
	const catalog = useExchangeCatalogQuery()

	// assetIds que el BACKEND publica como pares custodiales; de ahí sale el enrutado
	const pairAssetIds = useMemo(
		() => enabledPairs.map(p => assetFor(p)?.id).filter((id): id is string => !!id),
		[enabledPairs, assetFor],
	)

	// Rieles propios de QvaPay: el catálogo de monedas ya cubre casi toda la wallet en los dos
	// sentidos, así que saldo ↔ activo no tiene por qué morir en un "solo QUSD". Es NUESTRO
	// riel: comisión nuestra y sin ventana de custodia ajena, al contrario que el agregador.
	const { coins: coinsOut } = useCoins('out')
	const { coins: coinsIn } = useCoins('in')
	const railOutCoin = useRailMap(coinsOut, all)
	const railInCoin = useRailMap(coinsIn, all)
	const railOut = useMemo(() => Object.keys(railOutCoin), [railOutCoin])
	const railIn = useMemo(() => Object.keys(railInCoin), [railInCoin])

	// Selección inicial: el sentido que pidió quien navegó hasta aquí, contra el par por defecto.
	//
	// Solo rellena los HUECOS (`prev ?? …`). El par tarda en llegar —depende de `GET /swap/pairs`
	// y del catálogo de activos—, así que este efecto corre DESPUÉS de que la pantalla ya sea
	// usable: con un `setPay` a secas, elegir un activo antes de que cargara el par lo borraba
	// y devolvía el lado de arriba a "Saldo QvaPay".
	const [pay, setPay] = useState<SwapSideRef | null>(null)
	const [receive, setReceive] = useState<SwapSideRef | null>(null)
	useEffect(() => {
		if (!asset) { return }
		const wallet: SwapSideRef = { kind: 'asset', id: asset.id }
		const out = (route.params?.direction ?? 'out') === 'out'
		setPay(prev => prev ?? (out ? BALANCE_SIDE : wallet))
		setReceive(prev => prev ?? (out ? wallet : BALANCE_SIDE))
	}, [asset, route.params?.direction])

	const routed = routeFor({ pay, receive, pairAssetIds, railOut, railIn })
	const isExchange = routed.mode === 'exchange'

	// El motor custodial trabaja sobre un par; mantener `pairId` en sintonía con el lado que
	// sea activo de wallet es lo que deja `useSwapPairs` intacto bajo el selector nuevo.
	const custodialAssetId = isBalance(pay) ? assetIdOf(receive) : assetIdOf(pay)
	useEffect(() => {
		if (isExchange || !custodialAssetId) { return }
		const match = enabledPairs.find(p => assetFor(p)?.id === custodialAssetId)
		if (match && match.id !== pair?.id) { setPairId(match.id) }
	}, [isExchange, custodialAssetId, enabledPairs, assetFor, pair?.id, setPairId])

	const findAsset = useCallback((side: SwapSideRef | null): AssetView | null =>
		(side?.kind === 'asset' ? all.find(a => a.id === side.id) ?? null : null), [all])

	const payAsset = findAsset(pay)
	const receiveAsset = findAsset(receive)

	const onFlip = useCallback(() => {
		setPay(prev => { const [, nextPay] = flip(receive, prev); return nextPay })
		setReceive(prev => { const [nextReceive] = flip(prev, pay); return nextReceive })
		setAmountText('')
	}, [pay, receive])

	// ── Motor custodial (saldo ↔ QUSD) ──────────────────────────────────────
	const direction = directionFor(routed.mode) ?? 'out'
	const custodial = Number(user?.balance || 0)
	const form = buildSwapForm({
		direction, amountText, pair, walletReady, limitAvailable,
		payBalance: direction === 'out' ? custodial : Number(asset?.amount ?? 0),
		loading: pairs.isLoading,
	})

	const onSwapCreated = useCallback((swap: Swap) => {
		navigation.replace(ROUTES.WALLET_SWAP_STATUS, { uuid: swap.uuid })
	}, [navigation])

	const inUnsupported = isInUnsupported(direction, pair)
	const swapFlow = useSwapFlow({ direction, form, pair, asset, registered, inUnsupported, onCreated: onSwapCreated })

	// ── Agregador (activo ↔ activo) ─────────────────────────────────────────
	const balances = useMemo(
		() => Object.fromEntries(all.filter(a => a.hasBalance).map(a => [a.id, a.amount])),
		[all],
	)
	const unsupportedReason = useMemo(() => {
		const unsupported = catalog.data?.unsupported ?? {}
		return unsupported[payAsset?.id ?? ''] ?? unsupported[receiveAsset?.id ?? ''] ?? null
	}, [catalog.data, payAsset?.id, receiveAsset?.id])

	const onExchangeOpened = useCallback((order: ExchangeOrder) => {
		navigation.replace(ROUTES.WALLET_EXCHANGE_STATUS, { uuid: order.uuid })
	}, [navigation])

	const exchangeFlow = useExchangeFlow({
		from: isExchange ? payAsset : null,
		to: isExchange ? receiveAsset : null,
		amountText, addresses, balances, unsupportedReason,
		onOpened: onExchangeOpened,
	})

	// ── Vista, según el motor ───────────────────────────────────────────────
	const exchangeView = buildExchangeView({
		t, from: payAsset, to: receiveAsset, amountText,
		check: exchangeFlow.check,
		quote: exchangeFlow.quote,
		advice: exchangeFlow.advice,
		minAmount: exchangeFlow.minAmount,
		cheaper: exchangeFlow.cheaper,
		unsupportedReason,
		showBalance,
		quoting: exchangeFlow.quoting,
		busy: exchangeFlow.busy,
		loading: catalog.isLoading,
		pickFrom: () => setSheet('pay'),
		pickTo: () => setSheet('receive'),
	})

	const swapView = buildSwapView({
		t, direction, form, pair, asset, registered, limitAvailable, custodial, showBalance,
		busy: swapFlow.busy,
		// Se conserva por compatibilidad con la vista; los pulsadores reales los pone
		// `withPickers`, porque aquí los DOS lados se eligen
		pickAsset: () => setSheet('pay'),
		retrying: swapFlow.retrying,
		inError: swapFlow.inError,
		pairsLoaded: pairs.isSuccess,
		pairsFailed: pairs.isError && !pairs.data,
	})

	// ── Rieles propios: el intercambio no ocurre aquí, se entrega al flujo que ya existe ──
	const isRail = routed.mode === 'withdraw' || routed.mode === 'deposit'
	const railAsset = routed.mode === 'withdraw' ? receiveAsset : payAsset
	const railCoin = railAsset ? (routed.mode === 'withdraw' ? railOutCoin[railAsset.id] : railInCoin[railAsset.id]) : null

	const goToRail = useCallback(() => {
		if (!railCoin || !railAsset) { return }
		if (routed.mode === 'withdraw') {
			// El destino se prellena con la wallet del propio usuario: es exactamente lo que
			// pidió al elegir ese activo, y evita que copie una dirección a mano
			navigation.navigate(ROUTES.WITHDRAW, {
				preselectedCoin: railCoin.tick,
				...(addresses ? { prefillAddress: addressForKind(addresses, railAsset.kind) } : {}),
			})
			return
		}
		navigation.navigate(ROUTES.ADD, { preselectedCoin: railCoin.tick })
	}, [navigation, railCoin, railAsset, routed.mode, addresses])

	/**
	 * Vista que pinta LO QUE EL USUARIO ELIGIÓ, sin motor detrás.
	 *
	 * La usan el riel y las combinaciones imposibles. Es necesaria porque `swapView` habla
	 * siempre del par QUSD: dejar que pintara una selección que no es suya hacía que elegir,
	 * por ejemplo, BNB devolviera la tarjeta de arriba a "Saldo QvaPay" — la pantalla ignoraba
	 * la elección en vez de reflejarla.
	 *
	 * Sin importe estimado a propósito: en el riel la comisión y el mínimo los calcula la
	 * pantalla de retiro/depósito, y adelantar aquí un número que luego no cuadre es peor que
	 * no enseñar ninguno.
	 */
	const selectionView = useMemo(() => {
		const sideOf = (side: SwapSideRef | null, view: AssetView | null): SwapSide => (
			isBalance(side)
				? { symbol: 'USD', caption: t('crypto.wallet.swap.balanceQvaPay'), icon: { kind: 'balance' }, balance: showBalance ? formatUsd(custodial) : '••••' }
				: { symbol: view?.symbol ?? '—', caption: view?.chainName ?? '', icon: { kind: 'wallet', logoTick: view?.logoTick ?? '', networkTick: view?.networkTick ?? null }, balance: view ? (showBalance ? view.amountLabel : '••••') : '' }
		)
		return {
			pay: sideOf(pay, payAsset),
			receive: sideOf(receive, receiveAsset),
			receiveAmount: '',
			receiveHint: '',
			rate: '',
			rows: [],
			// El aviso explica el camino solo cuando hay uno; una combinación imposible ya lo
			// dice en el botón, y repetirlo abajo sería regañar dos veces
			notices: routed.mode === 'withdraw' || routed.mode === 'deposit'
				? [{
					key: 'rail',
					icon: 'wallet' as const,
					tone: 'primary' as const,
					text: t(routed.mode === 'withdraw' ? 'crypto.wallet.exchange.viaWithdraw' : 'crypto.wallet.exchange.viaDeposit'),
				}]
				: [],
		}
	}, [t, pay, receive, payAsset, receiveAsset, showBalance, custodial, routed.mode])

	// Una combinación imposible se dice AQUÍ, con su motivo, y deshabilita el botón: es mejor
	// que enseñar una cotización que fallaría al confirmar.
	const blocked = routed.mode === 'unsupported' && !!routed.reasonKey && !!pay && !!receive
	/**
	 * Cada tarjeta abre SU propio selector.
	 *
	 * El motor QUSD venía de una pantalla donde solo se elegía un lado (el otro era siempre el
	 * saldo), así que dejaba la tarjeta del saldo sin pulsador y mandaba las dos al mismo sitio.
	 * Aquí los dos lados se eligen, y tocar arriba tiene que abrir arriba.
	 */
	const withPickers = useCallback(<V extends { pay: SwapSide, receive: SwapSide }>(v: V): V => ({
		...v,
		pay: { ...v.pay, onPress: () => setSheet('pay') },
		receive: { ...v.receive, onPress: () => setSheet('receive') },
	}), [])

	// `view` alimenta solo las tarjetas de arriba. El CTA y la hoja de revisión salen del
	// MOTOR: en el riel esa hoja no se abre nunca, porque la confirmación vive en la pantalla
	// de retiro/depósito a la que se navega.
	// Solo los dos modos QUSD tienen derecho a pintar `swapView`; lo demás refleja la selección
	const isQusd = routed.mode === 'qusd-out' || routed.mode === 'qusd-in'
	const view = withPickers(isQusd ? swapView : isExchange ? exchangeView : selectionView)
	const engineView = isExchange ? exchangeView : swapView
	const busy = isExchange ? exchangeFlow.busy : swapFlow.busy
	const ctaEnabled = isRail ? !!railCoin : !blocked && engineView.ctaEnabled
	const ctaLabel = blocked ? t(routed.reasonKey!)
		: isRail ? t(routed.mode === 'withdraw' ? 'crypto.wallet.exchange.ctaWithdraw' : 'crypto.wallet.exchange.ctaDeposit')
			: engineView.ctaLabel

	const onCta = isRail ? goToRail : isExchange ? exchangeFlow.openReview : swapFlow.onCta
	const reviewOpen = !isRail && (isExchange ? exchangeFlow.review : swapFlow.review)
	const closeReview = isExchange ? exchangeFlow.closeReview : swapFlow.closeReview
	const onConfirm = isExchange ? exchangeFlow.confirm : swapFlow.onConfirm
	const confirmDisabled = isExchange ? exchangeFlow.busy : swapFlow.confirmDisabled

	// En el riel no se teclea importe aquí: lo hace la pantalla de retiro/depósito
	const maxAmount = isRail ? 0 : isExchange ? Number(payAsset?.amount ?? 0) : form.max
	// En el agregador no hay chip de 100%: el proveedor espera el importe EXACTO cotizado, y
	// en el nativo "todo" se comería además la comisión de red del propio envío.
	const chips = maxAmount > 0
		? PERCENT_CHIPS
			.filter(p => !(isExchange && p === 100))
			.map(p => ({ key: String(p), label: p === 100 ? t('crypto.wallet.swap.max') : `${p}%`, onPress: () => setAmountText(percentAmount(maxAmount, p)) }))
		: undefined

	const sheetOptions = useSideOptions({ t, all, enabledPairs, assetFor, catalog: catalog.data, showBalance, custodial, side: sheet, other: sheet === 'pay' ? receive : pay, railOut, railIn })

	const onPickSide = useCallback((id: string) => {
		const next: SwapSideRef = id === 'balance' ? BALANCE_SIDE : { kind: 'asset', id }
		if (sheet === 'pay') { setPay(next) } else { setReceive(next) }
		setAmountText('')
	}, [sheet])

	const { out } = swapFlow

	return (
		<KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={containerStyles.subContainer}>
			<ScrollView style={styles.scroll} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>

				<View>
					<SwapAmountCard
						ref={amountRef}
						label={t('crypto.wallet.swap.pay')}
						token={view.pay}
						amount={amountText}
						onChangeAmount={(text) => setAmountText(sanitizeAmountInput(text))}
						placeholder="0.00"
						fiatLabel={isExchange ? '' : swapView.payFiat}
						balanceLabel={view.pay.balance}
						chips={chips}
						disabled={busy}
						accessibilityLabel={t('crypto.wallet.swap.pay')}
					/>
					{/* En flujo con márgenes negativos: monta sobre la junta de las dos tarjetas sin medirlas */}
					<View style={styles.flipWrap} pointerEvents="box-none">
						<SwapFlipButton onPress={onFlip} disabled={busy} accessibilityLabel={t('crypto.wallet.swap.flip')} />
					</View>
					<SwapAmountCard
						label={t('crypto.wallet.swap.receive')}
						hint={view.receiveHint}
						token={view.receive}
						amount={view.receiveAmount}
						placeholder="0.00"
						fiatLabel={isExchange ? '' : swapView.receiveFiat}
						balanceLabel={view.receive.balance}
					/>
				</View>

				<SwapDetails rate={view.rate} badge={isExchange ? undefined : swapView.badge} rows={view.rows} />

				<SwapNotices notices={view.notices} />

			</ScrollView>

			{/* Fuera del scroll: siempre abajo y sube con el teclado */}
			<View style={styles.footer}>
				<QPButton title={ctaLabel} onPress={onCta} disabled={!ctaEnabled} loading={busy || (isExchange ? catalog.isLoading : pairs.isLoading)} />
			</View>

			<QPAssetSheet
				visible={sheet !== null}
				title={t(sheet === 'pay' ? 'crypto.wallet.exchange.pickPay' : 'crypto.wallet.exchange.pickReceive')}
				selectedId={(sheet === 'pay' ? pay : receive)?.kind === 'asset' ? assetIdOf(sheet === 'pay' ? pay : receive) : 'balance'}
				onSelect={onPickSide}
				onClose={() => setSheet(null)}
				options={sheetOptions}
			/>

			<SwapReviewSheet
				visible={reviewOpen}
				title={t('crypto.wallet.swap.reviewTitle')}
				from={engineView.reviewFrom}
				to={engineView.reviewTo}
				rate={engineView.rate}
				badge={isExchange ? undefined : swapView.badge}
				rows={engineView.rows}
				notice={engineView.reviewNotice}
				confirmLabel={engineView.confirmLabel}
				onConfirm={onConfirm}
				confirmDisabled={confirmDisabled}
				busy={busy}
				onClose={closeReview}
			>
				{!isExchange && swapFlow.showPinStep && (
					<PinConfirmStep
						pin={out.pin}
						onChangePin={out.setPin}
						codeLength={out.codeLength}
						twoFactorMethod={out.twoFactorMethod}
						hasOTP={out.hasOTP}
						sendingPin={out.sendingPin}
						onMethodToggle={out.handleMethodToggle}
						onRequestPin={out.handleRequestPin}
						codeInputRef={out.codeInputRef}
						theme={theme}
						textStyles={textStyles}
						containerStyles={containerStyles}
					/>
				)}
			</SwapReviewSheet>

			<WalletAuthModal
				visible={swapFlow.authVisible}
				subtitle={swapView.authSubtitle}
				onClose={swapFlow.closeAuth}
				onAuthorized={swapFlow.onAuthorized}
			/>
		</KeyboardAvoidingView>
	)
}

/**
 * assetId → moneda del catálogo que lo mueve por el riel de QvaPay.
 *
 * El puente lo hace `findAssetForCoin` (red + símbolo), que ya existía para prellenar
 * retiros hacia la wallet. Se invierte aquí para poder preguntar en el otro sentido: dado un
 * activo, ¿qué moneda lo saca o lo mete?
 */
const useRailMap = (coins: Coin[], catalog: AssetView[]): Record<string, Coin> => useMemo(() => {
	const map: Record<string, Coin> = {}
	for (const coin of coins) {
		const asset = findAssetForCoin(catalog, coin)
		// La primera gana: el catálogo puede traer varias monedas para el mismo activo
		if (asset && !map[asset.id]) { map[asset.id] = coin }
	}
	return map
}, [coins, catalog])

/**
 * Opciones del selector de un lado: el saldo QvaPay más todos los activos de la wallet.
 *
 * Lo que NO se puede elegir se pinta apagado CON SU MOTIVO en vez de desaparecer: un activo
 * que falta sin explicación se lee como un fallo de la app, y el motivo real —el proveedor
 * no lista ese token en esa red, o desde el saldo solo se va a QUSD— es información útil.
 */
const useSideOptions = ({ t, all, enabledPairs, assetFor, catalog, showBalance, custodial, side, other, railOut, railIn }: {
	t: (key: string, params?: Record<string, unknown>) => string
	all: AssetView[]
	enabledPairs: ReturnType<typeof useSwapPairs>['enabledPairs']
	assetFor: ReturnType<typeof useSwapPairs>['assetFor']
	catalog: { supported: string[], unsupported: Record<string, string> } | null | undefined
	showBalance: boolean
	/** Saldo QvaPay en USD, para que su fila también diga cuánto hay. */
	custodial: number
	side: 'pay' | 'receive' | null
	other: SwapSideRef | null
	/** assetIds con riel de retiro y de depósito: abren las combinaciones con el saldo. */
	railOut: string[]
	railIn: string[]
}): QPAssetOption[] => useMemo(() => {
	if (!side) { return [] }

	const pairIds = new Set(enabledPairs.map(p => assetFor(p)?.id).filter(Boolean))
	const otherIsBalance = isBalance(other)
	const otherAssetId = assetIdOf(other)
	const supported = catalog?.supported ?? []
	const unsupported = catalog?.unsupported ?? {}

	const balanceOption: QPAssetOption = {
		id: 'balance',
		title: 'USD',
		subtitle: t('crypto.wallet.swap.balanceQvaPay'),
		logoTick: null,
		networkTick: null,
		value: showBalance ? formatUsd(custodial) : '••••',
		// El saldo contra el saldo no es nada. Contra un activo, vale si hay par publicado o
		// riel: el sentido importa, porque el otro activo estaría PAGANDO y eso es un depósito.
		disabledReason: otherIsBalance
			? t('crypto.wallet.exchange.sameSide')
			: otherAssetId && !pairIds.has(otherAssetId) && !(side === 'receive' ? railIn : railOut).includes(otherAssetId)
				? t(side === 'receive' ? 'crypto.wallet.exchange.noRailIn' : 'crypto.wallet.exchange.noRailOut')
				: null,
	}

	const assetOptions: QPAssetOption[] = all.map(asset => ({
		id: asset.id,
		title: asset.symbol,
		subtitle: asset.chainName,
		logoTick: asset.logoTick,
		networkTick: asset.networkTick,
		value: showBalance ? asset.amountLabel : '••••',
		// Lo que vale ese saldo: es el dato que faltaba para poder decidir
		valueCaption: showBalance && asset.usd !== null ? formatUsd(asset.usd) : undefined,
		keywords: `${asset.chainKey} ${asset.chainName}`,
		disabledReason: asset.id === otherAssetId
			? t('crypto.wallet.exchange.sameAsset')
			// Contra el saldo: par publicado o riel propio en el sentido que toca. Este activo
			// está en `side`, así que 'pay' significa que SALE de la wallet → es un depósito.
			: otherIsBalance && !pairIds.has(asset.id) && !(side === 'pay' ? railIn : railOut).includes(asset.id)
				? t(side === 'pay' ? 'crypto.wallet.exchange.noRailIn' : 'crypto.wallet.exchange.noRailOut')
				// Contra otro activo, manda lo que el proveedor liste
				: !otherIsBalance && !supported.includes(asset.id) ? (unsupported[asset.id] ?? t('crypto.wallet.exchange.unsupportedAsset'))
					: null,
	}))

	// Lo utilizable primero: un selector que abre en filas apagadas parece roto
	const usable = (o: QPAssetOption) => (o.disabledReason ? 1 : 0)
	return [balanceOption, ...assetOptions].sort((a, b) => usable(a) - usable(b))
}, [t, all, enabledPairs, assetFor, catalog, showBalance, custodial, side, other, railOut, railIn])

const styles = StyleSheet.create({
	scroll: { flex: 1 },
	content: { paddingTop: 8, paddingBottom: 16, gap: 10 },
	footer: { paddingTop: 8, paddingBottom: 24 },
	// Botón de invertir a caballo entre las dos tarjetas (deja 6 px de junta entre ellas)
	flipWrap: { alignItems: 'center', marginVertical: -(FLIP_BUTTON_SIZE / 2) + 3, zIndex: 2, elevation: 2 },
})

export default WalletSwap
