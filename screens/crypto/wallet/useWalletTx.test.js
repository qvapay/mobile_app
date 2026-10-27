/**
 * El núcleo de firmar y difundir: un pago que salió hacia la red no se paga dos veces.
 *
 * Una difusión que falla por red es AMBIGUA: el nodo pudo aceptar la tx y perderse la
 * respuesta. Si después la tx caduca (TRON ~60 s, blockhash de Solana) y el motor la tira
 * para construir otra, el usuario confirma de nuevo y la segunda también se ejecuta. La
 * cadena de mentira de estos tests ejecuta TODA tx que un nodo acepta, oiga la app lo que
 * oiga, que es exactamente lo que hace la de verdad.
 * @jest-environment node
 */
import React from 'react'
import { act, create } from 'react-test-renderer'
import { ChainHttpError } from '../../../wallet/chains/http'
import useWalletTx from './useWalletTx'

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms))
/** Más que el tick de 30 ms que el motor cede al spinner antes de firmar. */
const settle = () => act(async () => { await sleep(60) })

const T0 = 1_800_000_000_000
const VALIDITY_MS = 60_000
let clock

beforeEach(() => {
	clock = T0
	jest.spyOn(Date, 'now').mockImplementation(() => clock)
})
afterEach(() => { jest.restoreAllMocks() })

/** Cadena de mentira: lo que un nodo acepta se ejecuta; `lookup` contesta como lo haría un nodo. */
const makeChain = ({ expires = true } = {}) => {
	const chain = {
		executed: [],
		built: 0,
		/** La cadena ya pasó la vigencia de las tx construidas hasta ahora (TRON: head ≥ expiration). */
		pastExpiry: false,
		build: async () => {
			chain.built += 1
			return { id: `tx-${chain.built}`, summary: { expiresAt: expires ? Date.now() + VALIDITY_MS : null } }
		},
		sign: async (prepared) => ({ txid: prepared.id }),
		execute: (txid) => { if (!chain.executed.includes(txid)) chain.executed.push(txid) },
		lookup: async (_prepared, signed) => {
			if (chain.executed.includes(signed.txid)) return { status: 'landed', txid: signed.txid }
			return chain.pastExpiry ? { status: 'dropped' } : { status: 'unknown' }
		},
	}
	return chain
}

const Probe = ({ args, out }) => {
	out.tx = useWalletTx(args)
	return null
}

const mount = (args) => {
	const out = {}
	let tree
	act(() => { tree = create(<Probe args={args} out={out} />) })
	return { out, rerender: (next) => act(() => { tree.update(<Probe args={next} out={out} />) }), unmount: () => act(() => { tree.unmount() }) }
}

/** El usuario confirma con su PIN/biometría. */
const confirm = (out) => act(async () => { await out.tx.onAuthorized(); await sleep(10) })
/** El usuario pulsa "Reintentar". */
const retry = (out) => act(async () => { out.tx.retry(); await sleep(60) })

/** El envío consta UNA vez, con esa tx, y como duplicado (ya estaba en la red) o no. */
const expectSentOnce = (onSent, txid, duplicate) => {
	expect(onSent).toHaveBeenCalledTimes(1)
	expect(onSent.mock.calls[0][0]).toBe(txid)
	expect(onSent.mock.calls[0][2]).toBe(duplicate)
}

const baseArgs = (chain, submit, extra = {}) => ({
	ready: true,
	build: chain.build,
	sign: chain.sign,
	submit,
	onSent: jest.fn(),
	describeError: (err) => (err?.name === 'TxUnconfirmedError' ? 'unconfirmed' : String(err?.message ?? err)),
	lookup: chain.lookup,
	...extra,
})

test('la respuesta de la difusión se pierde y el usuario reintenta tras caducar: no paga dos veces', async () => {
	const chain = makeChain()
	let loseResponse = true
	const submit = jest.fn(async (_prepared, signed) => {
		chain.execute(signed.txid) // el nodo la aceptó…
		if (loseResponse) { loseResponse = false; throw new Error('Network request failed') } // …y la respuesta no llegó
		return { txid: signed.txid, duplicate: false }
	})
	const args = baseArgs(chain, submit)
	const { out, unmount } = mount(args)
	await settle()

	await confirm(out)
	expect(out.tx.phase).toBe('error')

	clock += VALIDITY_MS + 1_000 // vuelve la cobertura un minuto después
	await retry(out)
	if (out.tx.phase === 'ready') await confirm(out) // si la pantalla vuelve a pedir confirmación, el usuario confirma

	expect(chain.executed).toEqual(['tx-1'])
	expectSentOnce(args.onSent, 'tx-1', true)
	unmount()
})

test('el nodo contesta "caducada" a la re-difusión de una tx que YA se ejecutó: no se reconstruye', async () => {
	const chain = makeChain()
	let call = 0
	const submit = jest.fn(async (_prepared, signed) => {
		call += 1
		if (call === 1) { chain.execute(signed.txid); throw new Error('Network request failed') }
		// java-tron valida la expiración ANTES que el duplicado (Manager.processTransaction)
		if (chain.executed.includes(signed.txid)) throw new ChainHttpError('tron: broadcast rechazado (TRANSACTION_EXPIRATION_ERROR): Transaction expired', { retryable: false })
		chain.execute(signed.txid)
		return { txid: signed.txid, duplicate: false }
	})
	const args = baseArgs(chain, submit)
	const { out, unmount } = mount(args)
	await settle()

	await confirm(out)
	await retry(out) // dentro de la vigencia según nuestro reloj: re-difunde la MISMA tx
	if (out.tx.phase === 'ready') await confirm(out)

	expect(chain.executed).toEqual(['tx-1'])
	expectSentOnce(args.onSent, 'tx-1', true)
	unmount()
})

test('nuestro reloj da la tx por caducada pero la red aún puede incluirla: espera en vez de firmar otra', async () => {
	// Solana: `expiresAt` es una estimación local de 60 s; la red la acepta hasta lastValidBlockHeight
	const chain = makeChain()
	let first = true
	const submit = jest.fn(async (_prepared, signed) => {
		if (first) { first = false; throw new Error('Network request failed') } // aún en vuelo, sin ejecutar
		chain.execute(signed.txid)
		return { txid: signed.txid, duplicate: false }
	})
	const args = baseArgs(chain, submit)
	const { out, unmount } = mount(args)
	await settle()

	await confirm(out)
	clock += VALIDITY_MS + 1_000
	await retry(out)
	if (out.tx.phase === 'ready') await confirm(out)
	chain.execute('tx-1') // la primera aterriza al fin

	expect(chain.built).toBe(1)
	expect(chain.executed).toEqual(['tx-1'])
	expect(out.tx.phase).toBe('error')
	expect(out.tx.error).toBe('unconfirmed')

	await retry(out) // y al volver a preguntar, consta como enviada
	expectSentOnce(args.onSent, 'tx-1', true)
	unmount()
})

test('una tx que la red ya no puede incluir se reconstruye y se firma de nuevo (el reintento sigue funcionando)', async () => {
	const chain = makeChain()
	let first = true
	const submit = jest.fn(async (_prepared, signed) => {
		if (first) { first = false; throw new Error('Network request failed') } // nunca llegó
		chain.execute(signed.txid)
		return { txid: signed.txid, duplicate: false }
	})
	const args = baseArgs(chain, submit)
	const { out, unmount } = mount(args)
	await settle()

	await confirm(out)
	clock += VALIDITY_MS + 1_000
	chain.pastExpiry = true // la cadena ya pasó su vigencia y no la tiene
	await retry(out)
	expect(out.tx.phase).toBe('ready')
	await confirm(out)

	expect(chain.executed).toEqual(['tx-2'])
	expectSentOnce(args.onSent, 'tx-2', false)
	unmount()
})

test('una reconstrucción por cambio de datos (p. ej. el nivel de comisión) tampoco tira una firma ya difundida', async () => {
	const chain = makeChain({ expires: false }) // EVM: sin vigencia, el nonce es lo que la ata
	const submit = jest.fn(async (_prepared, signed) => {
		chain.execute(signed.txid)
		throw new Error('Network request failed')
	})
	const args = baseArgs(chain, submit, { lookup: undefined })
	const { out, rerender, unmount } = mount(args)
	await settle()
	await confirm(out)

	// Otro nivel de comisión = otro `build` = el motor se reconstruye solo
	rerender({ ...args, build: async () => chain.build() })
	await settle()
	if (out.tx.phase === 'ready') await confirm(out)

	expect(chain.executed).toEqual(['tx-1'])
	expect(out.tx.phase).toBe('error')
	unmount()
})

test('sin vigencia (EVM, Bitcoin), "Reintentar" re-difunde la MISMA tx', async () => {
	const chain = makeChain({ expires: false })
	let first = true
	const submit = jest.fn(async (_prepared, signed) => {
		const already = chain.executed.includes(signed.txid)
		chain.execute(signed.txid)
		if (first) { first = false; throw new Error('Network request failed') }
		return { txid: signed.txid, duplicate: already }
	})
	const args = baseArgs(chain, submit)
	const { out, unmount } = mount(args)
	await settle()

	await confirm(out)
	clock += 10 * 60_000
	await retry(out)

	expect(chain.built).toBe(1)
	expect(submit.mock.calls.map(([, signed]) => signed.txid)).toEqual(['tx-1', 'tx-1'])
	expectSentOnce(args.onSent, 'tx-1', true)
	unmount()
})
