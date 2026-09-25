import { useCallback, useEffect, useMemo, useState } from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { useTranslation } from 'react-i18next'

// UI
import QPAssetSheet from './QPAssetSheet'
import type { QPAssetOption } from './QPAssetSheet'

// Helpers
import { coinConverted, coinTerms, formatCoinAmount, meaningfulCoinPrice } from '../helpers/coinFormat'

// Tipos
import type { Coin } from '../types/domain'

const MAX_QUICK_PILLS = 3

type QuickPillDefault = { tick: string, label: string }

type QPCoinPickerProps = {
	visible: boolean
	onClose: () => void
	onSelect: (coin: Coin) => void
	coins?: Coin[]
	selectedCoin?: Coin | null
	isLoading?: boolean
	amount?: string
	direction?: 'in' | 'out'
	recentKey?: string | null
	defaultCoins?: QuickPillDefault[]
	showFees?: boolean
}

/**
 * Selector de moneda del catálogo de QvaPay (Depositar, Retirar, P2P, Métodos de pago).
 *
 * Desde el barrido de selectores es un ADAPTADOR: la hoja, el buscador, las filas y los
 * accesos rápidos los pone `QPAssetSheet`, que es la misma pieza que usa el intercambio de
 * la wallet. Aquí solo vive lo que es propio del catálogo de monedas — traducir una `Coin` a
 * una opción (condiciones, precio, cuánto recibirías) y recordar las recientes.
 *
 * Tener dos selectores con dos estéticas hacía que el mismo USDT se viera distinto según
 * desde dónde se abriera, y que el buscador existiera en uno y no en el otro.
 *
 * @param props
 * @param props.visible - Controla la visibilidad.
 * @param props.onClose - Cierre (la hoja también cierra al elegir).
 * @param props.onSelect - Recibe la moneda elegida.
 * @param [props.coins] - Monedas habilitadas de `coinsApi`.
 * @param [props.selectedCoin] - La ya elegida: se marca con un check.
 * @param [props.amount] - Importe en USD para la conversión por moneda.
 * @param [props.direction='out'] - Qué juego de comisión/mínimo se enseña.
 * @param [props.recentKey] - Clave de AsyncStorage para las recientes; sin ella no se persisten.
 * @param [props.defaultCoins] - Accesos rápidos de relleno.
 * @param [props.showFees=true] - Oculta condiciones y conversión (modo P2P: solo identidad).
 */
const QPCoinPicker = ({
	visible,
	onClose,
	onSelect,
	coins = [],
	selectedCoin = null,
	isLoading = false,
	amount = '',
	direction = 'out',
	recentKey = null,
	defaultCoins = [],
	showFees = true,
}: QPCoinPickerProps) => {

	const { t } = useTranslation()
	const [recentTicks, setRecentTicks] = useState<string[]>([])

	useEffect(() => {
		if (!recentKey) { return }
		AsyncStorage.getItem(recentKey).then((stored) => {
			if (!stored) { return }
			try {
				const parsed: unknown = JSON.parse(stored)
				if (Array.isArray(parsed)) { setRecentTicks((parsed as string[]).slice(0, MAX_QUICK_PILLS)) }
			} catch { /* una clave corrupta no debe impedir elegir moneda */ }
		})
	}, [recentKey])

	const optionFor = useCallback((coin: Coin): QPAssetOption => {
		const converted = showFees ? coinConverted(coin, amount) : 0
		const terms = showFees ? coinTerms(t, coin, direction) : []
		return {
			id: coin.tick,
			title: coin.name,
			// Las condiciones importan más que la red: la red ya la dice el badge del logo
			subtitle: terms.length ? terms.join(' · ') : (coin.network ?? undefined),
			logoTick: coin.logo,
			networkTick: coin.network ?? null,
			value: converted > 0 ? formatCoinAmount(converted) : undefined,
			valueCaption: showFees ? (meaningfulCoinPrice(coin.price) ?? undefined) : undefined,
			// La búsqueda mira también el tick y la red: quien escribe "trc20" o "tron"
			// espera encontrar el USDT correcto
			keywords: `${coin.tick} ${coin.network ?? ''}`,
		}
	}, [t, amount, direction, showFees])

	const options = useMemo(() => coins.map(optionFor), [coins, optionFor])

	/** Recientes primero, rellenadas con las por defecto y sin repetir. */
	const quick = useMemo(() => {
		if (!coins.length || (!recentKey && !defaultCoins.length)) { return [] }
		const picked: QPAssetOption[] = []
		const push = (tick: string, label?: string) => {
			if (picked.length >= MAX_QUICK_PILLS || picked.some(p => p.id === tick)) { return }
			const coin = coins.find(c => c.tick === tick)
			if (coin) { picked.push({ ...optionFor(coin), title: label ?? coin.name }) }
		}
		for (const tick of recentTicks) { push(tick) }
		for (const fallback of defaultCoins) { push(fallback.tick, fallback.label) }
		return picked
	}, [coins, recentTicks, defaultCoins, recentKey, optionFor])

	const handleSelect = useCallback((tick: string) => {
		const coin = coins.find(c => c.tick === tick)
		if (!coin) { return }
		if (recentKey) {
			setRecentTicks((prev) => {
				const updated = [tick, ...prev.filter(x => x !== tick)].slice(0, MAX_QUICK_PILLS)
				AsyncStorage.setItem(recentKey, JSON.stringify(updated))
				return updated
			})
		}
		onSelect(coin)
	}, [coins, recentKey, onSelect])

	return (
		<QPAssetSheet
			visible={visible}
			title={t('ui.coinPicker.title')}
			options={options}
			quick={quick}
			selectedId={selectedCoin?.tick ?? null}
			onSelect={handleSelect}
			onClose={onClose}
			loading={isLoading}
		/>
	)
}

export default QPCoinPicker
