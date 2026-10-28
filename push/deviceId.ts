import * as Keychain from 'react-native-keychain'

/**
 * Identificador de INSTALACIÓN para el registro de push: uuid v4 generado la
 * primera vez y guardado en el Keychain/Keystore (servicio propio, como
 * `com.qvapay.walletid` en wallet/keystore.ts). En iOS sobrevive a una
 * reinstalación, así que el backend reemplaza el token viejo del mismo
 * dispositivo en vez de acumular filas; en Android el Keystore se va con la
 * app y la reinstalación cuenta como dispositivo nuevo (el token viejo caduca
 * solo cuando FCM lo da por inválido).
 *
 * No es un identificador del usuario ni del hardware: no sale de aquí.
 */
const SERVICE = 'com.qvapay.pushdevice'
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

/** uuid v4 con el `crypto` global (polyfill de react-native-quick-crypto). */
export const randomUuidV4 = (): string | null => {
	const cryptoGlobal = (globalThis as { crypto?: { getRandomValues?: (b: Uint8Array) => Uint8Array } }).crypto
	if (!cryptoGlobal?.getRandomValues) return null
	const bytes = cryptoGlobal.getRandomValues(new Uint8Array(16))
	bytes[6] = (bytes[6] & 0x0f) | 0x40
	bytes[8] = (bytes[8] & 0x3f) | 0x80
	const hex = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('')
	return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

let deviceIdPromise: Promise<string | null> | null = null

const loadOrCreate = async (): Promise<string | null> => {
	try {
		const stored = await Keychain.getGenericPassword({ service: SERVICE })
		if (stored && UUID_RE.test(stored.password)) return stored.password
		const fresh = randomUuidV4()
		if (!fresh) return null
		await Keychain.setGenericPassword('pushdevice', fresh, {
			service: SERVICE,
			accessible: Keychain.ACCESSIBLE.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
		})
		return fresh
	} catch {
		return null
	}
}

/** El id de instalación (creándolo si no existe), o null si el Keychain falló. Memoizado. */
export const getPushDeviceId = (): Promise<string | null> => {
	if (!deviceIdPromise) {
		deviceIdPromise = loadOrCreate().then(id => {
			if (!id) deviceIdPromise = null // un fallo no se memoriza: el siguiente reintenta
			return id
		})
	}
	return deviceIdPromise
}
