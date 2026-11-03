import { useQuery } from '@tanstack/react-query'

import { userApi } from '../api/userApi'
import { unwrap } from '../api/unwrap'
import { parseBlockStatus } from '../screens/p2p/userModeration'
import type { BlockStatus } from '../screens/p2p/userModeration'

/**
 * Estado de bloqueo entre el usuario y otro (`GET /user/block?uuid=`): lo leen el
 * perfil P2P (banner + menú ⋯) y el trade room (menú del chat). Bloquear/desbloquear
 * escribe la clave con `setQueryData` para que todas las superficies cambien a la vez.
 *
 * Sin persistir: es un flag de relación que vale centavos pedir y un «bloqueado» viejo
 * en disco enseñaría un banner falso al arrancar.
 */
export const userBlockKey = (uuid: string) => ['user', 'block', uuid] as const

export const userBlockQuery = (uuid: string) => ({
	queryKey: userBlockKey(uuid),
	queryFn: async (): Promise<BlockStatus> => parseBlockStatus(unwrap(await userApi.getBlockStatus(uuid))),
	staleTime: 30 * 1000,
	meta: { noPersist: true },
})

/** `enabled` false = sin uuid, perfil propio o sin sesión (la ruta exige token). */
export const useUserBlockQuery = (uuid: string | null | undefined, enabled = true) =>
	useQuery({ ...userBlockQuery(uuid ?? ''), enabled: !!uuid && enabled })
