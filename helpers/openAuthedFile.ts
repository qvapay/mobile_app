import { Platform } from 'react-native'
import ReactNativeBlobUtil from 'react-native-blob-util'

import { getAuthToken } from '../api/client'

export type OpenAuthedFileResult = 'opened' | 'no-token' | 'failed'

type OpenAuthedFileOptions = {
	url: string
	/** Nombre dentro de la caché. Sin rutas: lo genera quien llama, nunca el servidor ni el usuario. */
	fileName: string
	mime: string
	/** Android sin ninguna app que abra ese tipo. */
	onNoViewer?: () => void
}

const pathInCache = (fileName: string) => `${ReactNativeBlobUtil.fs.dirs.CacheDir}/${fileName}`

/**
 * Descarga un fichero que exige el token y lo abre con el visor del sistema: Quick Look en iOS y
 * la app que el usuario elija en Android. Vale igual para PDF e imágenes.
 *
 * @returns `opened` si la descarga fue bien, `no-token` sin sesión y `failed` ante cualquier otra
 * respuesta. blob-util escribe el cuerpo del error en `path`, así que ahí se borra el fichero.
 */
export const openAuthedFile = async ({ url, fileName, mime, onNoViewer }: OpenAuthedFileOptions): Promise<OpenAuthedFileResult> => {
	const token = await getAuthToken()
	if (!token) return 'no-token'

	const path = pathInCache(fileName)
	const res = await ReactNativeBlobUtil.config({ path }).fetch('GET', url, { Authorization: `Bearer ${token}`, Accept: mime })
	if (res.info().status !== 200) {
		await ReactNativeBlobUtil.fs.unlink(path).catch(() => { })
		return 'failed'
	}

	// Sin await: la promesa se resuelve al abrir el visor, no al cerrarlo
	if (Platform.OS === 'ios') { ReactNativeBlobUtil.ios.openDocument(res.path()) }
	else { Promise.resolve(ReactNativeBlobUtil.android.actionViewIntent(res.path(), mime)).catch(() => onNoViewer?.()) }
	return 'opened'
}

/**
 * Borra de la caché los ficheros con ese prefijo. Como no se sabe cuándo se cierra el visor, los
 * temporales privados se barren antes de cada descarga, al salir de la pantalla y en el logout.
 * Nunca lanza: no hay nada que hacer si falla.
 */
export const sweepCachedFiles = async (prefix: string): Promise<void> => {
	try {
		const names = await ReactNativeBlobUtil.fs.ls(ReactNativeBlobUtil.fs.dirs.CacheDir)
		await Promise.all(names.filter(name => name.startsWith(prefix)).map(name => ReactNativeBlobUtil.fs.unlink(pathInCache(name)).catch(() => { })))
	} catch { /* silent */ }
}
