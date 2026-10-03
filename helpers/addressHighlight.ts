/**
 * Partición de una dirección de wallet para resaltar sus extremos (estilo
 * SafePal): los primeros y últimos N caracteres son los que un usuario compara
 * a ojo contra el destino, y los que un ataque de address poisoning imita.
 * PURO — sin react-native, testeable en node.
 */

/** Caracteres resaltados en cada extremo. */
export const ADDRESS_HIGHLIGHT = 6

/**
 * ¿Es el campo de dirección de un método de pago? Los `working_data` de las
 * monedas cripto lo llaman `Wallet` (retiro, métodos guardados, P2P).
 */
export const isWalletFieldName = (name: string | null | undefined): boolean => (name || '').trim().toLowerCase() === 'wallet'

/** Trozos de una dirección lista para pintar: `head` y `tail` van resaltados. */
export type AddressParts = { head: string, middle: string, tail: string }

/**
 * ¿Parece una dirección? Alfanumérica de punta a punta (base58, bech32, hex con
 * 0x, invoices Lightning) y lo bastante larga para dejar algo en medio. Un
 * texto libre, una URI `bitcoin:` o una Lightning address `user@dominio` no
 * pasan y se pintan tal cual.
 */
export const isAddressLike = (value: string | null | undefined, highlight = ADDRESS_HIGHLIGHT): value is string =>
	!!value && value.length > highlight * 2 && /^[A-Za-z0-9]+$/.test(value)

/**
 * Parte la dirección en extremo-medio-extremo. Con `visible`, el medio se
 * recorta con `…` dejando visibles `visible.head`/`visible.tail` caracteres por
 * lado (como `shortAddress`), y los extremos resaltados siguen siendo los
 * `highlight` de fuera.
 *
 * @param address - Dirección completa.
 * @param options.highlight - Caracteres resaltados por extremo (6).
 * @param options.visible - Recorte opcional del medio.
 * @returns Los trozos, o null si el valor no parece una dirección.
 */
export const splitAddress = (
	address: string | null | undefined,
	{ highlight = ADDRESS_HIGHLIGHT, visible }: { highlight?: number, visible?: { head: number, tail: number } } = {},
): AddressParts | null => {
	if (!isAddressLike(address, highlight)) return null
	const head = address.slice(0, highlight)
	const tail = address.slice(-highlight)
	const inner = address.slice(highlight, -highlight)
	if (!visible || address.length <= visible.head + visible.tail + 1) return { head, middle: inner, tail }
	const keepHead = Math.max(0, visible.head - highlight)
	const keepTail = Math.max(0, visible.tail - highlight)
	return { head, middle: `${inner.slice(0, keepHead)}…${keepTail ? inner.slice(-keepTail) : ''}`, tail }
}
