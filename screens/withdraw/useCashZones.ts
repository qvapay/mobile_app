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

/**
 * @param tick - Ticker de la moneda elegida (null si no hay).
 * @param enabled - Si el formulario de la moneda tiene campos de provincia y municipio.
 * @returns La respuesta para ese tick, o null mientras carga / si no aplica.
 */
export default function useCashZones(tick: string | null | undefined, enabled: boolean): CashZonesPayload | null {

	const [byTick, setByTick] = useState<Record<string, CashZonesPayload>>({})
	const cached = tick ? byTick[tick] : undefined

	useEffect(() => {
		if (!tick || !enabled || cached) return
		let alive = true
		const store = (payload: CashZonesPayload) => { if (alive) { setByTick(prev => ({ ...prev, [tick]: payload })) } }
		Promise.resolve()
			.then(() => withdrawApi.cashZones(tick))
			.then((res) => {
				const data = res?.success ? res.data : null
				store(data && Array.isArray(data.zones) ? data : { ...EMPTY, coin: tick })
			})
			.catch(() => store({ ...EMPTY, coin: tick }))
		return () => { alive = false }
	}, [tick, enabled, cached])

	return enabled && cached ? cached : null
}
