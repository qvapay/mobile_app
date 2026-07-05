// URL absoluta de un asset en el CDN (media.qvapay.com).
//
// El backend a veces devuelve rutas con slash inicial (ej. `/operators/claro-com.png`,
// generadas por resolveBrandLogo en qpweb): concatenarlas a la base produce doble
// slash y S3 responde 403 — por eso se normaliza aquí. Las URLs ya absolutas
// (http/https) pasan intactas.
export const MEDIA_BASE_URL = 'https://media.qvapay.com'

export function mediaUrl(path) {
	if (!path) return null
	if (path.startsWith('http')) return path
	return `${MEDIA_BASE_URL}/${path.replace(/^\/+/, '')}`
}
