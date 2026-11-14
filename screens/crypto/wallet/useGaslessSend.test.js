/**
 * Canjear un permiso de envío gratis. Lo que se fija aquí: nunca se pasa a «pagar» sin saber
 * qué fue del envío gratis.
 *
 * En Solana la patrocinada y la pagada son transacciones distintas y pueden entrar las dos.
 * Antes, cuando el nodo aceptaba la tx ya co-firmada y la respuesta se perdía, el backend
 * contestaba «no se gastó nada», la pantalla ofrecía pagar, y el usuario enviaba dos veces.
 * Y al revés: un permiso caducado dejaba la pantalla en «no pudimos confirmar» para siempre.
 * @jest-environment node
 */
jest.mock('../../../api/walletApi', () => ({
	walletApi: { gaslessQuote: jest.fn(), gaslessSubmit: jest.fn(), gaslessGet: jest.fn(), gaslessCancel: jest.fn(async () => ({ success: true })) },
}))
// El ref tiene que ser SIEMPRE el mismo objeto (como el de verdad): el hook lo lleva en las dependencias de un efecto
jest.mock('../../../hooks/useIdempotencyKey', () => {
	const ref = { current: 'idem-1' }
	return { useIdempotencyKey: () => ref }
})

import React from 'react'
import { act, create } from 'react-test-renderer'
import { walletApi } from '../../../api/walletApi'
import useGaslessSend from './useGaslessSend'

const USDT_SOL = { chainKey: 'solana', contract: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB' }
const USDT_BSC = { chainKey: 'bsc', contract: '0x55d398326f99059fF775485246999027B3197955' }
const TX = 'tx-firmada-en-base64'

const grantFor = (chain) => ({ uuid: 'g-1', chain, fee_payer: chain === 'solana' ? 'PAYER' : null, expires_at: '2099-01-01T00:00:00Z' })
const outcome = (over = {}) => ({ success: true, status: 200, data: { status: 'confirmed', reason: null, rebuild: false, retryable: false, signature: 'SIG', explorer: null, message: null, ...over } })
const failed = (status, details, error = 'error del servidor') => ({ success: false, status, details, error })

let tree
let hook
const Probe = ({ asset }) => {
	hook = useGaslessSend({ asset, to: 'DEST', amount: '1000000' })
	return null
}
const mount = async (asset = USDT_SOL) => {
	walletApi.gaslessQuote.mockResolvedValue({ success: true, data: { eligible: true, grant: grantFor(asset.chainKey), remaining_today: 0, renews_at: null } })
	await act(async () => { tree = create(<Probe asset={asset} />) })
	expect(hook.state.phase).toBe('eligible')
}
/** Canjea y devuelve el resultado, o el error que lanzó. */
const submit = async (tx = TX) => {
	let result
	await act(async () => { result = await hook.bridge.submit(tx).catch(error => ({ thrown: error })) })
	return result
}

beforeEach(() => { jest.clearAllMocks(); jest.useFakeTimers() })
afterEach(() => {
	act(() => { tree?.unmount() })
	jest.useRealTimers()
})

describe('lo que el backend PRUEBA que no se gastó', () => {
	test('presupuesto agotado: se suelta el permiso (devolviéndolo a la cuota) y el envío pasa a pagarse', async () => {
		await mount()
		walletApi.gaslessSubmit.mockResolvedValue(outcome({ status: 'authorized', signature: null, reason: 'daily_budget', message: 'No disponible ahora' }))
		const result = await submit()
		expect(result.thrown.name).toBe('TxNotSentError')
		expect(walletApi.gaslessCancel).toHaveBeenCalledWith('g-1')
		expect(hook.state.phase).toBe('failed')
		expect(hook.bridge).toBeNull()
	})

	test('blockhash caducado: se reconstruye gratis con el mismo permiso', async () => {
		await mount()
		walletApi.gaslessSubmit.mockResolvedValue(outcome({ status: 'authorized', signature: null, reason: 'blockhash_expired', rebuild: true }))
		expect(await submit()).toEqual({ rebuild: true })
		expect(hook.bridge).not.toBeNull()
		expect(walletApi.gaslessCancel).not.toHaveBeenCalled()
	})

	test('confirmada: listo', async () => {
		await mount()
		walletApi.gaslessSubmit.mockResolvedValue(outcome())
		expect(await submit()).toEqual({ txid: 'SIG' })
	})
})

describe('Solana: lo que NO está probado nunca deja pagar', () => {
	const expectUnconfirmed = (result) => {
		expect(result.thrown.name).toBe('TxUnconfirmedError')
		// Ni se devuelve el permiso (pudo gastarse) ni se quita el puente (el motor puede tener que reenviar la misma tx)
		expect(walletApi.gaslessCancel).not.toHaveBeenCalled()
		expect(hook.state.phase).not.toBe('failed')
		expect(hook.bridge).not.toBeNull()
	}

	// El agujero: el nodo aceptó la tx y la respuesta se perdió
	test('la difusión falló sin saberse si entró: «sin confirmar», y NO se ofrece pagar', async () => {
		await mount()
		walletApi.gaslessSubmit.mockResolvedValue(outcome({ status: 'authorized', signature: null, reason: 'broadcast_failed' }))
		expectUnconfirmed(await submit())
	})

	test('sin respuesta del backend (red, timeout): igual', async () => {
		await mount()
		walletApi.gaslessSubmit.mockResolvedValue({ success: false, error: 'No se ha podido conectar con el servidor' })
		expectUnconfirmed(await submit())
	})

	test.each([['failed', 'never_reserved'], ['review', 'reserved_unpaid']])('el backend la da por %s (%s): tampoco consta que no saliera', async (status, reason) => {
		await mount()
		walletApi.gaslessSubmit.mockResolvedValue(outcome({ status, signature: null, reason }))
		expectUnconfirmed(await submit())
	})

	// Una vez que ESTA tx pudo salir, lo que el backend diga después no prueba nada
	test.each([
		['«no se gastó nada» (probado para ESTA petición)', outcome({ status: 'authorized', signature: null, reason: 'not_sponsorable' })],
		['«reconstruye»', outcome({ status: 'authorized', signature: null, reason: 'blockhash_expired', rebuild: true })],
		['«el permiso caducó»', failed(409, { code: 'GRANT_EXPIRED' })],
		['«demasiadas peticiones»', failed(429, { code: 'RATE_LIMITED' })],
	])('tras un intento sin desenlace, reintentar la MISMA tx y que conteste %s sigue siendo «sin confirmar»', async (_label, second) => {
		await mount()
		walletApi.gaslessSubmit.mockResolvedValueOnce({ success: false, error: 'timeout' })
		expectUnconfirmed(await submit())
		walletApi.gaslessSubmit.mockResolvedValueOnce(second)
		expectUnconfirmed(await submit())
	})

	test('si en el reintento el backend ya la tiene confirmada, es el envío', async () => {
		await mount()
		walletApi.gaslessSubmit.mockResolvedValueOnce({ success: false, error: 'timeout' })
		await submit()
		walletApi.gaslessSubmit.mockResolvedValueOnce(failed(409, { code: 'GRANT_NOT_AVAILABLE', status: 'confirmed', signature: 'SIG' }))
		expect(await submit()).toEqual({ txid: 'SIG' })
	})

	test('una tx NUEVA (la anterior se dio por perdida) vuelve a empezar limpia', async () => {
		await mount()
		walletApi.gaslessSubmit.mockResolvedValueOnce({ success: false, error: 'timeout' })
		await submit('tx-vieja')
		walletApi.gaslessSubmit.mockResolvedValueOnce(outcome({ status: 'authorized', signature: null, reason: 'blockhash_expired', rebuild: true }))
		expect(await submit('tx-nueva')).toEqual({ rebuild: true })
	})
})

describe('difundida sin confirmar (`pending`)', () => {
	test('se enseña «confirmando» y se persigue hasta verla confirmada; con firma tampoco es «enviado» sin más', async () => {
		await mount()
		walletApi.gaslessSubmit.mockResolvedValue(outcome({ status: 'pending', signature: 'SIG' }))
		walletApi.gaslessGet.mockResolvedValueOnce({ success: true, data: { uuid: 'g-1', status: 'pending', signature: 'SIG' } })
		walletApi.gaslessGet.mockResolvedValue({ success: true, data: { uuid: 'g-1', status: 'confirmed', signature: 'SIG' } })
		let result
		await act(async () => {
			const pending = hook.bridge.submit(TX)
			await Promise.resolve(); await Promise.resolve()
			await jest.advanceTimersByTimeAsync(3_000)
			await jest.advanceTimersByTimeAsync(3_000)
			result = await pending
		})
		expect(result).toEqual({ txid: 'SIG' })
		expect(walletApi.gaslessGet).toHaveBeenCalledTimes(2)
	})

	test('mientras se persigue, el estado es `pending` y el puente sigue vivo', async () => {
		await mount()
		walletApi.gaslessSubmit.mockResolvedValue(outcome({ status: 'pending', signature: null }))
		walletApi.gaslessGet.mockResolvedValue({ success: true, data: { uuid: 'g-1', status: 'pending', signature: null } })
		let pending
		await act(async () => { pending = hook.bridge.submit(TX).catch(error => ({ thrown: error })); await Promise.resolve(); await Promise.resolve() })
		expect(hook.state.phase).toBe('pending')
		expect(hook.bridge).not.toBeNull()
		await act(async () => { await jest.advanceTimersByTimeAsync(95_000) })
		expect((await pending).thrown.name).toBe('TxUnconfirmedError')
	})

	test('si el backend acaba dándola por fallida, no consta que no saliera: «sin confirmar»', async () => {
		await mount()
		walletApi.gaslessSubmit.mockResolvedValue(outcome({ status: 'pending', signature: null }))
		walletApi.gaslessGet.mockResolvedValue({ success: true, data: { uuid: 'g-1', status: 'failed', signature: null, reason: 'never_reserved' } })
		let result
		await act(async () => {
			const pending = hook.bridge.submit(TX).catch(error => ({ thrown: error }))
			await Promise.resolve(); await Promise.resolve()
			await jest.advanceTimersByTimeAsync(3_000)
			result = await pending
		})
		expect(result.thrown.name).toBe('TxUnconfirmedError')
		expect(walletApi.gaslessCancel).not.toHaveBeenCalled()
	})
})

// Antes un permiso caducado dejaba la pantalla en «no pudimos confirmar» para siempre
describe('el backend rechaza la petición antes de mandar nada', () => {
	test('el permiso caducó (primer intento): no se envió nada, se suelta y se pasa a pagar', async () => {
		await mount()
		walletApi.gaslessSubmit.mockResolvedValue(failed(409, { code: 'GRANT_EXPIRED' }, 'El permiso caducó; pide uno nuevo'))
		const result = await submit()
		expect(result.thrown.name).toBe('TxNotSentError')
		expect(result.thrown.message).toBe('El permiso caducó; pide uno nuevo')
		expect(hook.state.phase).toBe('failed')
		expect(hook.bridge).toBeNull()
	})

	test('demasiadas peticiones: no se envió nada y el permiso sigue vivo para reintentar gratis', async () => {
		await mount()
		walletApi.gaslessSubmit.mockResolvedValue(failed(429, { code: 'RATE_LIMITED' }, 'Demasiadas solicitudes'))
		const result = await submit()
		expect(result.thrown.name).toBe('TxNotSentError')
		expect(hook.state.phase).toBe('eligible')
		expect(hook.bridge).not.toBeNull()
	})
})

describe('BSC: el nonce impide que entren las dos', () => {
	test('una difusión fallida sí deja pagar', async () => {
		await mount(USDT_BSC)
		walletApi.gaslessSubmit.mockResolvedValue(outcome({ status: 'authorized', signature: null, reason: 'broadcast_failed', message: 'No disponible ahora' }))
		const result = await submit('0xraw')
		expect(result.thrown.name).toBe('TxNotSentError')
		expect(walletApi.gaslessCancel).toHaveBeenCalledWith('g-1')
		expect(hook.state.phase).toBe('failed')
	})

	test('un fallo en la cadena llega con su mensaje', async () => {
		await mount(USDT_BSC)
		walletApi.gaslessSubmit.mockResolvedValue(outcome({ status: 'failed', signature: '0xhash', reason: 'reverted', message: 'La transacción no se pudo completar en la red' }))
		const result = await submit('0xraw')
		expect(result.thrown.name).toBe('Error')
		expect(result.thrown.message).toBe('La transacción no se pudo completar en la red')
	})
})

describe('aclarar un envío sin desenlace (lo usa el motor)', () => {
	test('el backend solo vale como prueba de que SÍ entró', async () => {
		await mount()
		walletApi.gaslessSubmit.mockResolvedValue({ success: false, error: 'timeout' })
		await submit()

		walletApi.gaslessGet.mockResolvedValue({ success: true, data: { uuid: 'g-1', status: 'confirmed', signature: 'SIG' } })
		expect(await hook.resolver.lookup()).toEqual({ status: 'landed', txid: 'SIG' })
		// Que NO entró lo dice la cadena, nunca el backend
		for (const status of ['failed', 'expired', 'cancelled', 'pending', 'submitted', 'review', 'authorized']) {
			walletApi.gaslessGet.mockResolvedValue({ success: true, data: { uuid: 'g-1', status, signature: null } })
			expect(await hook.resolver.lookup()).toEqual({ status: 'unknown' })
		}
		walletApi.gaslessGet.mockResolvedValue({ success: false, error: 'red' })
		expect(await hook.resolver.lookup()).toEqual({ status: 'unknown' })
	})

	test('sin haber canjeado nada no hay por quién preguntar', async () => {
		await mount()
		expect(await hook.resolver.lookup()).toEqual({ status: 'unknown' })
		expect(walletApi.gaslessGet).not.toHaveBeenCalled()
	})

	test('la cadena confirma que no entró: el permiso (a medias en el servidor) se suelta y el envío pasa a pagarse', async () => {
		await mount()
		walletApi.gaslessSubmit.mockResolvedValue({ success: false, error: 'timeout' })
		await submit()
		act(() => { hook.resolver.dropped() })
		expect(hook.state.phase).toBe('failed')
		expect(hook.bridge).toBeNull()
		// No se «cancela»: en el servidor ese permiso ya está canjeado a medias
		expect(walletApi.gaslessCancel).not.toHaveBeenCalled()
	})
})

describe('al salir de la pantalla', () => {
	test('un permiso sin usar se devuelve a la cuota', async () => {
		await mount()
		act(() => { tree.unmount() })
		tree = null
		expect(walletApi.gaslessCancel).toHaveBeenCalledWith('g-1')
	})

	test('uno que pudo gastarse NO se devuelve', async () => {
		await mount()
		walletApi.gaslessSubmit.mockResolvedValue({ success: false, error: 'timeout' })
		await submit()
		act(() => { tree.unmount() })
		tree = null
		expect(walletApi.gaslessCancel).not.toHaveBeenCalled()
	})
})
