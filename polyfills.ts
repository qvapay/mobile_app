/**
 * Polyfills globales de criptografía — DEBE ser el primer import de index.js:
 * cualquier módulo evaluado antes vería un `global.crypto` inexistente.
 * `install()` parchea global.crypto (react-native-quick-crypto, C++/Nitro) y
 * global.Buffer; de él dependen @scure/bip39 (entropía de la seed), @noble y
 * viem. Si el polyfill falta, es mejor reventar en el arranque de desarrollo
 * que generar una seed con mala entropía en producción.
 */
import { install } from 'react-native-quick-crypto'

install()

if (__DEV__) {
	const c = (globalThis as { crypto?: { getRandomValues?: (b: Uint8Array) => Uint8Array, subtle?: { digest?: unknown } } }).crypto
	if (typeof c?.getRandomValues !== 'function' || typeof c?.subtle?.digest !== 'function') {
		throw new Error('polyfills: react-native-quick-crypto no instaló crypto.getRandomValues/subtle.digest')
	}
}
