import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'

// API
import { userApi } from '../../api/userApi'
import { unwrap } from '../../api/unwrap'

// Tipos
import type { EmbeddedUser } from '../../types/domain'

// La fuente "enviados recientes" es LA MISMA query del pago rápido del Home:
// compartir la clave `['home', 'quickpay']` deduplica la petición entre ambas
// pantallas y hace que cualquiera de las dos refresque a la otra
import { useQuickPayQuery } from '../../hooks/useQuickPayQuery'

/**
 * Usuario del carrusel de destinatarios: subset embebido más `lastname`
 * (la búsqueda local del modal de Send filtra por él).
 */
export type SendCarouselUser = EmbeddedUser & { lastname?: string | null }

/** Fila cruda del endpoint de contactos: el usuario viaja anidado en `Contact`. */
type ContactRow = { Contact?: SendCarouselUser | null } | null

/** Contactos guardados con avatar (el carrusel es puramente visual). */
export const useContactsQuery = () => useQuery({
	queryKey: ['contacts'],
	queryFn: async () => {
		// El módulo api tipa el cuerpo como unknown[]; el cast local fija las dos
		// formas que ha devuelto el endpoint: lista directa o { contacts: [...] }
		const data = unwrap(await userApi.getContacts()) as ContactRow[] | { contacts?: ContactRow[] } | null
		const list = Array.isArray(data) ? data : (data?.contacts || [])
		// Una pasada: desanida el Contact y descarta en el acto los que no tienen
		// uuid + image — el estrechamiento del if sustituye al cast
		const users: SendCarouselUser[] = []
		for (const row of list) {
			const contact = row?.Contact
			if (contact?.uuid && contact.image) { users.push(contact) }
		}
		return users
	},
	placeholderData: previous => previous,
})

/**
 * Mezcla del carrusel: enviados recientes primero, luego contactos, deduplicado
 * por uuid y solo usuarios con avatar. Pura para poder testearla sola.
 *
 * @param sent - Destinatarios recientes (ya filtrados por imagen).
 * @param contacts - Contactos guardados.
 * @returns Usuarios únicos con imagen, en orden de relevancia.
 */
export const mergeCarousel = (sent: SendCarouselUser[] = [], contacts: SendCarouselUser[] = []): SendCarouselUser[] => {
	const seen = new Set<string>()
	const combined: SendCarouselUser[] = []
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
 * @returns Usuarios del carrusel, listos para renderizar.
 */
export const useSendCarousel = (): SendCarouselUser[] => {

	const sent = useQuickPayQuery()
	const contacts = useContactsQuery()

	return useMemo(
		() => mergeCarousel(sent.data, contacts.data),
		[sent.data, contacts.data]
	)
}
