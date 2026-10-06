import { useQuery } from '@tanstack/react-query'
import type { UseQueryResult } from '@tanstack/react-query'

import { miniappsApi } from '../../api/miniappsApi'
import { unwrap } from '../../api/unwrap'
import type { MiniApp, MiniAppGrant } from '../../types/domain'

/** Raíz del dominio: `invalidateQueries(MINIAPPS_ROOT)` refresca directorio, fichas y permisos. */
export const MINIAPPS_ROOT = ['miniapps'] as const
export const MINIAPPS_LIST_KEY = ['miniapps', 'list'] as const
export const MINIAPPS_GRANTS_KEY = ['miniapps', 'grants'] as const
export const miniAppDetailKey = (slug: string) => ['miniapps', 'detail', slug] as const

/**
 * Directorio de mini-apps. Cambia poco (alta manual por admin): 5 min de
 * frescura y se persiste para que la pantalla pinte al instante.
 */
export const useMiniAppsList = (): UseQueryResult<MiniApp[]> => useQuery({
	queryKey: MINIAPPS_LIST_KEY,
	queryFn: async () => unwrap(await miniappsApi.list()) ?? [],
	staleTime: 5 * 60_000,
	placeholderData: previous => previous,
})

/**
 * Ficha de una mini-app al abrirla. SIEMPRE fresca y sin persistir: de aquí
 * salen los orígenes permitidos del WebView y el estado del consentimiento,
 * y una copia vieja podría abrir una mini-app ya suspendida.
 */
export const useMiniAppDetail = (slug: string): UseQueryResult<MiniApp> => useQuery({
	queryKey: miniAppDetailKey(slug),
	queryFn: async () => {
		const app = unwrap(await miniappsApi.detail(slug))
		if (!app) throw new Error('Mini-app not found')
		return app
	},
	staleTime: 0,
	gcTime: 0,
	meta: { noPersist: true },
})

/** Permisos concedidos (Ajustes → Apps conectadas). */
export const useMiniAppGrants = (): UseQueryResult<MiniAppGrant[]> => useQuery({
	queryKey: MINIAPPS_GRANTS_KEY,
	queryFn: async () => unwrap(await miniappsApi.grants()) ?? [],
	meta: { noPersist: true },
})
