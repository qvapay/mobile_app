import { useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'

// API
import { userApi } from '../api/userApi'
import { unwrap } from '../api/unwrap'

// Auth
import { useAuth } from '../auth/AuthContext'

// Tipos
import type { User } from '../types/domain'

/**
 * El perfil (`/user/extended`) como query: la misma que pide el Home, para que un
 * refresco desde cualquier pantalla deje su caché al día.
 */
export const PROFILE_QUERY = {
	queryKey: ['home', 'profile'] as const,
	queryFn: async () => unwrap(await userApi.getUserProfile()),
}

/**
 * Relee el perfil y lo vuelca en el AuthContext.
 *
 * Lo que cambia fuera de la app (vincular Telegram en el bot, verificar la identidad,
 * comprar GOLD en la web) solo llegaba al contexto cuando el Home volvía a pedir su
 * perfil, y un Home congelado por `enableFreeze` no corre su efecto: tras desvincular y
 * volver a vincular Telegram, el P2P seguía pidiendo Telegram hasta reiniciar la app.
 *
 * @returns Función estable que devuelve el perfil nuevo, o null si no se pudo leer
 *   (el contexto se queda como estaba).
 */
export default function useProfileRefresh() {

	const queryClient = useQueryClient()
	const { updateUser } = useAuth()

	return useCallback(async (): Promise<User | null> => {
		try {
			const profile = await queryClient.fetchQuery({ ...PROFILE_QUERY, staleTime: 0 })
			if (profile) { updateUser(profile) }
			return profile ?? null
		} catch { return null }
	}, [queryClient, updateUser])
}
