import AsyncStorage from '@react-native-async-storage/async-storage'
import { QueryClient } from '@tanstack/react-query'
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister'
import { shouldRetry } from './unwrap'

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
			// En React Native no hay foco de ventana; activarlo exigiría cablear
			// `focusManager` a AppState, y no queremos refetch sorpresa en el piloto
			refetchOnWindowFocus: false,
		},
	},
})

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
})

export const persistOptions = {
	persister,
	maxAge: PERSIST_MAX_AGE_MS,
	buster: appJson.version,
}
