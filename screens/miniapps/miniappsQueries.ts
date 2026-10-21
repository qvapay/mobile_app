import { useQuery } from '@tanstack/react-query'
import type { QueryClient, UseQueryResult } from '@tanstack/react-query'

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

const withoutGrant = (app: MiniApp): MiniApp => ({ ...app, granted: false, granted_scopes: [] })

/**
 * Tras quitar el acceso, la caché deja de decir «concedido» AL MOMENTO, en la
 * ficha, el directorio y la lista de Ajustes, y después se revalida todo.
 * qpweb trata cualquier `authorize` como consentimiento: si la ficha siguiera
 * con `granted` hasta el refetch (o para siempre, si el refetch falla), el
 * siguiente login de la mini-app se firmaría sin enseñar la hoja.
 * `invalidateQueries` cancela además un refetch que ya iba en vuelo con el
 * dato de antes.
 */
export const forgetGrant = (queryClient: QueryClient, slug: string): Promise<void> => {
	queryClient.setQueryData<MiniApp>(miniAppDetailKey(slug), app => app && withoutGrant(app))
	queryClient.setQueryData<MiniApp[]>(MINIAPPS_LIST_KEY, list => list?.map(app => app.slug === slug ? withoutGrant(app) : app))
	queryClient.setQueryData<MiniAppGrant[]>(MINIAPPS_GRANTS_KEY, grants => grants?.filter(grant => grant.slug !== slug))
	return queryClient.invalidateQueries({ queryKey: MINIAPPS_ROOT })
}

/** Permisos concedidos (Ajustes → Apps conectadas). */
export const useMiniAppGrants = (): UseQueryResult<MiniAppGrant[]> => useQuery({
	queryKey: MINIAPPS_GRANTS_KEY,
	queryFn: async () => unwrap(await miniappsApi.grants()) ?? [],
	meta: { noPersist: true },
})
