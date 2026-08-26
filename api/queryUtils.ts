/**
 * Utilidades compartidas para queries infinitas.
 */
import type { InfiniteData } from '@tanstack/react-query'

/**
 * Recorta una query infinita a su primera página. Se usa en los
 * pull-to-refresh (histórico de transacciones, pedidos del marketplace…):
 * sin el recorte, `refetch()` revalidaría TODAS las páginas cargadas en
 * cadena (una petición por página); recortando antes, un refresh vuelve a ser
 * una sola petición que trae la página 1 fresca.
 *
 * @param data - Caché de la query infinita.
 * @returns La misma caché con solo la primera página.
 */
export const trimToFirstPage = <T extends InfiniteData<unknown, unknown>>(data: T | undefined): T | undefined =>
	(data && data.pages.length > 1 ? { pages: data.pages.slice(0, 1), pageParams: data.pageParams.slice(0, 1) } as T : data)
