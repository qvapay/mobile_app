/**
 * uuid del perfil que abre `P2PUser`: el de la ruta tal cual o, si la ruta trae
 * un @usuario (`/p2p/u/<username>`, enlaces de las mini-apps), el que devuelve
 * el buscador para ESE username exacto (`peerLookup.ts`).
 *
 * El perfil propio no se busca: el uuid ya está en la sesión.
 */
import { useQuery } from '@tanstack/react-query'

import { userApi } from '../../api/userApi'
import { unwrap } from '../../api/unwrap'
import { useAuth } from '../../auth/AuthContext'
import { isUserUuid, normalizeUsername, pickUuidByUsername } from './peerLookup'

type PeerRef = { uuid?: string, username?: string }

export type PeerUuid = {
	/** '' mientras no se sabe (o si no existe): `usePeerProfile('')` no pide nada. */
	uuid: string
	/** El @usuario que se está buscando, ya sin la `@` (null si la ruta trae uuid). */
	username: string | null
	/** No hay a quién abrir: username sin coincidencia exacta, o un uuid/username sin forma. */
	notFound: boolean
	/** La búsqueda falló (red, 5xx): se puede reintentar. */
	error: string | null
	retry: () => void
}

export const usePeerUuid = ({ uuid, username }: PeerRef): PeerUuid => {

	const { user } = useAuth()
	const byUuid = uuid ? (isUserUuid(uuid) ? uuid : null) : undefined
	const name = byUuid === undefined ? normalizeUsername(username) : null
	const self = name && user?.uuid && user.username?.toLowerCase() === name.toLowerCase() ? user.uuid : null

	const query = useQuery({
		queryKey: ['user', 'by-username', name?.toLowerCase() ?? ''],
		queryFn: async () => pickUuidByUsername(unwrap(await userApi.searchUser(name as string, { silent: true })), name as string),
		enabled: !!name && !self,
		// Un username cambia muy de vez en cuando; el uuid nunca
		staleTime: 60 * 60 * 1000,
		meta: { noPersist: true },
	})

	if (byUuid !== undefined) {
		return { uuid: byUuid ?? '', username: null, notFound: byUuid === null, error: null, retry: () => {} }
	}
	if (!name) return { uuid: '', username: null, notFound: true, error: null, retry: () => {} }
	if (self) return { uuid: self, username: name, notFound: false, error: null, retry: () => {} }

	return {
		uuid: query.data ?? '',
		username: name,
		notFound: query.isSuccess && !query.data,
		error: query.isError && !query.data ? query.error.message : null,
		retry: () => { query.refetch() },
	}
}

export default usePeerUuid
