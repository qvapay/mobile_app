/**
 * La nota en disco de que el depósito de un intercambio ya salió (o pudo salir). Es lo que
 * impide mandarlo dos veces: el proveedor espera UN envío y un segundo se queda a la espera
 * de una devolución manual.
 * @jest-environment node
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
	__esModule: true,
	default: { getItem: jest.fn(), setItem: jest.fn() },
}))

import AsyncStorage from '@react-native-async-storage/async-storage'
import { clearDepositSent, markDepositAttempt, markDepositSent, readDepositSent } from './exchangeDeposit'

const KEY = '@qpexchange:deposit'
const NOW = 1_800_000_000_000
const DAY = 24 * 60 * 60 * 1000
let disk
let clock

beforeEach(() => {
	disk = {}
	clock = NOW
	jest.spyOn(Date, 'now').mockImplementation(() => clock)
	AsyncStorage.getItem.mockImplementation(async key => disk[key] ?? null)
	AsyncStorage.setItem.mockImplementation(async (key, value) => { disk[key] = value })
})
afterEach(() => { jest.restoreAllMocks() })

test('al salir hacia la red queda anotado como pendiente, con el hash calculado en el teléfono', async () => {
	await markDepositAttempt('ex-1', '0xabc')
	expect(await readDepositSent('ex-1')).toEqual({ uuid: 'ex-1', txid: '0xabc', at: NOW, pending: true })
})

test('una patrocinada aún no tiene hash: la nota vale igual', async () => {
	await markDepositAttempt('ex-1', null)
	expect(await readDepositSent('ex-1')).toEqual({ uuid: 'ex-1', txid: null, at: NOW, pending: true })
})

test('cuando la red lo acepta deja de estar pendiente', async () => {
	await markDepositAttempt('ex-1', '0xabc')
	await markDepositSent('ex-1', '0xabc')
	expect(await readDepositSent('ex-1')).toMatchObject({ txid: '0xabc', pending: false })
})

test('otro intento no rebaja a pendiente uno que ya consta como enviado', async () => {
	await markDepositSent('ex-1', '0xabc')
	await markDepositAttempt('ex-1', '0xotro')
	expect(await readDepositSent('ex-1')).toMatchObject({ txid: '0xabc', pending: false })
})

test('se borra cuando consta que no entró (o la orden avanzó), sin tocar las demás', async () => {
	await markDepositAttempt('ex-1', '0xabc')
	await markDepositSent('ex-2', '0xdef')
	await clearDepositSent('ex-1')
	expect(await readDepositSent('ex-1')).toBeNull()
	expect(await readDepositSent('ex-2')).toMatchObject({ txid: '0xdef' })
})

// Eran 12 horas, y una orden puede quedarse «esperando» días: al caducar la nota, el
// seguimiento volvía a ofrecer «Enviar ahora»
test('la nota no caduca en días: una orden que sigue esperando no vuelve a ofrecer enviar', async () => {
	await markDepositSent('ex-1', '0xabc')
	clock = NOW + 13 * 60 * 60 * 1000
	expect(await readDepositSent('ex-1')).toMatchObject({ txid: '0xabc' })
	clock = NOW + 20 * DAY
	expect(await readDepositSent('ex-1')).toMatchObject({ txid: '0xabc' })
	clock = NOW + 31 * DAY
	expect(await readDepositSent('ex-1')).toBeNull()
})

test('lo que acota el fichero es el número de notas: se quedan las 100 más nuevas', async () => {
	for (let i = 0; i < 105; i++) {
		clock = NOW + i * 1000
		await markDepositSent(`ex-${i}`, `0x${i}`)
	}
	expect(Object.keys(JSON.parse(disk[KEY]))).toHaveLength(100)
	expect(await readDepositSent('ex-0')).toBeNull()
	expect(await readDepositSent('ex-104')).toMatchObject({ txid: '0x104' })
})

test('una nota del formato anterior (sin `pending`) se lee como enviada', async () => {
	disk[KEY] = JSON.stringify({ 'ex-1': { txid: '0xabc', at: NOW - 1000 } })
	expect(await readDepositSent('ex-1')).toEqual({ uuid: 'ex-1', txid: '0xabc', at: NOW - 1000, pending: false })
})

describe('disco que falla', () => {
	test('por defecto «no hay nota» (para pintar): no rompe la pantalla', async () => {
		AsyncStorage.getItem.mockRejectedValue(new Error('disk'))
		await expect(readDepositSent('ex-1')).resolves.toBeNull()
	})

	// «No pude leer la nota» no es «no hay nota»: quien va a firmar necesita distinguirlo
	test('en modo estricto (la guarda de antes de firmar) LANZA', async () => {
		AsyncStorage.getItem.mockRejectedValue(new Error('disk'))
		await expect(readDepositSent('ex-1', { strict: true })).rejects.toThrow('disk')
	})

	test('no poder escribir no lanza: se pierde la nota, no el envío', async () => {
		AsyncStorage.setItem.mockRejectedValue(new Error('disco lleno'))
		await expect(markDepositAttempt('ex-1', '0xabc')).resolves.toBeUndefined()
		await expect(markDepositSent('ex-1', '0xabc')).resolves.toBeUndefined()
	})

	test('basura en disco se trata como vacío', async () => {
		disk[KEY] = '{no es json'
		expect(await readDepositSent('ex-1')).toBeNull()
		await markDepositAttempt('ex-1', '0xabc')
		expect(await readDepositSent('ex-1')).toMatchObject({ txid: '0xabc' })
	})
})
