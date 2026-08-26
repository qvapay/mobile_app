import { useQuery, type UseQueryResult } from '@tanstack/react-query'

// API
import { transferApi } from '../api/transferApi'
import { unwrap } from '../api/unwrap'

// Tipos de dominio
import type { QuickPayUser } from '../types/domain'

/**
 * Destinatarios recientes con avatar. Compartida por la fila de pago rápido
 * del Home y el carrusel de Send: misma clave = una sola petición y una sola
 * caché para ambas pantallas.
 *
 * Vive en `/hooks/` y no en `homeQueries` para que Send no arrastre el resto
 * de las queries del feed (blog, watchlist, promos) a sus tests; la clave se
 * queda bajo la raíz `['home', …]` a propósito, para que el pull-to-refresh
 * del Home (`refetchQueries(['home'])`) la siga revalidando.
 */
export const useQuickPayQuery = (): UseQueryResult<QuickPayUser[]> => useQuery({
	queryKey: ['home', 'quickpay'],
	queryFn: async () => {
		const users = await unwrap(await transferApi.getLatestSentTransfers(10))
		// Sin imagen no hay nada que pintar en la fila de avatares
		return (users || []).filter(u => u.image) as QuickPayUser[]
	},
	placeholderData: previous => previous,
})
