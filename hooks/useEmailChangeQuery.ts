import { useQuery } from '@tanstack/react-query'

// API
import { userApi } from '../api/userApi'
import { unwrap } from '../api/unwrap'

/**
 * Estado del cambio de correo (`GET /user/update/email`): la entrada de Datos personales
 * y la pantalla leen lo mismo. Sin persistir y sin `staleTime`: de aquí salen qué pruebas
 * vale pedir y si hay un cambio en curso, y un dato viejo enseñaría una puerta equivocada.
 */
export const EMAIL_CHANGE_KEY = ['user', 'email-change'] as const

export const EMAIL_CHANGE_QUERY = {
	queryKey: EMAIL_CHANGE_KEY,
	queryFn: async () => unwrap(await userApi.getEmailChangeState()),
	meta: { noPersist: true },
}

export default function useEmailChangeQuery() {
	return useQuery(EMAIL_CHANGE_QUERY)
}
