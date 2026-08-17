import { useQuery } from '@tanstack/react-query'

// API
import { savingApi } from '../api/savingApi'
import { unwrap } from '../api/unwrap'

/**
 * Resumen de ahorros (`GET /saving`): balance, tasa anual y agregados.
 *
 * Compartida por la página de ahorros del BalanceCard (Home) y la tarjeta de
 * Ahorros del dashboard de Invest: misma clave = una sola petición y una sola
 * caché para ambas superficies. BalanceCard la refetchea en el flanco de
 * subida del pull-to-refresh del Home; el onRefresh de Invest la incluye vía
 * `refetchQueries(['savings'])`.
 *
 * @returns {import('@tanstack/react-query').UseQueryResult}
 */
export const useSavingsSummaryQuery = () => useQuery({
	queryKey: ['savings', 'summary'],
	queryFn: async () => unwrap(await savingApi.getSummary()),
	placeholderData: previous => previous,
})
