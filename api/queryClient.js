import AsyncStorage from '@react-native-async-storage/async-storage'
import { QueryClient } from '@tanstack/react-query'
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister'
import { shouldRetry, retryDelay } from './unwrap'

// La versión sale de app.json —la fuente de verdad del proyecto— y no de
// react-native-device-info: esa librería arrastra módulos nativos y dejaría
// esta capa de datos sin poder cargarse en los tests
import appJson from '../app.json'

// La caché persistida vive 24h, igual que el TTL más largo que ya usaba
// `helpers/dataCache.js`. `gcTime` DEBE cubrirla: con el valor por defecto de
// React Query (5 min) las queries se recolectarían mucho antes de que el
// persister llegara a rehidratarlas, y el arranque en frío quedaría vacío.
const PERSIST_MAX_AGE_MS = 24 * 60 * 60 * 1000

export const queryClient = new QueryClient({
	defaultOptions: {
		queries: {
			// Mismo comportamiento que hoy: cada montaje revalida. La hidratación
			// instantánea la da el persister, no un staleTime largo; las pantallas
			// que puedan permitirse datos más viejos lo suben caso a caso.
			staleTime: 0,
			gcTime: PERSIST_MAX_AGE_MS,
			retry: shouldRetry,
			retryDelay,
			// En React Native no hay foco de ventana; activarlo exigiría cablear
			// `focusManager` a AppState, y no queremos refetch sorpresa en el piloto
			refetchOnWindowFocus: false,
		},
	},
})

/**
 * Recorta toda query infinita a su primera página antes de escribirla a disco.
 *
 * Persistir las N páginas que alguien llegó a scrollear obligaría al próximo
 * arranque en frío a revalidarlas TODAS en cadena (una petición por página,
 * secuenciales). Con solo la primera se conserva la paridad con dataCache
 * (que cacheaba la primera página) y, al restaurar, `getNextPageParam` ve esa
 * página llena y el scroll infinito continúa desde la 2 con normalidad.
 *
 * @param {Object} persistedClient - Cliente deshidratado que va camino del storage.
 * @returns {Object} El mismo cliente con las queries infinitas recortadas.
 */
export const trimInfiniteQueries = (persistedClient) => ({
	...persistedClient,
	clientState: {
		...persistedClient.clientState,
		queries: persistedClient.clientState.queries.map(query => {
			const data = query.state?.data
			// La forma { pages, pageParams } identifica a una query infinita
			if (!Array.isArray(data?.pages) || data.pages.length <= 1) return query
			return {
				...query,
				state: {
					...query.state,
					data: { pages: data.pages.slice(0, 1), pageParams: data.pageParams.slice(0, 1) },
				},
			}
		}),
	},
})

/**
 * Qué queries merecen disco: las resueltas (igual que el criterio por defecto
 * de React Query) que no hayan pedido quedarse fuera con `meta.noPersist` —
 * p. ej. el histórico de transacciones filtrado o buscado, cuya combinación de
 * filtros es efímera y llenaría el storage de variantes muertas.
 *
 * @param {Object} query - Query candidata a deshidratarse.
 * @returns {boolean} Si debe persistirse.
 */
export const shouldPersistQuery = (query) => query.state.status === 'success' && query.meta?.noPersist !== true

/**
 * Persistencia en AsyncStorage: es lo que reemplaza la hidratación en frío de
 * `helpers/dataCache.js`. Sin esto, migrar a React Query sería una REGRESIÓN —
 * su caché es solo de memoria y muere al cerrar la app.
 *
 * `buster` con la versión de la app invalida todo tras una actualización, igual
 * que hacía `CACHE_VERSION` en dataCache: evita rehidratar datos con una forma
 * que el código nuevo ya no entiende.
 */
export const persister = createAsyncStoragePersister({
	storage: AsyncStorage,
	key: '@qpquery:v1',
	throttleTime: 1000,
	serialize: (client) => JSON.stringify(trimInfiniteQueries(client)),
})

export const persistOptions = {
	persister,
	maxAge: PERSIST_MAX_AGE_MS,
	buster: appJson.version,
	dehydrateOptions: {
		shouldDehydrateQuery: shouldPersistQuery,
	},
}
