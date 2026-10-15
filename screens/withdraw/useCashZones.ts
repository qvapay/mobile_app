/**
 * Zonas de entrega de efectivo de la moneda elegida (`GET /withdraw/cash-zones`).
 *
 * Solo se piden para monedas cuyo formulario tiene provincia (select) + municipio;
 * la respuesta se cachea por tick en el estado del hook (volver a la moneda no
 * repite la petición). Un fallo se recuerda como "sin zonas" ⇒ comportamiento previo.
 */

import { useEffect, useState } from 'react'

import { withdrawApi } from '../../api/withdrawApi'
import type { CashZonesPayload } from './cashZones'

const EMPTY: CashZonesPayload = { coin: '', margin_pct: 0, zones: [] }

export type CashZonesResult = { data: CashZonesPayload | null, isLoading: boolean }

/**
 * @param tick - Ticker de la moneda elegida (null si no hay).
 * @param enabled - Si el formulario de la moneda tiene campos de provincia y municipio.
 * @returns La respuesta para ese tick con estado de carga, o datos vacíos si no aplica.
 */
export default function useCashZones(tick: string | null | undefined, enabled: boolean): CashZonesResult {

	const [byTick, setByTick] = useState<Record<string, CashZonesPayload>>({})
	const [loadingTicks, setLoadingTicks] = useState<Set<string>>(new Set())
	const cached = tick ? byTick[tick] : undefined
	const isLoading = !!(tick && enabled && loadingTicks.has(tick))

	useEffect(() => {
		if (!tick || !enabled || cached) return
		let alive = true
		setLoadingTicks(prev => new Set(prev).add(tick))
		const store = (payload: CashZonesPayload) => {
			if (alive) {
				setByTick(prev => ({ ...prev, [tick]: payload }))
				setLoadingTicks(prev => { const next = new Set(prev); next.delete(tick); return next })
			}
		}
		Promise.resolve()
			.then(() => withdrawApi.cashZones(tick))
			.then((res) => {
				const data = res?.success ? res.data : null
				store(data && Array.isArray(data.zones) ? data : { ...EMPTY, coin: tick })
			})
			.catch(() => store({ ...EMPTY, coin: tick }))
		return () => { alive = false }
	}, [tick, enabled, cached])

	return { data: enabled && cached ? cached : null, isLoading }
}
