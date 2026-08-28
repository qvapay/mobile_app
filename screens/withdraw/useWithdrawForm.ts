/**
 * Estado y aritmética del formulario de retiro: catálogo de monedas, moneda
 * elegida, el par de montos QUSD↔coin que se derivan el uno del otro, los
 * campos dinámicos de `working_data` y la vista previa del fee.
 *
 * Se extrajo de `Withdraw.tsx` (que rondaba las 480 líneas de cuerpo) para que
 * la pantalla se quede con la composición y este módulo con las cuentas. El
 * paso de PIN vive aparte en `useWithdrawSubmit`.
 *
 * Las fórmulas NO cambian: `calculateFee`/`grossFromNet` siguen siendo la
 * misma tarifa que cobra el servidor (`withdrawFees.ts`).
 */

import { useEffect, useEffectEvent, useMemo, useRef, useState, useReducer } from 'react'

import { isCryptoCoin } from './withdrawDestination'
import type { WithdrawDestination } from './withdrawDestination'
import { calculateFee, grossFromNet, getSelectFeePct, keyFromFieldName } from './withdrawFees'
import type { WorkingForm } from './withdrawFees'
import useCoins from '../../hooks/useCoins'

// API
import { withdrawApi } from '../../api/withdrawApi'
import type { LightningDecodePayload } from '../../api/withdrawApi'

// User Context
import { useAuth } from '../../auth/AuthContext'

// Types
import type { Coin, CoinWorkingField } from '../../types/domain'

/** Mínimo de sats por redención (espejo de MIN_SATS_REDEEM en el backend). */
export const MIN_SATS_REDEEM = 100

// USD (neto) -> cantidad en coin
const usdToCoin = (usdNet: number, coin: Coin | null | undefined): number => {
	if (!coin) return 0
	const price = Number(coin.price)
	if (!coin.stable && price > 0) return usdNet / price
	return usdNet
}

// Cantidad en coin -> USD (neto)
const coinToUsd = (coinAmount: number, coin: Coin | null | undefined): number => {
	if (!coin) return 0
	const price = Number(coin.price)
	if (!coin.stable && price > 0) return coinAmount * price
	return coinAmount
}

/** Acción del reducer genérico: `field` y `value` correlacionados por clave. */
type SetFieldAction<S> = { [K in keyof S]: { type: 'set', field: K, value: S[K] } }[keyof S]

/** Slices de estado relacionados que comparten el reducer de abajo. */
type AmountState = { amountQUSD: string, amountCoin: string }
type CoinState = { availableCoins: Coin[], selectedCoin: Coin | null, showCoinPicker: boolean }

// Generic field setter for the related-state slices below
function setFieldReducer<S extends object>(state: S, action: SetFieldAction<S>): S {
	switch (action.type) {
		case 'set':
			// La clave computada ensancha el tipo del literal: se reafirma S
			return { ...state, [action.field]: action.value } as S
		default:
			return state
	}
}

/** Params de navegación que prellenan el formulario. */
type WithdrawFormParams = {
	/** Moneda preseleccionada (p. ej. USDCASH desde CashDeliveryCard). */
	preselectedCoin?: string
	/** Factura Lightning escaneada (Scan → parseLightningQR). */
	lnInvoice?: string
	/** Monto en sats que trae la factura (0 = factura sin monto). */
	lnAmountSats?: number
}

/**
 * Formulario de retiro: monedas, montos, campos dinámicos y fees.
 *
 * @param params - `route.params` relevantes (preselección y factura Lightning).
 * @returns Estado del formulario, handlers y derivados de validación.
 */
export default function useWithdrawForm({ preselectedCoin, lnInvoice, lnAmountSats = 0 }: WithdrawFormParams) {

	const { user } = useAuth()
	const { coins: coinCatalog, isLoading: loadingCoins } = useCoins('out')

	// GOLD paga fee_out_gold en el servidor — la vista previa debe usar la misma tarifa
	const isGold = !!user?.golden_check

	// Amount swap (same-named setters keep every call site unchanged)
	const [amountState, dispatchAmount] = useReducer(setFieldReducer<AmountState>, { amountQUSD: '', amountCoin: '' })
	const { amountQUSD, amountCoin } = amountState
	const setAmountQUSD = (value: string) => dispatchAmount({ type: 'set', field: 'amountQUSD', value })
	const setAmountCoin = (value: string) => dispatchAmount({ type: 'set', field: 'amountCoin', value })

	// Coin selection
	const [coinState, dispatchCoin] = useReducer(setFieldReducer<CoinState>, { availableCoins: [], selectedCoin: null, showCoinPicker: false })
	const { availableCoins, selectedCoin, showCoinPicker } = coinState
	const setAvailableCoins = (value: Coin[]) => dispatchCoin({ type: 'set', field: 'availableCoins', value })
	const setSelectedCoin = (value: Coin | null) => dispatchCoin({ type: 'set', field: 'selectedCoin', value })
	const setShowCoinPicker = (value: boolean) => dispatchCoin({ type: 'set', field: 'showCoinPicker', value })

	const [workingForm, setWorkingForm] = useState<WorkingForm>({})
	const [balance] = useState(user?.balance || 0)

	// Origen de fondos para BTCLN: balance USD o redención de sats de cashback
	const [source, setSource] = useState<'balance' | 'satoshis'>('balance')
	const [amountSats, setAmountSats] = useState(lnAmountSats > 0 ? String(lnAmountSats) : '')
	const [lnInfo, setLnInfo] = useState<LightningDecodePayload | null>(null)

	// Crypto destination gate (own wallet vs third parties)
	const [destination, setDestination] = useState<WithdrawDestination | null>(null)
	const isCrypto = isCryptoCoin(selectedCoin)

	const isBTCLN = selectedCoin?.tick === 'BTCLN'
	const sourceSats = isBTCLN && source === 'satoshis'
	const availableSats = Number(user?.satoshis) || 0
	// Una factura con monto fijo manda: ambos modos quedan bloqueados en ese monto
	const amountLocked = isBTCLN && lnAmountSats > 0

	// Fetch available coins enabled_out
	// El catálogo llega de useCoins (caché compartida): la lista se pinta al
	// instante en vez de esperar un viaje a la red cada vez que se entra
	// La preselección se aplica UNA vez: el catálogo cambia de identidad al
	// hidratar desde disco y otra vez al llegar el de red, y sin esta guarda el
	// segundo pase revertía la moneda que el usuario ya hubiera elegido
	const didPreselectRef = useRef(false)
	useEffect(() => {
		if (!coinCatalog.length) return
		setAvailableCoins(coinCatalog)

		if (preselectedCoin && !didPreselectRef.current) {
			const coin = coinCatalog.find(c => c.tick === preselectedCoin)
			if (coin) {
				didPreselectRef.current = true
				setSelectedCoin(coin)
				return
			}
		}

	}, [coinCatalog, preselectedCoin])

	// La moneda elegida es un objeto capturado: al llegar el catálogo fresco el
	// selector mostraba el precio nuevo mientras el formulario seguía
	// calculando comisión y conversión con el viejo. Se refresca en su sitio,
	// sin tocar la elección del usuario, y solo cuando el precio cambió (si no,
	// cada revalidación provocaría un render de más)
	useEffect(() => {
		if (!selectedCoin || !coinCatalog.length) return
		const fresh = coinCatalog.find(c => c.tick === selectedCoin.tick)
		if (fresh && fresh.price !== selectedCoin.price) { setSelectedCoin(fresh) }
	}, [coinCatalog, selectedCoin]) // eslint-disable-line react-hooks/exhaustive-deps

	// Decimals to render for the coin amount input
	const coinDecimals = useMemo(() => {
		const d = Number(selectedCoin?.decimals)
		return Number.isFinite(d) && d >= 0 ? d : 2
	}, [selectedCoin])

	// Prefill de la factura escaneada una vez que BTCLN resuelve del fetch de coins:
	// destino al campo `wallet` del working_data, monto derivado de la factura (si trae),
	// y decode informativo (descripción/expiración) con fallo silencioso.
	const applyLnPrefill = useEffectEvent(() => {
		// Los casts de `lnInvoice`: el efecto de abajo solo dispara este evento con la factura presente
		const walletField = workingFields.find((field) => (field.name || '').toLowerCase() === 'wallet')
		if (walletField) { setWorkingForm((prev) => ({ ...prev, [keyFromFieldName(walletField.name)]: lnInvoice as string })) }
		if (lnAmountSats > 0) { handleChangeAmountCoin((lnAmountSats / 1e8).toFixed(8)) }
		withdrawApi.decodeLightning(lnInvoice as string).then((res) => { if (res.success) { setLnInfo(res.data as LightningDecodePayload) } }).catch(() => { })
	})
	useEffect(() => {
		if (lnInvoice && selectedCoin?.tick === 'BTCLN') { applyLnPrefill() }
	}, [lnInvoice, selectedCoin])

	// QUSD bruto -> cantidad en coin (descontando fee)
	const handleChangeQUSD = (value: string) => {
		setAmountQUSD(value)
		const num = Number(value)
		if (selectedCoin && !isNaN(num) && num > 0) {
			const totalFee = calculateFee(num, selectedCoin, { isGold, selectFeePct })
			const netUsd = num - totalFee
			const netInCoin = usdToCoin(netUsd, selectedCoin)
			setAmountCoin(netInCoin > 0 ? netInCoin.toFixed(coinDecimals) : '')
		} else {
			setAmountCoin('')
		}
	}

	// Cantidad en coin -> QUSD bruto requerido (sumando fee)
	const handleChangeAmountCoin = (value: string) => {
		setAmountCoin(value)
		const coinAmt = Number(value)
		if (selectedCoin && !isNaN(coinAmt) && coinAmt > 0) {
			const netUsd = coinToUsd(coinAmt, selectedCoin)
			const requiredQUSD = grossFromNet(netUsd, selectedCoin, { isGold, selectFeePct })
			setAmountQUSD(requiredQUSD > 0 ? String(Math.round(requiredQUSD * 100) / 100) : '')
		} else {
			setAmountQUSD('')
		}
	}

	// Working data parsing
	const workingFields = useMemo<CoinWorkingField[]>(() => {
		if (!selectedCoin || !selectedCoin.working_data) { return [] }
		try {
			// La columna Json puede llegar ya parseada o como string JSON
			const raw: unknown = typeof selectedCoin.working_data === 'string' ? JSON.parse(selectedCoin.working_data) : selectedCoin.working_data
			return Array.isArray(raw) ? raw as CoinWorkingField[] : []
		} catch (e) {
			return []
		}
	}, [selectedCoin])

	// Recargo % por opción elegida en campos `select` (p. ej. logística por
	// provincia de USDCASH) — el servidor lo suma al fee, la vista previa también
	const selectFeePct = useMemo(() => getSelectFeePct(workingFields, workingForm), [workingFields, workingForm])

	// Fee total de la vista previa (para el desglose bajo la tarjeta de monto)
	const previewFee = useMemo(() => {
		const num = Number(amountQUSD)
		if (!selectedCoin || isNaN(num) || num <= 0) return 0
		return calculateFee(num, selectedCoin, { isGold, selectFeePct })
	}, [amountQUSD, selectedCoin, isGold, selectFeePct])

	// Elegir provincia (o refrescar el precio de la coin) cambia el fee después
	// de tecleado el monto: se re-deriva el lado "Recibir" desde el bruto vigente
	const resyncReceiveAmount = useEffectEvent(() => {
		const num = Number(amountQUSD)
		if (!selectedCoin || isNaN(num) || num <= 0) return
		const totalFee = calculateFee(num, selectedCoin, { isGold, selectFeePct })
		const netInCoin = usdToCoin(num - totalFee, selectedCoin)
		setAmountCoin(netInCoin > 0 ? netInCoin.toFixed(coinDecimals) : '')
	})
	useEffect(() => { resyncReceiveAmount() }, [selectFeePct, selectedCoin])

	const isFormValid = useMemo(() => {
		if (!selectedCoin) { return false }
		if (isCrypto && destination !== 'personal') { return false }
		if (sourceSats) {
			const sats = Number(amountSats)
			if (!Number.isInteger(sats) || sats < MIN_SATS_REDEEM || sats > availableSats) { return false }
		} else {
			const amount = Number(amountQUSD)
			if (!amount || isNaN(amount)) { return false }
		}
		return workingFields.every((field) => {
			const key = keyFromFieldName(field.name)
			const value = (workingForm[key] ?? '').toString().trim()
			return value.length > 0
		})
	}, [selectedCoin, isCrypto, destination, sourceSats, amountSats, availableSats, amountQUSD, workingFields, workingForm])

	const handleCoinSelect = (coin: Coin) => {
		setSelectedCoin(coin)
		setShowCoinPicker(false)
		setDestination(null)
		if (coin?.tick !== 'BTCLN') { setSource('balance') }
		if (amountQUSD) {
			const num = Number(amountQUSD)
			if (!isNaN(num) && num > 0) {
				// El form se resetea con la moneda nueva — sin recargo de select aún
				const totalFee = calculateFee(num, coin, { isGold })
				const netUsd = num - totalFee
				const netInCoin = usdToCoin(netUsd, coin)
				const decimals = Number.isFinite(Number(coin?.decimals)) && Number(coin?.decimals) >= 0 ? Number(coin.decimals) : 2
				setAmountCoin(netInCoin > 0 ? netInCoin.toFixed(decimals) : '')
			}
		}
		setWorkingForm({})
	}

	/** Limpia montos y campos dinámicos tras un retiro confirmado. */
	const resetAmounts = () => {
		setAmountQUSD('')
		setAmountCoin('')
		setAmountSats('')
		setWorkingForm({})
	}

	return {
		// Catálogo y selección
		availableCoins, selectedCoin, showCoinPicker, setShowCoinPicker, handleCoinSelect, loadingCoins,
		// Montos
		amountQUSD, amountCoin, handleChangeQUSD, handleChangeAmountCoin, balance, amountLocked,
		// Origen de fondos (BTCLN)
		source, setSource, amountSats, setAmountSats, sourceSats, availableSats, isBTCLN, lnInfo,
		// Destino crypto
		isCrypto, destination, setDestination,
		// Campos dinámicos y fees
		workingFields, workingForm, setWorkingForm, selectFeePct, previewFee,
		// Validación y limpieza
		isFormValid, resetAmounts,
	}
}
