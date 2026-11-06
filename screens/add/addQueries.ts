/**
 * Queries del depósito. Hoy solo el escaparate «Vía P2P» (ver `depositViaP2P.ts`):
 * las lecturas de catálogo viven en `hooks/useCoins` y la orden de depósito es una
 * mutación directa en `useDepositOrder`.
 */
import { useQuery } from '@tanstack/react-query'

import { p2pApi } from '../../api/p2pApi'
import { ApiError } from '../../api/unwrap'
import i18n from '../../i18n'
import { VIA_P2P_FETCH, VIA_P2P_PEER, composeShowcase } from './depositViaP2P'

import type { P2PIndexFilters } from '../../api/p2pApi'
import type { Showcase } from './depositViaP2P'

export const viaP2PShowcaseKey = (tick: string) => ['add', 'via-p2p', tick] as const

// Las mejores ofertas de VENTA (pestaña Comprar) de la moneda, solo fijas como en la web
const showcaseFilters = (coin: string): P2PIndexFilters => ({ coin, type: 'sell', orderBy: 'best_rate', order: 'desc', take: VIA_P2P_FETCH, offer_kind: 'fixed' })

type Options = { enabled: boolean, vip: boolean }

// `p2pApi.index` aplana el paginador fuera de `data` (`offers`, `promoted`), así que
// `unwrap` perdería justo eso: mismo contrato valor-o-excepción, a mano
const listOffers = async (filters: P2PIndexFilters) => {
	const result = await p2pApi.index(filters)
	if (!result.success) throw new ApiError(result.error || i18n.t('errors.unexpected'), result.status, result.details)
	return result
}

/**
 * Escaparate de ofertas P2P para una moneda «Vía P2P»: dos listados de
 * `GET /p2p/index` en paralelo (las de `@skymind` y las del mercado, que trae
 * además la promocionada del par) compuestos como lo hace la web.
 *
 * `enabled` lo decide la pantalla con `missingP2PRequirements`: sin acceso al
 * P2P el servidor responde 400 y no merece la petición. Se revalida a los 30 s
 * (lo que cachea el servidor) y no se persiste: una oferta tomada hace minutos
 * no debe reaparecer al arrancar.
 */
export const useViaP2PShowcaseQuery = (tick: string | null | undefined, { enabled, vip }: Options) => useQuery<Showcase>({
	queryKey: viaP2PShowcaseKey(tick ?? ''),
	queryFn: async () => {
		const coin = tick as string
		const [treasury, market] = await Promise.all([
			listOffers({ ...showcaseFilters(coin), peer: VIA_P2P_PEER }),
			listOffers(showcaseFilters(coin)),
		])
		return composeShowcase({
			treasury: treasury.offers,
			promoted: market.promoted?.offer ?? null,
			market: market.offers,
			vip,
		})
	},
	enabled: enabled && !!tick,
	staleTime: 30 * 1000,
	meta: { noPersist: true },
})
