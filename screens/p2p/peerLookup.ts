/**
 * Identificar a un usuario para abrir su perfil P2P (PURO, se testea con
 * `@jest-environment node`).
 *
 * El perfil (`GET /p2p/user/{uuid}`) solo se pide por uuid, pero un enlace
 * puede traer el @usuario (`/p2p/u/<username>`, el atajo de la web; o una
 * mini-app que enseña «@luke»). qpweb no tiene una ruta que traduzca un
 * username a uuid, así que la app lo resuelve con el buscador de usuarios
 * (`POST /user/search`) quedándose solo con la coincidencia EXACTA.
 */

// Los usernames nuevos solo llevan letras y números (3-20, `POST /user/update/username` de
// qpweb), pero hay cuentas antiguas con `.`, `_` o `-`: aquí solo se descarta lo que no
// puede ser un username (espacios, barras, rutas…) antes de mandarlo a ningún sitio
const USERNAME_RE = /^[A-Za-z0-9._-]{1,64}$/

// `users.uuid` es CHAR(36) en qpweb. Basta con la forma: lo que no la tenga no viaja en
// la ruta del perfil (un `../` ahí apuntaría a otra ruta de la API con la sesión puesta)
const UUID_RE = /^[0-9a-f-]{36}$/i

/** El username sin la `@` delante, o null si no tiene forma de username. */
export const normalizeUsername = (raw: unknown): string | null => {
	if (typeof raw !== 'string') return null
	const name = raw.trim().replace(/^@/, '')
	return USERNAME_RE.test(name) ? name : null
}

/** ¿Tiene forma de uuid de usuario? */
export const isUserUuid = (raw: unknown): raw is string => typeof raw === 'string' && UUID_RE.test(raw)

type SearchRow = { uuid?: unknown, username?: unknown, invite?: unknown }

/**
 * uuid del resultado del buscador cuyo username es EXACTAMENTE `username`.
 *
 * El buscador mezcla contactos por nombre, coincidencias parciales y la fila de
 * «invitar a este correo»; solo vale la exacta, sin distinguir mayúsculas (la
 * misma comparación que hace MySQL en el servidor).
 *
 * @param results - Respuesta de `POST /user/search` tal cual.
 * @param username - Ya normalizado con `normalizeUsername`.
 */
export const pickUuidByUsername = (results: unknown, username: string): string | null => {
	if (!Array.isArray(results)) return null
	const wanted = username.toLowerCase()
	for (const row of results as SearchRow[]) {
		if (!row || typeof row !== 'object' || row.invite) continue
		if (typeof row.username !== 'string' || row.username.toLowerCase() !== wanted) continue
		if (isUserUuid(row.uuid)) return row.uuid
	}
	return null
}
