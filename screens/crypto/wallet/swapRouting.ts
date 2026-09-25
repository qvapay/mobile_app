/**
 * Qué motor atiende la combinación que el usuario ha elegido. Módulo PURO.
 *
 * La pantalla de intercambio es UNA, pero por detrás hay CUATRO caminos. El usuario no tiene
 * por qué saberlo, así que el camino se deriva de lo que ha seleccionado, no de un interruptor:
 *
 *   saldo ↔ QUSD      swap propio, instantáneo, 1:1 y sin comisión
 *   saldo → activo    retiro por el riel de QvaPay (comisión NUESTRA, sin terceros)
 *   activo → saldo    depósito por el mismo riel
 *   activo ↔ activo   agregador de proveedores
 *
 * Encadenar saldo → QUSD → activo NO es una opción: se comprobó contra las 1.282 monedas del
 * proveedor (23 sep 2026) y QUSD no está listado —es nuestro—, así que la segunda pata no
 * existiría. Los rieles de depósito/retiro, en cambio, ya cubren casi toda la wallet y son
 * nuestros: mejor comisión y sin ventana de custodia ajena.
 *
 * Que sea puro importa: es la regla que decide qué código toca el dinero, y probarla no
 * debería exigir montar la pantalla.
 */

/** Un lado del intercambio: el saldo custodial o un activo de la wallet. */
export type SwapSideRef = { kind: 'balance' } | { kind: 'asset', id: string }

export type SwapMode =
	/** Saldo QvaPay → activo del par (hoy QUSD). Motor `useSwapOut`. */
	| 'qusd-out'
	/** Activo del par → saldo QvaPay. Motor `useSwapIn`. */
	| 'qusd-in'
	/** Activo de la wallet → activo de la wallet. Agregador de proveedores. */
	| 'exchange'
	/** Saldo QvaPay → activo, por el riel de retiro de QvaPay. */
	| 'withdraw'
	/** Activo → saldo QvaPay, por el riel de depósito. */
	| 'deposit'
	/** La combinación no se puede hacer hoy, y hay que decir por qué. */
	| 'unsupported'

export type SwapRoute = {
	mode: SwapMode
	/** Clave i18n del motivo cuando `mode` es 'unsupported'. */
	reasonKey?: string
}

export const isBalance = (side: SwapSideRef | null | undefined): boolean => side?.kind === 'balance'

export const assetIdOf = (side: SwapSideRef | null | undefined): string | null =>
	side?.kind === 'asset' ? side.id : null

/**
 * @param pairAssetIds - assetIds que el backend publica como pares del swap custodial.
 *   Sale de `GET /swap/pairs`, no del registry local: si el backend deja de publicar un par,
 *   esa combinación deja de enrutarse sola.
 */
export const routeFor = ({ pay, receive, pairAssetIds, railOut = [], railIn = [] }: {
	pay: SwapSideRef | null
	receive: SwapSideRef | null
	/** assetIds publicados como par custodial por `GET /swap/pairs`. */
	pairAssetIds: string[]
	/** assetIds que el catálogo de monedas admite RETIRAR (`enabled_out`). */
	railOut?: string[]
	/** assetIds que el catálogo admite DEPOSITAR (`enabled_in`). */
	railIn?: string[]
}): SwapRoute => {

	if (!pay || !receive) { return { mode: 'unsupported', reasonKey: 'crypto.wallet.swap.cta.enterAmount' } }

	// El saldo QvaPay a los dos lados no es un intercambio
	if (isBalance(pay) && isBalance(receive)) { return { mode: 'unsupported', reasonKey: 'crypto.wallet.exchange.sameSide' } }

	const payAsset = assetIdOf(pay)
	const receiveAsset = assetIdOf(receive)

	// Los dos lados en la wallet: agregador, siempre que no sea el mismo activo
	if (payAsset && receiveAsset) {
		return payAsset === receiveAsset
			? { mode: 'unsupported', reasonKey: 'crypto.wallet.exchange.sameAsset' }
			: { mode: 'exchange' }
	}

	// Un lado es el saldo custodial. Tres caminos, por orden de calidad para el usuario.
	const walletAsset = payAsset ?? receiveAsset
	if (!walletAsset) { return { mode: 'unsupported', reasonKey: 'crypto.wallet.exchange.balanceOnlyQusd' } }

	// 1. Par publicado: instantáneo, 1:1 y sin comisión. Gana siempre que exista.
	if (pairAssetIds.includes(walletAsset)) { return { mode: isBalance(pay) ? 'qusd-out' : 'qusd-in' } }

	// 2. Riel propio de depósito/retiro. No es un swap, pero mueve exactamente lo que el
	//    usuario pidió, con comisión nuestra y sin que los fondos pasen por un tercero.
	if (isBalance(pay)) {
		return railOut.includes(walletAsset)
			? { mode: 'withdraw' }
			: { mode: 'unsupported', reasonKey: 'crypto.wallet.exchange.noRailOut' }
	}
	return railIn.includes(walletAsset)
		? { mode: 'deposit' }
		: { mode: 'unsupported', reasonKey: 'crypto.wallet.exchange.noRailIn' }
}

/** El motor QUSD necesita su sentido; el agregador no tiene sentido que elegir. */
export const directionFor = (mode: SwapMode): 'out' | 'in' | null =>
	mode === 'qusd-out' ? 'out' : mode === 'qusd-in' ? 'in' : null

/** Invertir cambia los dos lados de sitio, sea cual sea el motor. */
export const flip = <T,>(pay: T, receive: T): [T, T] => [receive, pay]

/**
 * ¿Este activo se puede intercambiar por algo, sea lo que sea?
 *
 * Lo usa la pantalla del activo para decidir si enseña "Intercambiar" o el enlace al
 * explorador. Basta UNA salida: el par custodial, el agregador o el riel de QvaPay. Si no
 * hay ninguna, ofrecer el botón sería llevar al usuario a una pantalla que solo sabe decirle
 * que no.
 *
 * @param isHouse - Es QUSD: siempre tiene su par custodial publicado.
 * @param supportedAssetIds - Lo que el proveedor lista (`GET /wallet/exchange/quote`).
 * @param railAssetIds - Lo que los rieles de depósito/retiro de QvaPay mueven.
 */
export const canSwapAsset = ({ assetId, isHouse, supportedAssetIds = [], railAssetIds = [] }: {
	assetId: string
	isHouse: boolean
	supportedAssetIds?: string[]
	railAssetIds?: string[]
}): boolean =>
	isHouse || supportedAssetIds.includes(assetId) || railAssetIds.includes(assetId)

