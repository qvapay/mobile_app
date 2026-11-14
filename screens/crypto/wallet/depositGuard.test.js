/**
 * ¿Se puede firmar el depósito de un intercambio? Solo si consta que no salió ninguno y la
 * orden sigue esperándolo. Todo lo que no se pueda comprobar es «no».
 * @jest-environment node
 */
jest.mock('../../../api/exchangeApi', () => ({ exchangeApi: { get: jest.fn() } }))
jest.mock('./exchangeDeposit', () => ({ readDepositSent: jest.fn() }))

import { exchangeApi } from '../../../api/exchangeApi'
import { readDepositSent } from './exchangeDeposit'
import { checkDeposit } from './depositGuard'

const awaiting = { success: true, data: { uuid: 'ex-1', status: 'awaiting_deposit' } }

beforeEach(() => {
	jest.clearAllMocks()
	readDepositSent.mockResolvedValue(null)
	exchangeApi.get.mockResolvedValue(awaiting)
})

test('sin nota y con la orden esperando el depósito: adelante', async () => {
	expect(await checkDeposit('ex-1')).toEqual({ allowed: true })
	// La nota se lee en modo estricto: un disco que falla no puede parecer «sin nota»
	expect(readDepositSent).toHaveBeenCalledWith('ex-1', { strict: true })
})

test('con una nota de que ya salió uno: no, y ni se pregunta al servidor', async () => {
	readDepositSent.mockResolvedValue({ uuid: 'ex-1', txid: '0xabc', at: 1, pending: false })
	expect(await checkDeposit('ex-1')).toEqual({ allowed: false, reason: 'sent', txid: '0xabc' })
	expect(exchangeApi.get).not.toHaveBeenCalled()
})

// La difusión no contestó: el envío pudo entrar igual. Antes ahí no quedaba nota
test('una nota PENDIENTE (salió y no se sabe si entró) bloquea igual', async () => {
	readDepositSent.mockResolvedValue({ uuid: 'ex-1', txid: null, at: 1, pending: true })
	expect(await checkDeposit('ex-1')).toEqual({ allowed: false, reason: 'sent', txid: null })
})

test.each(['confirming', 'exchanging', 'sending', 'completed', 'expired', 'failed', 'needs_review', 'refunded'])('la orden está en %s: ya no espera depósito', async (status) => {
	exchangeApi.get.mockResolvedValue({ success: true, data: { uuid: 'ex-1', status } })
	expect(await checkDeposit('ex-1')).toEqual({ allowed: false, reason: 'closed', status })
})

describe('lo que no se puede comprobar es «no»', () => {
	test('el disco no deja leer la nota', async () => {
		readDepositSent.mockRejectedValue(new Error('disk'))
		expect(await checkDeposit('ex-1')).toEqual({ allowed: false, reason: 'unknown' })
		expect(exchangeApi.get).not.toHaveBeenCalled()
	})

	test('el servidor no contesta', async () => {
		exchangeApi.get.mockResolvedValue({ success: false, error: 'No se ha podido conectar con el servidor' })
		expect(await checkDeposit('ex-1')).toEqual({ allowed: false, reason: 'unknown' })
	})

	test('contesta sin la orden', async () => {
		exchangeApi.get.mockResolvedValue({ success: true, data: null })
		expect(await checkDeposit('ex-1')).toEqual({ allowed: false, reason: 'unknown' })
	})

	test('la consulta lanza', async () => {
		exchangeApi.get.mockRejectedValue(new Error('boom'))
		expect(await checkDeposit('ex-1')).toEqual({ allowed: false, reason: 'unknown' })
	})
})
