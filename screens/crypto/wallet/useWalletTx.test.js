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
		/** Tx concretas que la cadena ya no puede incluir (su vigencia pasó; otras siguen vivas). */
		dropped: new Set(),
		build: async () => {
			chain.built += 1
			return { id: `tx-${chain.built}`, summary: { expiresAt: expires ? Date.now() + VALIDITY_MS : null } }
		},
		sign: async (prepared) => ({ txid: prepared.id }),
		execute: (txid) => { if (!chain.executed.includes(txid)) chain.executed.push(txid) },
		// Como el lookup real de TRON: identifica la tx por lo PREPARADO (su raw), no por la firma
		lookup: async (prepared) => {
			if (chain.executed.includes(prepared.id)) return { status: 'landed', txid: prepared.id }
			return chain.pastExpiry || chain.dropped.has(prepared.id) ? { status: 'dropped' } : { status: 'unknown' }
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
	describeError: (err) => (err?.name === 'TxUnconfirmedError' ? 'unconfirmed' : err?.name === 'TxExpiredError' ? 'expired' : String(err?.message ?? err)),
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

test('la tx caducó antes de poner el PIN: se avisa, no se firma, y Reintentar la prepara de nuevo', async () => {
	// Antes la reconstruía en silencio: el usuario ponía el PIN y la pantalla volvía a «Confirmar»
	const chain = makeChain()
	const sign = jest.fn(chain.sign)
	const submit = jest.fn(async (_prepared, signed) => {
		chain.execute(signed.txid)
		return { txid: signed.txid, duplicate: false }
	})
	const args = baseArgs(chain, submit, { sign })
	const { out, unmount } = mount(args)
	await settle()

	clock += VALIDITY_MS + 1_000
	await confirm(out)
	expect(out.tx.phase).toBe('error')
	expect(out.tx.error).toBe('expired')
	expect(sign).not.toHaveBeenCalled()
	expect(submit).not.toHaveBeenCalled()

	await retry(out)
	expect(out.tx.phase).toBe('ready')
	expect(chain.built).toBe(2)
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

// EVM, Bitcoin y Stacks no caducan: lo que deja una firma sin valor es que su nonce o sus
// inputs ya estén gastados. Y eso pudo hacerlo ella misma en un intento sin respuesta
describe('la red dice que lo que la tx gasta ya está gastado', () => {
	const SPENT = () => new ChainHttpError('https://bsc: eth_sendRawTransaction → nonce too low: next nonce 8, tx nonce 7', { retryable: false })

	test('fue ESTA tx en un intento anterior sin respuesta: consta como enviada, una vez', async () => {
		const chain = makeChain({ expires: false })
		let first = true
		const submit = jest.fn(async (_prepared, signed) => {
			// El primer intento entra y la respuesta se pierde; al reintentar, un nodo que no la
			// encuentra por su hash contesta «nonce too low»
			if (first) { first = false; chain.execute(signed.txid); throw new Error('Network request failed') }
			throw SPENT()
		})
		const args = baseArgs(chain, submit)
		const { out, unmount } = mount(args)
		await settle()
		await confirm(out)
		await retry(out)

		expect(chain.built).toBe(1)
		expectSentOnce(args.onSent, 'tx-1', true)
		expect(out.tx.phase).toBe('sent')
		unmount()
	})

	test('lo gastó OTRA tx: la cadena lo confirma, se construye otra y hay que volver a autorizarla', async () => {
		const chain = makeChain({ expires: false })
		chain.dropped.add('tx-1')
		const submit = jest.fn(async (_prepared, signed) => {
			if (signed.txid === 'tx-1') throw SPENT()
			chain.execute(signed.txid)
			return { txid: signed.txid, duplicate: false }
		})
		const args = baseArgs(chain, submit)
		const { out, unmount } = mount(args)
		await settle()
		await confirm(out)
		await settle()

		// No se re-difunde la firma muerta ni se envía nada sin otro PIN
		expect(chain.built).toBe(2)
		expect(out.tx.phase).toBe('ready')
		expect(out.tx.prepared.id).toBe('tx-2')
		expect(args.onSent).not.toHaveBeenCalled()

		await confirm(out)
		expect(chain.executed).toEqual(['tx-2'])
		expectSentOnce(args.onSent, 'tx-2', false)
		unmount()
	})

	test('la cadena aún no lo sabe: no se firma otra, y «Reintentar» vuelve a preguntar en vez de re-difundir', async () => {
		const chain = makeChain({ expires: false })
		const lookup = jest.fn(chain.lookup)
		const submit = jest.fn(async () => { throw SPENT() })
		const args = baseArgs(chain, submit, { lookup })
		const { out, unmount } = mount(args)
		await settle()
		await confirm(out)
		await settle()

		expect(out.tx.phase).toBe('error')
		expect(out.tx.error).toBe('unconfirmed')
		expect(lookup).toHaveBeenCalledTimes(1)

		await retry(out)
		expect(submit).toHaveBeenCalledTimes(1)
		expect(lookup).toHaveBeenCalledTimes(2)
		expect(chain.built).toBe(1)

		// Cuando la cadena por fin lo confirma, deja construir otra
		chain.dropped.add('tx-1')
		await retry(out)
		expect(out.tx.phase).toBe('ready')
		expect(out.tx.prepared.id).toBe('tx-2')
		unmount()
	})

	test('sin nadie a quien preguntar (`lookup`), la firma no se suelta: se enseña el rechazo y se re-difunde la misma', async () => {
		const chain = makeChain({ expires: false })
		const submit = jest.fn(async () => { throw SPENT() })
		const args = baseArgs(chain, submit, { lookup: undefined })
		const { out, unmount } = mount(args)
		await settle()
		await confirm(out)
		await settle()

		expect(out.tx.phase).toBe('error')
		expect(out.tx.error).toMatch(/nonce too low/)
		await retry(out)
		expect(submit.mock.calls.map(([, signed]) => signed.txid)).toEqual(['tx-1', 'tx-1'])
		expect(chain.built).toBe(1)
		unmount()
	})
})

test('dos resoluciones del mismo intento a la vez no pueden pisar un envío más nuevo', async () => {
	// «Reintentar» y una reconstrucción por cambio de datos preguntan por la misma tx a la vez
	const chain = makeChain()
	const answers = []
	// Respuestas que se sueltan a mano, en el orden que el test elige
	const lookup = (prepared, signed) => new Promise(resolve => answers.push(() => resolve(chain.lookup(prepared, signed))))
	const submit = jest.fn(async (_prepared, signed) => {
		if (signed.txid !== 'tx-1') chain.execute(signed.txid) // la 1 nunca llegó; las demás sí…
		throw new Error('Network request failed') // …y ninguna respuesta llega
	})
	const args = baseArgs(chain, submit, { lookup })
	const { out, rerender, unmount } = mount(args)
	await settle()
	await confirm(out)

	clock += VALIDITY_MS + 1_000
	chain.dropped.add('tx-1') // tx-1 ya no puede entrar; las que se construyan ahora siguen vigentes
	await act(async () => {
		out.tx.retry()
		rerender({ ...args, build: async () => chain.build() })
		await sleep(10)
	})
	await act(async () => { answers.shift()(); await sleep(60) }) // la primera respuesta: dropped → se prepara tx-2
	if (out.tx.phase === 'ready') await confirm(out) // el usuario envía tx-2 (entra; la respuesta se pierde)
	await act(async () => { while (answers.length) answers.shift()(); await sleep(60) }) // la respuesta vieja, de tx-1
	if (out.tx.phase === 'ready') await confirm(out)

	expect(chain.executed).toEqual(['tx-2'])
	unmount()
})

test('un rechazo DEFINITIVO del patrocinio deja reconstruir el envío pagado por el usuario', async () => {
	// useGaslessSend: el backend prueba que no se gastó nada (`authorized`), suelta el permiso y lanza
	const { TxNotSentError } = require('./useWalletTx')
	const NotSent = TxNotSentError ?? Error
	const chain = makeChain()
	let sponsored = true
	const submit = jest.fn(async (_prepared, signed) => {
		if (sponsored) { sponsored = false; throw new NotSent('Tu envío gratis de hoy ya se usó') }
		chain.execute(signed.txid)
		return { txid: signed.txid, duplicate: false }
	})
	const args = baseArgs(chain, submit, { lookup: async () => ({ status: 'unknown' }) }) // patrocinada: sin id que consultar
	const { out, rerender, unmount } = mount(args)
	await settle()
	await confirm(out)

	rerender({ ...args, build: async () => chain.build() }) // sin puente de patrocinio: otra construcción
	await settle()
	expect(out.tx.phase).toBe('ready')
	await confirm(out)

	expect(chain.executed).toEqual(['tx-2'])
	unmount()
})

test('una reconstrucción mientras se firma no mezcla la tx nueva con la firma de la anterior', async () => {
	// La firma espera al Keychain; mientras, un refresco de fondo vuelve a preparar
	const chain = makeChain()
	let releaseSign = null
	let held = true // solo la PRIMERA firma espera al Keychain; las siguientes son inmediatas
	const sign = (prepared) => {
		if (!held) return Promise.resolve({ txid: prepared.id })
		held = false
		return new Promise(resolve => { releaseSign = () => resolve({ txid: prepared.id }) })
	}
	let loseResponse = true
	const submit = jest.fn(async (prepared, signed) => {
		// Un nodo rechaza una firma que no es de esa tx
		if (signed.txid !== prepared.id) throw new ChainHttpError('tron: broadcast rechazado (SIGERROR): validate signature error', { retryable: false })
		const already = chain.executed.includes(prepared.id)
		chain.execute(prepared.id)
		if (loseResponse) { loseResponse = false; throw new Error('Network request failed') }
		return { txid: prepared.id, duplicate: already }
	})
	const args = baseArgs(chain, submit, { sign })
	const { out, rerender, unmount } = mount(args)
	await settle()

	let signing
	await act(async () => { signing = out.tx.onAuthorized(); await sleep(60) }) // firmando tx-1…
	rerender({ ...args, build: async () => chain.build() }) // …y llega un refresco de fondo
	await settle()
	await act(async () => { releaseSign(); await signing; await sleep(10) }) // tx-1 entra; la respuesta se pierde

	await retry(out)
	clock += VALIDITY_MS + 1_000
	chain.pastExpiry = true
	if (out.tx.phase === 'error') await retry(out)
	if (out.tx.phase === 'ready') await confirm(out)

	expect(chain.executed).toEqual(['tx-1'])
	expectSentOnce(args.onSent, 'tx-1', true)
	unmount()
})


// ── Una tx que entró deja el motor en `sent` ─────────────────────────────────
// Antes, tras difundir un swap, la pantalla tardaba unos segundos en registrarlo en el
// backend; en ese hueco un refresco de saldos cambiaba la identidad de `build`, el motor
// preparaba OTRA tx y volvía a ofrecer «Confirmar». Segundo PIN, segundo swap.
describe('fase terminal `sent`', () => {
	const accepting = (chain) => jest.fn(async (_prepared, signed) => {
		chain.execute(signed.txid)
		return { txid: signed.txid, duplicate: false }
	})

	test('tras entrar la tx, un cambio de datos NO prepara otra ni vuelve a ofrecer confirmar', async () => {
		const chain = makeChain()
		const args = baseArgs(chain, accepting(chain))
		const { out, rerender, unmount } = mount(args)
		await settle()
		await confirm(out)
		expect(out.tx.phase).toBe('sent')
		expect(out.tx.busy).toBe(true)

		// Llega el refresco de saldos: `build` cambia de identidad (lo que antes reabría la pantalla)
		rerender({ ...args, build: async () => chain.build() })
		await settle()
		expect(chain.built).toBe(1)
		expect(out.tx.phase).toBe('sent')

		// Y aunque el PIN volviera a pasarse, no se firma nada más
		const sign = jest.fn(chain.sign)
		rerender({ ...args, build: async () => chain.build(), sign })
		await confirm(out)
		expect(sign).not.toHaveBeenCalled()
		expect(chain.executed).toEqual(['tx-1'])
		expectSentOnce(args.onSent, 'tx-1', false)
		unmount()
	})

	test('ni «Reintentar», ni un recálculo, ni abrir el PIN hacen nada', async () => {
		const chain = makeChain()
		const submit = accepting(chain)
		const args = baseArgs(chain, submit)
		const { out, unmount } = mount(args)
		await settle()
		await confirm(out)

		await retry(out)
		await act(async () => { await out.tx.refresh() })
		act(() => { out.tx.openAuth() })
		// Una fase puesta desde fuera (la espera de energía de un envío) tampoco lo saca
		act(() => { out.tx.setPhase('waitingEnergy') })
		await settle()
		expect(out.tx.phase).toBe('sent')
		expect(out.tx.authVisible).toBe(false)
		expect(chain.built).toBe(1)
		expect(submit).toHaveBeenCalledTimes(1)
		unmount()
	})

	test('una tx que consta como ejecutada al preguntar a la cadena también deja el motor en `sent`', async () => {
		const chain = makeChain()
		const submit = jest.fn(async (_prepared, signed) => { chain.execute(signed.txid); throw new Error('Network request failed') })
		const args = baseArgs(chain, submit)
		const { out, rerender, unmount } = mount(args)
		await settle()
		await confirm(out)
		expect(out.tx.phase).toBe('error')

		clock += VALIDITY_MS + 1_000
		await retry(out) // pregunta a la cadena: entró
		expect(out.tx.phase).toBe('sent')
		expectSentOnce(args.onSent, 'tx-1', true)

		rerender({ ...args, build: async () => chain.build() })
		await settle()
		expect(chain.built).toBe(1)
		unmount()
	})

	// Un swap con permiso son dos tx: tras el permiso, quien lleva la pantalla dice «sigue»
	// TRON: congelado sin voto. La pantalla de éxito tiene que decirlo aunque el envío conste por la cadena
	test('la nota con la que la cadena dice que entró llega a quien enseña el éxito', async () => {
		const chain = makeChain()
		const submit = jest.fn(async (_prepared, signed) => { chain.execute(signed.txid); throw new Error('Network request failed') })
		const lookup = async (prepared) => ({ ...(await chain.lookup(prepared)), note: 'votePending' })
		const args = baseArgs(chain, submit, { lookup })
		const { out, unmount } = mount(args)
		await settle()
		await confirm(out)
		clock += VALIDITY_MS + 1_000
		await retry(out)

		expect(args.onSent).toHaveBeenCalledTimes(1)
		expect(args.onSent.mock.calls[0][0]).toBe('tx-1')
		expect(args.onSent.mock.calls[0][3]).toBe('votePending')
		unmount()
	})

	test('`advance()` es la única salida: construye el paso siguiente y deja firmarlo', async () => {
		const chain = makeChain()
		const args = baseArgs(chain, accepting(chain))
		const { out, unmount } = mount(args)
		await settle()
		await confirm(out) // el permiso
		expect(out.tx.phase).toBe('sent')

		await act(async () => { await out.tx.advance() })
		await settle()
		expect(out.tx.phase).toBe('ready')
		expect(chain.built).toBe(2)

		await confirm(out) // el swap
		expect(chain.executed).toEqual(['tx-1', 'tx-2'])
		expect(args.onSent).toHaveBeenCalledTimes(2)
		expect(out.tx.phase).toBe('sent')
		unmount()
	})
})

// ── Avisos de «va a salir» y «no salió» ──────────────────────────────────────
// El depósito de un intercambio tiene que quedar anotado ANTES de salir: si la respuesta de
// la difusión se pierde, sin esa nota la pantalla de seguimiento volvía a ofrecer enviar
describe('onAttempt / onDropped', () => {
	test('`onAttempt` termina antes de que la tx salga, con la tx y su firma', async () => {
		const chain = makeChain()
		const order = []
		const onAttempt = jest.fn(async () => { await sleep(20); order.push('anotado') })
		const submit = jest.fn(async (_prepared, signed) => { order.push('difundido'); chain.execute(signed.txid); return { txid: signed.txid, duplicate: false } })
		const args = baseArgs(chain, submit, { onAttempt })
		const { out, unmount } = mount(args)
		await settle()
		await act(async () => { await out.tx.onAuthorized(); await sleep(40) })
		expect(order).toEqual(['anotado', 'difundido'])
		expect(onAttempt).toHaveBeenCalledWith(expect.objectContaining({ id: 'tx-1' }), { txid: 'tx-1' })
		unmount()
	})

	test('que la nota falle no impide el envío', async () => {
		const chain = makeChain()
		const args = baseArgs(chain, jest.fn(async (_p, signed) => { chain.execute(signed.txid); return { txid: signed.txid, duplicate: false } }), { onAttempt: async () => { throw new Error('disco lleno') } })
		const { out, unmount } = mount(args)
		await settle()
		await confirm(out)
		expect(chain.executed).toEqual(['tx-1'])
		expect(out.tx.phase).toBe('sent')
		unmount()
	})

	test('un fallo ambiguo de la difusión NO es «no salió»: la nota se queda', async () => {
		const chain = makeChain()
		const onDropped = jest.fn()
		const submit = jest.fn(async () => { throw new Error('Network request failed') })
		const { out, unmount } = mount(baseArgs(chain, submit, { onDropped, lookup: async () => ({ status: 'unknown' }) }))
		await settle()
		await confirm(out)
		expect(out.tx.phase).toBe('error')
		expect(onDropped).not.toHaveBeenCalled()
		unmount()
	})

	test('un rechazo definitivo sí lo es', async () => {
		const { TxNotSentError } = require('./useWalletTx')
		const chain = makeChain()
		const onDropped = jest.fn()
		const submit = jest.fn(async () => { throw new TxNotSentError('no se gastó nada') })
		const { out, unmount } = mount(baseArgs(chain, submit, { onDropped }))
		await settle()
		await confirm(out)
		expect(onDropped).toHaveBeenCalledWith(expect.objectContaining({ id: 'tx-1' }), { txid: 'tx-1' }, 'rejected')
		unmount()
	})

	test('«reconstruir» (el patrocinio no gastó nada) también', async () => {
		const chain = makeChain()
		const onDropped = jest.fn()
		let first = true
		const submit = jest.fn(async (_p, signed) => {
			if (first) { first = false; return { rebuild: true } }
			chain.execute(signed.txid)
			return { txid: signed.txid, duplicate: false }
		})
		const { out, unmount } = mount(baseArgs(chain, submit, { onDropped }))
		await settle()
		await confirm(out)
		await settle()
		expect(onDropped).toHaveBeenCalledTimes(1)
		expect(onDropped.mock.calls[0][2]).toBe('rebuild')
		expect(out.tx.phase).toBe('ready')
		unmount()
	})

	test('y una tx que la cadena dice que ya nunca entrará', async () => {
		const chain = makeChain()
		const onDropped = jest.fn()
		const submit = jest.fn(async () => { throw new Error('Network request failed') })
		const { out, unmount } = mount(baseArgs(chain, submit, { onDropped }))
		await settle()
		await confirm(out)
		expect(onDropped).not.toHaveBeenCalled()

		chain.pastExpiry = true
		clock += VALIDITY_MS + 1_000
		await retry(out)
		// `chain`: lo dijo la cadena, no quien difunde (el patrocinio lo usa para soltar su permiso)
		expect(onDropped).toHaveBeenCalledWith(expect.objectContaining({ id: 'tx-1' }), { txid: 'tx-1' }, 'chain')
		unmount()
	})
})
