/**
 * Modelo de VISTA de la pantalla de Swap. PURO (sin react-native): convierte el estado
 * —sentido, formulario, par, activo, saldos— en exactamente lo que pinta la pantalla:
 * los dos lados (paga/recibe), la tasa, las filas de detalle, los avisos y el botón.
 *
 * Vive aparte de `swapModel.ts` porque aquel decide QUÉ se puede hacer (reglas de negocio,
 * `SwapForm`) y este decide CÓMO se ve. Separarlo deja la pantalla como puro cableado y
 * hace testeable en node todo el texto que el usuario lee.
 */
import { isInUnsupported } from './swapModel'
import type { SwapDirection, SwapForm, SwapPairLike } from './swapModel'
import { formatUsd, shortAddress } from './walletFormat'
import type { SwapDetailRow } from './components/swap/SwapDetails'
import type { QPAssetIconKind } from '../../../ui/particles/QPAssetBadge'

/** `t` de i18next, reducido a lo que este módulo usa (no arrastra react-i18next a los tests node). */
type Translate = (key: string, params?: Record<string, unknown>) => string

/** Color del aviso: se resuelve contra el tema en el componente, no aquí. */
export type SwapNoticeTone = 'primary' | 'warning' | 'danger'
export type SwapNoticeIcon = 'gas-pump' | 'triangle-exclamation' | 'wallet'
export type SwapNotice = { key: string, icon: SwapNoticeIcon, tone: SwapNoticeTone, text: string }

/** Un lado del swap en la hoja de revisión (sin saldo ni selector). */
export type SwapReviewCard = { amount: string, symbol: string, caption: string, icon: QPAssetIconKind }

/** Un lado del swap tal cual lo consume `SwapAmountCard`. */
export type SwapSide = { symbol: string, caption: string, icon: QPAssetIconKind, balance: string, onPress?: () => void }

/** Lo que la vista necesita saber del activo on-chain del par. */
export type SwapAssetLike = { symbol: string, amountLabel?: string, logoTick?: string, networkTick?: string | null, chainName?: string } | null | undefined

export type SwapViewInput = {
	t: Translate
	direction: SwapDirection
	form: SwapForm
	pair: SwapPairLike | null
	asset: SwapAssetLike
	/** Dirección de la wallet registrada en el backend para la red del par. */
	registered: string | null
	limitAvailable: number | null
	/** Saldo custodial en USD. */
	custodial: number
	showBalance: boolean
	/** Abre el selector de activo; `undefined` cuando solo hay un par. */
	pickAsset?: () => void
	/** Hay una operación en vuelo (firma, envío, PIN). */
	busy: boolean
	/** El sentido IN se quedó en error y el botón ofrece reintentar. */
	retrying: boolean
	/** Mensaje del error del sentido IN, si lo hay. */
	inError?: string | null
	pairsLoaded: boolean
	/** La query falló y no hay datos previos que pintar. */
	pairsFailed: boolean
}

export type SwapView = {
	symbol: string
	chainName: string
	pay: SwapSide
	receive: SwapSide
	/** Importe calculado del lado que recibe ('' si aún no hay importe). */
	receiveAmount: string
	payFiat: string
	receiveFiat: string
	receiveHint: string
	rate: string
	/** El par no cobra comisión: la fila se pinta en verde y aparece la insignia. */
	feeFree: boolean
	badge?: string
	rows: SwapDetailRow[]
	notices: SwapNotice[]
	ctaLabel: string
	ctaEnabled: boolean
	/** El sentido IN no está soportado en la red del par (no hay firmante). */
	inUnsupported: boolean
	reviewNotice: string
	confirmLabel: string
	/** Las dos tarjetas de la hoja de revisión, ya con el importe formateado. */
	reviewFrom: SwapReviewCard
	reviewTo: SwapReviewCard
	authSubtitle: string
}

const HIDDEN = '••••'

/** Filas plegables del detalle: comisión, red, destino, cadena, ETA y cupo. */
const detailRows = ({ t, direction, form, feeFree, chainName, registered, limitAvailable }: {
	t: Translate, direction: SwapDirection, form: SwapForm, feeFree: boolean, chainName: string, registered: string | null, limitAvailable: number | null
}): SwapDetailRow[] => [
	{ key: 'fee', label: t('crypto.wallet.swap.details.fee'), value: feeFree ? t('crypto.wallet.swap.details.free') : formatUsd(form.fee), highlight: feeFree },
	{ key: 'network', label: t('crypto.wallet.swap.details.networkFee'), value: t('crypto.wallet.swap.details.networkFeePaid'), highlight: true },
	{ key: 'destination', label: t('crypto.wallet.swap.details.destination'), value: direction === 'out' ? t('crypto.wallet.swap.details.toWallet', { address: shortAddress(registered, 4, 4) }) : t('crypto.wallet.swap.balanceQvaPay') },
	{ key: 'chain', label: t('crypto.wallet.swap.details.network'), value: chainName },
	{ key: 'eta', label: t('crypto.wallet.swap.details.eta'), value: direction === 'out' ? t('crypto.wallet.swap.details.etaOut') : t('crypto.wallet.swap.details.etaIn') },
	{ key: 'limit', label: t('crypto.wallet.swap.details.limit'), value: limitAvailable === null ? t('crypto.wallet.swap.details.noLimit') : formatUsd(limitAvailable) },
]

/**
 * Avisos bajo el detalle, en el orden en que se apilan. Cada uno es independiente:
 * pueden salir varios a la vez (par deshabilitado + wallet sin registrar).
 */
const notices = ({ t, direction, form, pair, chainName, inUnsupported, retrying, inError, pairsLoaded, pairsFailed }: {
	t: Translate, direction: SwapDirection, form: SwapForm, pair: SwapPairLike | null, chainName: string,
	inUnsupported: boolean, retrying: boolean, inError?: string | null, pairsLoaded: boolean, pairsFailed: boolean
}): SwapNotice[] => {
	const list: SwapNotice[] = []
	if (direction === 'in' && pair && !inUnsupported) list.push({ key: 'sponsored', icon: 'gas-pump', tone: 'primary', text: t('crypto.wallet.swap.sponsoredNote') })
	if (pairsLoaded && form.cta === 'unavailable') list.push({ key: 'disabled', icon: 'triangle-exclamation', tone: 'warning', text: t('crypto.wallet.swap.disabled') })
	if (inUnsupported) list.push({ key: 'inUnsupported', icon: 'triangle-exclamation', tone: 'warning', text: t('crypto.wallet.swap.inUnsupported', { network: chainName }) })
	if (pairsLoaded && form.cta === 'walletNotRegistered') list.push({ key: 'notRegistered', icon: 'wallet', tone: 'warning', text: t('crypto.wallet.swap.notRegistered') })
	if (pairsFailed) list.push({ key: 'loadError', icon: 'triangle-exclamation', tone: 'danger', text: t('crypto.wallet.swap.loadError') })
	if (retrying && inError) list.push({ key: 'inError', icon: 'triangle-exclamation', tone: 'danger', text: inError })
	return list
}

/** Texto del botón principal: reintentar gana, luego "no disponible", si no lo que diga el formulario. */
const ctaLabel = ({ t, retrying, inUnsupported, form }: { t: Translate, retrying: boolean, inUnsupported: boolean, form: SwapForm }): string => {
	if (retrying) return t('crypto.wallet.swap.cta.retry')
	if (inUnsupported) return t('crypto.wallet.swap.cta.unavailable')
	return t(`crypto.wallet.swap.cta.${form.cta}`, form.ctaParams)
}

export const buildSwapView = (input: SwapViewInput): SwapView => {
	const { t, direction, form, pair, asset, registered, limitAvailable, custodial, showBalance, pickAsset, busy, retrying, inError, pairsLoaded, pairsFailed } = input

	const symbol = pair?.asset_name ?? asset?.symbol ?? 'QUSD'
	const chainName = asset?.chainName ?? pair?.network ?? ''
	const inUnsupported = isInUnsupported(direction, pair)
	const outbound = direction === 'out'

	const balanceSide: SwapSide = {
		symbol: 'USD',
		caption: t('crypto.wallet.swap.balanceQvaPay'),
		icon: { kind: 'balance' },
		balance: showBalance ? formatUsd(custodial) : HIDDEN,
	}
	const walletSide: SwapSide = {
		symbol,
		caption: t('crypto.wallet.swap.walletOn', { network: chainName }),
		icon: { kind: 'wallet', logoTick: asset?.logoTick ?? symbol, networkTick: asset?.networkTick ?? null },
		balance: showBalance ? `${asset?.amountLabel ?? '0'} ${symbol}` : HIDDEN,
		onPress: pickAsset,
	}

	const pay = outbound ? balanceSide : walletSide
	const receiveSide = outbound ? walletSide : balanceSide
	const receiveAmount = form.receive === null ? '' : form.receive.toFixed(2)
	const card = (side: SwapSide, amount: string): SwapReviewCard => ({ amount: amount || '0.00', symbol: side.symbol, caption: side.caption, icon: side.icon })

	const feeFree = !pair || pair.fee_bps === 0
	const rate = outbound ? `1 USD = ${pair?.rate ?? 1} ${symbol}` : `1 ${symbol} = ${pair?.rate ?? 1} USD`

	return {
		symbol,
		chainName,
		pay,
		receive: receiveSide,
		receiveAmount,
		payFiat: `≈ ${formatUsd(form.value ?? 0)}`,
		receiveFiat: `≈ ${formatUsd(form.receive ?? 0)}`,
		receiveHint: outbound ? t('crypto.wallet.swap.toYourWallet') : t('crypto.wallet.swap.toYourBalance'),
		rate,
		feeFree,
		badge: feeFree ? t('crypto.wallet.swap.noFee') : undefined,
		rows: detailRows({ t, direction, form, feeFree, chainName, registered, limitAvailable }),
		notices: notices({ t, direction, form, pair, chainName, inUnsupported, retrying, inError, pairsLoaded, pairsFailed }),
		ctaLabel: ctaLabel({ t, retrying, inUnsupported, form }),
		ctaEnabled: retrying || (form.canReview && !inUnsupported && !busy),
		inUnsupported,
		reviewNotice: outbound ? t('crypto.wallet.swap.reviewNoticeOut') : t('crypto.wallet.swap.reviewNoticeIn'),
		confirmLabel: outbound ? t('crypto.wallet.swap.confirmOut') : t('crypto.wallet.swap.confirmIn'),
		reviewFrom: card(pay, form.amount ?? ''),
		reviewTo: card(receiveSide, receiveAmount),
		authSubtitle: t('crypto.wallet.swap.authSubtitle', { amount: form.amount ?? '', symbol }),
	}
}
