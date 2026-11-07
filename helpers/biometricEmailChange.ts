import AsyncStorage from '@react-native-async-storage/async-storage'

/**
 * El login biométrico guarda correo y contraseña detrás de la biometría, así que no se
 * puede saber qué correo tiene sin pedir Face ID. Cuando el correo de la cuenta cambia,
 * esa credencial queda vieja, y el login manual con el correo nuevo no volvería a ofrecer
 * la biometría porque ve que ya hay una guardada. Esto deja anotado el correo de antes
 * para detectarlo. Sobrevive al logout a propósito: el cambio cierra todas las sesiones.
 */
const STORAGE_KEY = '@qpauth:email-before-change'

const sameEmail = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase()

/** Anota el correo actual mientras hay un cambio en curso. */
export const rememberEmailBeforeChange = async (email: string) => {
	try { await AsyncStorage.setItem(STORAGE_KEY, email) } catch { /* solo se pierde el aviso */ }
}

/** El cambio se canceló: la credencial guardada sigue valiendo. */
export const forgetEmailBeforeChange = async () => {
	try { await AsyncStorage.removeItem(STORAGE_KEY) } catch { /* nada que limpiar */ }
}

/**
 * ¿La credencial biométrica guardada es de un correo que ya no es el de la cuenta?
 * Entrar con el correo anotado no cuenta: el cambio aún no se ha hecho.
 *
 * @param loginEmail - Correo con el que se acaba de entrar a mano.
 * @returns true una sola vez, cuando hay que volver a ofrecer la biometría.
 */
export const biometricsOutdatedFor = async (loginEmail: string) => {
	try {
		const before = await AsyncStorage.getItem(STORAGE_KEY)
		if (!before || sameEmail(before, loginEmail)) { return false }
		await AsyncStorage.removeItem(STORAGE_KEY)
		return true
	} catch { return false }
}
