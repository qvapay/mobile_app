/**
 * Foto de perfil o portada elegida desde los ARCHIVOS del teléfono (PURO, testeado en node).
 *
 * La galería de Android es el selector de fotos del sistema, que en teléfonos anteriores a
 * Android 11 llega por los servicios de Google Play: sin ellos, o con ellos sin actualizar, no
 * abre. El explorador de archivos es del propio sistema y no depende de nada. Pero la galería
 * recodifica y reduce la foto antes de subirla y el explorador entrega el fichero tal cual, así
 * que aquí se comprueba lo que el servidor va a exigir (`POST /user/avatar` de qpweb).
 */

/** Tipos que acepta el servidor. */
export const AVATAR_FILE_TYPES = ['image/jpeg', 'image/png', 'image/gif']

/** Tope del servidor: 5 MB. */
export const AVATAR_FILE_MAX_BYTES = 5 * 1024 * 1024

export type AvatarFileIssue = 'type' | 'size'

/** El servidor trata `image/jpg` como JPEG, y hay exploradores que lo mandan así. */
export const normalizeAvatarType = (type: string | null | undefined): string => {
	const value = (type || '').toLowerCase()
	return value === 'image/jpg' ? 'image/jpeg' : value
}

/**
 * Por qué no se puede subir este fichero, o null si vale. Un tamaño desconocido no frena: lo
 * decide el servidor.
 *
 * @param file - Tipo MIME y tamaño que da el explorador de archivos.
 * @returns `type` (no es JPG, PNG ni GIF), `size` (más de 5 MB) o null.
 */
export const avatarFileIssue = (file: { type?: string | null, size?: number | null }): AvatarFileIssue | null => {
	if (!AVATAR_FILE_TYPES.includes(normalizeAvatarType(file.type))) { return 'type' }
	if (typeof file.size === 'number' && file.size > AVATAR_FILE_MAX_BYTES) { return 'size' }
	return null
}
