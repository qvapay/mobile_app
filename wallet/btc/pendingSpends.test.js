/**
 * @jest-environment node
 *
 * Lo que la wallet acaba de gastar en Bitcoin y un nodo puede no haber visto aún. Un nodo
 * cuyo índice por dirección va por detrás del mempool (medido: hasta un minuto) sigue listando
 * monedas ya gastadas; el envío siguiente las volvía a gastar.
 */
import { applyPendingSpends, createPendingBtcSpends, PENDING_SPEND_TTL_MS, readSignedBtcSpend } from './pendingSpends'
import { opReturnVbytes, signThorchainBtcSwap, verifyThorchainMemo } from './thorchain'
import { selectUtxos, signBtcTransaction } from './tx'
import { deriveAddresses, derivePrivateKey } from '../derive'
import { mnemonicToSeed } from '../seed'

const SEED = mnemonicToSeed('abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about')
const FROM = deriveAddresses(SEED).btc
const PRIV = derivePrivateKey(SEED, 'btc')
const TO = 'bc1qm34lsc65zpw79lxes69zkqmk6ee3ewf0j77s3h'

const U1 = 'a1'.repeat(32)
const U2 = 'b2'.repeat(32)
const utxo = (txid, value, over = {}) => ({ txid, vout: 0, value: BigInt(value), confirmed: true, ...over })
const send = (utxos, amount, to = TO) => signBtcTransaction({ intent: { from: FROM, to, amount }, selection: selectUtxos(utxos, amount, 2) }, PRIV)
const outpoints = list => list.map(u => `${u.txid}:${u.vout}`).sort()

describe('readSignedBtcSpend: qué gasta una tx firmada y qué le vuelve a la wallet', () => {
	test('sale de los bytes firmados: los inputs y el cambio a la propia dirección', () => {
		const signed = send([utxo(U1, 60_000, { vout: 3 }), utxo(U2, 50_000, { vout: 1 })], 80_000n)
		expect(signed.from).toBe(FROM)
		const spend = readSignedBtcSpend(signed.hex, FROM)
		expect(spend.txid).toBe(signed.txid)
		expect(outpoints(spend.spent)).toEqual([`${U1}:3`, `${U2}:1`])
		// Salida 0 = destino; la 1 es el cambio, lo único que vuelve
		expect(spend.created).toHaveLength(1)
		expect(spend.created[0].vout).toBe(1)
		expect(spend.created[0].value).toBeGreaterThan(0n)
		expect(spend.created[0].value).toBeLessThan(30_000n)
	})

	test('«enviar todo» no deja cambio', () => {
		const signed = send([utxo(U1, 60_000)], 60_000n)
		expect(readSignedBtcSpend(signed.hex, FROM).created).toEqual([])
	})

	test('un envío a la propia dirección: vuelven las dos salidas', () => {
		const signed = send([utxo(U1, 60_000)], 20_000n, FROM)
		const { created } = readSignedBtcSpend(signed.hex, FROM)
		expect(created.map(c => c.vout)).toEqual([0, 1])
		expect(created[0].value).toBe(20_000n)
	})

	test('un swap con OP_RETURN: solo el cambio, ni la bóveda ni el memo', () => {
		const EVM = '0x19E7E376E7C213B7E7e7e46cc70A5dD086DAff2A'
		const memo = `=:ETH.USDT:${EVM}:40798854412/1/0:t:40`
		const intent = { from: FROM, amountSats: 500_000n, memo, pool: 'ETH.USDT-0XDAC17F958D2EE523A2206206994597C13D831EC7', destination: EVM, shownOut: 41_210_964_053n, maxAffiliateBps: 40 }
		const prepared = { intent, vault: 'bc1qjenqvxfl7r9gs0ts39g7e0jch60gchtf3lx2fq', memo: verifyThorchainMemo(intent), selection: selectUtxos([utxo(U1, 1_000_000)], 500_000n, 3, opReturnVbytes(memo)), expiresAt: null }
		const signed = signThorchainBtcSwap(prepared, PRIV)
		expect(signed.from).toBe(FROM)
		const spend = readSignedBtcSpend(signed.hex, FROM)
		expect(outpoints(spend.spent)).toEqual([`${U1}:0`])
		expect(spend.created).toEqual([{ vout: 1, value: prepared.selection.change }])
	})

	test('bytes que no son una tx o una dirección que no vale: lanza, no inventa', () => {
		expect(() => readSignedBtcSpend('0200', FROM)).toThrow()
		expect(() => readSignedBtcSpend(send([utxo(U1, 60_000)], 20_000n).hex, 'nope')).toThrow(/dirección/)
	})
})

describe('applyPendingSpends: la lista del nodo, corregida', () => {
	const T1 = '11'.repeat(32)
	const T2 = '22'.repeat(32)
	const OTHER = 'ee'.repeat(32)
	// T1 gasta U1 y deja cambio en T1:1; T2 gasta ese cambio y deja el suyo en T2:1
	const n1 = { txid: T1, owner: 'x', spent: [{ txid: U1, vout: 0 }], created: [{ vout: 1, value: 69_000n }], at: 0 }
	const n2 = { txid: T2, owner: 'x', spent: [{ txid: T1, vout: 1 }], created: [{ vout: 1, value: 38_000n }], at: 0 }

	test('sin notas, la lista del nodo tal cual', () => {
		const list = [utxo(U1, 100_000)]
		expect(applyPendingSpends(list, [])).toBe(list)
	})

	test('nodo atrasado (aún lista lo gastado): no se ofrece, y el cambio entra como no confirmado', () => {
		expect(applyPendingSpends([utxo(U1, 100_000)], [n1])).toEqual([{ txid: T1, vout: 1, value: 69_000n, confirmed: false }])
	})

	test('nodo al día: manda su lista, y el cambio no sale dos veces', () => {
		const fresh = [{ txid: T1, vout: 1, value: 69_000n, confirmed: true }]
		expect(applyPendingSpends(fresh, [n1])).toEqual(fresh)
	})

	test('el nodo no lista ni lo gastado ni el cambio: no se inventa el cambio', () => {
		// Dos lecturas posibles y desde aquí no se distinguen: el nodo ya vio la tx y su cambio
		// se gastó en otra parte, o la tx gastó una entrada sin confirmar que este nodo nunca
		// llegó a listar. Sin prueba de que va atrasado manda su lista: como mucho falta saldo
		// un rato, nunca se arma un envío sobre una salida que quizá no existe
		expect(applyPendingSpends([], [n1])).toEqual([])
		expect(applyPendingSpends([utxo(OTHER, 5_000)], [n1])).toEqual([utxo(OTHER, 5_000)])
	})

	test('dos envíos seguidos por un nodo atrasado: queda el cambio del segundo', () => {
		// El nodo no ha visto ninguno: lista U1 y nunca listó T1:1, que es lo que gasta T2
		expect(applyPendingSpends([utxo(U1, 100_000)], [n1, n2])).toEqual([{ txid: T2, vout: 1, value: 38_000n, confirmed: false }])
		// El orden de las notas no importa
		expect(applyPendingSpends([utxo(U1, 100_000)], [n2, n1])).toEqual([{ txid: T2, vout: 1, value: 38_000n, confirmed: false }])
	})

	test('el nodo vio el primer envío y no el segundo', () => {
		const list = [{ txid: T1, vout: 1, value: 69_000n, confirmed: false }]
		expect(applyPendingSpends(list, [n1, n2])).toEqual([{ txid: T2, vout: 1, value: 38_000n, confirmed: false }])
	})

	test('el nodo vio los dos: su lista, sin tocar', () => {
		const list = [{ txid: T2, vout: 1, value: 38_000n, confirmed: false }, utxo(OTHER, 5_000)]
		expect(applyPendingSpends(list, [n1, n2])).toEqual(list)
	})

	test('lo que no es de las notas se conserva, en su orden', () => {
		const result = applyPendingSpends([utxo(OTHER, 5_000), utxo(U1, 100_000), utxo(U2, 7_000)], [n1])
		expect(outpoints(result)).toEqual([`${T1}:1`, `${U2}:0`, `${OTHER}:0`].sort())
		expect(result.slice(0, 2)).toEqual([utxo(OTHER, 5_000), utxo(U2, 7_000)])
	})

	test('basta una de las monedas gastadas en la lista para saber que el nodo va atrasado', () => {
		const two = { ...n1, spent: [{ txid: U1, vout: 0 }, { txid: U2, vout: 4 }] }
		expect(applyPendingSpends([utxo(U2, 7_000, { vout: 4 })], [two])).toEqual([{ txid: T1, vout: 1, value: 69_000n, confirmed: false }])
	})

	test('el txid casa en mayúsculas o minúsculas', () => {
		expect(applyPendingSpends([utxo(U1.toUpperCase(), 100_000)], [n1])).toEqual([{ txid: T1, vout: 1, value: 69_000n, confirmed: false }])
	})
})

describe('createPendingBtcSpends: la libreta', () => {
	const clock = (start = 1_000_000) => { let t = start; return { now: () => t, advance: ms => { t += ms }, set: ms => { t = ms } } }

	test('anota una tx firmada y corrige la lista de un nodo atrasado', () => {
		const pending = createPendingBtcSpends()
		const signed = send([utxo(U1, 100_000)], 30_000n)
		pending.record(signed.hex, FROM)
		const result = pending.apply(FROM, [utxo(U1, 100_000)])
		expect(result).toHaveLength(1)
		expect(result[0]).toMatchObject({ txid: signed.txid, vout: 1, confirmed: false })
		expect(result[0].value).toBeLessThan(70_000n)
	})

	test('las notas son de su dirección: otra no las ve', () => {
		const pending = createPendingBtcSpends()
		pending.record(send([utxo(U1, 100_000)], 30_000n).hex, FROM)
		const list = [utxo(U1, 100_000)]
		expect(pending.apply(TO, list)).toEqual(list)
		expect(pending.apply('nope', list)).toBe(list)
	})

	test('caduca: pasado el plazo vuelve a mandar la lista del nodo', () => {
		const time = clock()
		const pending = createPendingBtcSpends({ now: time.now })
		pending.record(send([utxo(U1, 100_000)], 30_000n).hex, FROM)
		const list = [utxo(U1, 100_000)]
		time.advance(PENDING_SPEND_TTL_MS - 1)
		expect(pending.apply(FROM, list)).not.toEqual(list)
		time.advance(1)
		expect(pending.apply(FROM, list)).toBe(list)
		expect(pending.list()).toEqual([])
	})

	test('atrasar el reloj del teléfono no alarga una nota', () => {
		const time = clock(50 * PENDING_SPEND_TTL_MS)
		const pending = createPendingBtcSpends({ now: time.now })
		pending.record(send([utxo(U1, 100_000)], 30_000n).hex, FROM)
		time.set(PENDING_SPEND_TTL_MS)
		expect(pending.list()).toEqual([])
	})

	test('la misma tx aceptada otra vez renueva su nota, sin duplicarla', () => {
		const time = clock()
		const pending = createPendingBtcSpends({ now: time.now })
		const signed = send([utxo(U1, 100_000)], 30_000n)
		pending.record(signed.hex, FROM)
		time.advance(PENDING_SPEND_TTL_MS - 1_000)
		pending.record(signed.hex, FROM)
		time.advance(PENDING_SPEND_TTL_MS - 1_000)
		expect(pending.list().map(note => note.txid)).toEqual([signed.txid])
	})

	test('lo que no se deja leer no se anota y no borra lo anotado', () => {
		const pending = createPendingBtcSpends()
		const signed = send([utxo(U1, 100_000)], 30_000n)
		pending.record(signed.hex, FROM)
		expect(() => pending.record('0200', FROM)).toThrow()
		expect(pending.list().map(note => note.txid)).toEqual([signed.txid])
	})

	test('tope de notas: sale la más vieja, no todas', () => {
		const pending = createPendingBtcSpends()
		const txids = []
		for (let i = 0; i < 66; i++) {
			const signed = send([utxo((i + 1).toString(16).padStart(2, '0').repeat(32), 100_000)], 30_000n)
			txids.push(signed.txid)
			pending.record(signed.hex, FROM)
		}
		expect(pending.list().map(note => note.txid)).toEqual(txids.slice(2))
	})
})
