/**
 * Utilidades compartidas para queries infinitas.
 */

/**
 * Recorta una query infinita a su primera página. Se usa en los
 * pull-to-refresh (histórico de transacciones, pedidos del marketplace…):
 * sin el recorte, `refetch()` revalidaría TODAS las páginas cargadas en
 * cadena (una petición por página); recortando antes, un refresh vuelve a ser
 * una sola petición que trae la página 1 fresca.
 *
 * @param {{ pages: Array[], pageParams: number[] }|undefined} data - Caché de la query infinita.
 * @returns {*} La misma caché con solo la primera página.
 */
export const trimToFirstPage = (data) => (data?.pages?.length > 1 ? { pages: data.pages.slice(0, 1), pageParams: data.pageParams.slice(0, 1) } : data)
