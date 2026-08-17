import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'

// API
import { userApi } from '../../api/userApi'
import { unwrap } from '../../api/unwrap'

// La fuente "enviados recientes" es LA MISMA query del pago rápido del Home:
// compartir la clave `['home', 'quickpay']` deduplica la petición entre ambas
// pantallas y hace que cualquiera de las dos refresque a la otra
import { useQuickPayQuery } from '../../hooks/useQuickPayQuery'

/** Contactos guardados con avatar (el carrusel es puramente visual). */
export const useContactsQuery = () => useQuery({
	queryKey: ['contacts'],
	queryFn: async () => {
		const data = unwrap(await userApi.getContacts())
		// El endpoint ha devuelto ambas formas: lista directa o { contacts: [...] }
		const list = Array.isArray(data) ? data : (data?.contacts || [])
		return list.map(c => c?.Contact || {}).filter(u => u.uuid && u.image)
	},
	placeholderData: previous => previous,
})

/**
 * Mezcla del carrusel: enviados recientes primero, luego contactos, deduplicado
 * por uuid y solo usuarios con avatar. Pura para poder testearla sola.
 *
 * @param {Array} [sent] - Destinatarios recientes (ya filtrados por imagen).
 * @param {Array} [contacts] - Contactos guardados.
 * @returns {Array} Usuarios únicos con imagen, en orden de relevancia.
 */
export const mergeCarousel = (sent = [], contacts = []) => {
	const seen = new Set()
	const combined = []
	for (const u of [...sent, ...contacts]) {
		if (u?.uuid && u.image && !seen.has(u.uuid)) {
			seen.add(u.uuid)
			combined.push(u)
		}
	}
	return combined
}

/**
 * Carrusel de destinatarios de Send: dos queries independientes (recientes +
 * contactos) que salen EN PARALELO — la versión anterior las encadenaba con dos
 * `await` seguidos — y se mezclan memoizadas. Si una fuente falla, la otra
 * pinta igual, y React Query conserva el último dato bueno de cada una (antes,
 * un fallo parcial escribía en caché la mezcla incompleta).
 *
 * @returns {Array} Usuarios del carrusel, listos para renderizar.
 */
export const useSendCarousel = () => {

	const sent = useQuickPayQuery()
	const contacts = useContactsQuery()

	return useMemo(
		() => mergeCarousel(sent.data, contacts.data),
		[sent.data, contacts.data]
	)
}
