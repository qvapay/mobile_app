/**
 * ¿Se puede firmar el depósito de un intercambio? Solo si consta que no salió ninguno y la
 * orden sigue esperándolo. Todo lo que no se pueda comprobar es «no».
 * @jest-environment node
 */
jest.mock('../../../api/exchangeApi', () => ({ exchangeApi: { get: jest.fn() } }))
jest.mock('./exchangeDeposit', () => ({ readDepositSent: jest.fn(), markDepositSent: jest.fn(async () => {}), clearDepositSent: jest.fn(async () => {}) }))
jest.mock('./walletSendActions', () => ({ lookupSentRef: jest.fn() }))

import { exchangeApi } from '../../../api/exchangeApi'
import { clearDepositSent, markDepositSent, readDepositSent } from './exchangeDeposit'
import { lookupSentRef } from './walletSendActions'
import { checkDeposit, settleDepositNote } from './depositGuard'

const awaiting = { success: true, data: { uuid: 'ex-1', status: 'awaiting_deposit' } }

const REF = { kind: 'evm', chainKey: 'bsc', hash: `0x${'ab'.repeat(32)}`, from: `0x${'11'.repeat(20)}`, nonce: 7 }
const pendingNote = (over = {}) => ({ uuid: 'ex-1', txid: REF.hash, at: 1, pending: true, ref: REF, ...over })

beforeEach(() => {
	jest.clearAllMocks()
	readDepositSent.mockResolvedValue(null)
	exchangeApi.get.mockResolvedValue(awaiting)
	lookupSentRef.mockResolvedValue({ status: 'unknown' })
})

test('sin nota y con la orden esperando el depósito: adelante', async () => {
	expect(await checkDeposit('ex-1')).toEqual({ allowed: true })
	// La nota se lee en modo estricto: un disco que falla no puede parecer «sin nota»
	expect(readDepositSent).toHaveBeenCalledWith('ex-1', { strict: true })
})

test('con una nota de que ya salió uno: no, y ni se pregunta al servidor', async () => {
	readDepositSent.mockResolvedValue({ uuid: 'ex-1', txid: '0xabc', at: 1, pending: false, ref: null })
	expect(await checkDeposit('ex-1')).toEqual({ allowed: false, reason: 'sent', txid: '0xabc' })
	expect(exchangeApi.get).not.toHaveBeenCalled()
})

// La difusión no contestó: el envío pudo entrar igual. Antes ahí no quedaba nota
test('una nota PENDIENTE (salió y no se sabe si entró) bloquea igual', async () => {
	readDepositSent.mockResolvedValue({ uuid: 'ex-1', txid: null, at: 1, pending: true, ref: null })
	expect(await checkDeposit('ex-1')).toEqual({ allowed: false, reason: 'sent', txid: null })
	// Sin referencia no hay con qué preguntar a la cadena
	expect(lookupSentRef).not.toHaveBeenCalled()
})

// Antes un «quizá» se quedaba así para siempre y esa orden ya no se podía fondear desde la app
describe('una nota pendiente se aclara preguntando a la cadena', () => {
	test('la cadena dice que entró: consta como enviada, con su hash, y no se firma otra', async () => {
		readDepositSent.mockResolvedValue(pendingNote())
		lookupSentRef.mockResolvedValue({ status: 'landed', txid: REF.hash })
		expect(await checkDeposit('ex-1')).toEqual({ allowed: false, reason: 'sent', txid: REF.hash })
		expect(lookupSentRef).toHaveBeenCalledWith(REF)
		expect(markDepositSent).toHaveBeenCalledWith('ex-1', REF.hash)
		expect(clearDepositSent).not.toHaveBeenCalled()
		expect(exchangeApi.get).not.toHaveBeenCalled()
	})

	test('la cadena confirma que no entró ni entrará: la nota se borra y, si la orden sigue esperando, se puede fondear', async () => {
		readDepositSent.mockResolvedValue(pendingNote())
		lookupSentRef.mockResolvedValue({ status: 'dropped' })
		expect(await checkDeposit('ex-1')).toEqual({ allowed: true })
		expect(clearDepositSent).toHaveBeenCalledWith('ex-1')
		expect(exchangeApi.get).toHaveBeenCalledWith('ex-1')
	})

	test('…pero si mientras tanto la orden dejó de esperar depósito, tampoco', async () => {
		readDepositSent.mockResolvedValue(pendingNote())
		lookupSentRef.mockResolvedValue({ status: 'dropped' })
		exchangeApi.get.mockResolvedValue({ success: true, data: { uuid: 'ex-1', status: 'expired' } })
		expect(await checkDeposit('ex-1')).toEqual({ allowed: false, reason: 'closed', status: 'expired' })
	})

	test('la cadena aún no lo sabe: sigue siendo «quizá salió»', async () => {
		readDepositSent.mockResolvedValue(pendingNote())
		expect(await checkDeposit('ex-1')).toEqual({ allowed: false, reason: 'sent', txid: REF.hash })
		expect(markDepositSent).not.toHaveBeenCalled()
		expect(clearDepositSent).not.toHaveBeenCalled()
	})

	test('la consulta falla: igual, y la nota no se toca', async () => {
		readDepositSent.mockResolvedValue(pendingNote())
		lookupSentRef.mockRejectedValue(new Error('sin nodos'))
		expect(await checkDeposit('ex-1')).toEqual({ allowed: false, reason: 'sent', txid: REF.hash })
		expect(clearDepositSent).not.toHaveBeenCalled()
	})

	test('una referencia que no tiene forma de referencia no se usa', async () => {
		readDepositSent.mockResolvedValue(pendingNote({ ref: { kind: 'evm', chainKey: 'bsc', hash: 'no-es-un-hash', from: REF.from, nonce: 7 } }))
		expect(await checkDeposit('ex-1')).toEqual({ allowed: false, reason: 'sent', txid: REF.hash })
		expect(lookupSentRef).not.toHaveBeenCalled()
	})

	test('una nota que ya consta enviada no se vuelve a preguntar', async () => {
		readDepositSent.mockResolvedValue(pendingNote({ pending: false }))
		expect(await checkDeposit('ex-1')).toEqual({ allowed: false, reason: 'sent', txid: REF.hash })
		expect(lookupSentRef).not.toHaveBeenCalled()
	})

	test('no se pudo borrar la nota (disco): no se firma', async () => {
		readDepositSent.mockResolvedValue(pendingNote())
		lookupSentRef.mockResolvedValue({ status: 'dropped' })
		clearDepositSent.mockRejectedValueOnce(new Error('disco'))
		expect(await checkDeposit('ex-1')).toEqual({ allowed: false, reason: 'unknown' })
	})

	test('`settleDepositNote` devuelve la nota como queda: enviada, borrada (null) o la misma', async () => {
		lookupSentRef.mockResolvedValueOnce({ status: 'landed', txid: '0xreal' })
		expect(await settleDepositNote(pendingNote())).toEqual({ uuid: 'ex-1', txid: '0xreal', at: 1, pending: false, ref: null })
		lookupSentRef.mockResolvedValueOnce({ status: 'dropped' })
		expect(await settleDepositNote(pendingNote())).toBeNull()
		const note = pendingNote()
		expect(await settleDepositNote(note)).toBe(note)
	})
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

// X-06: las órdenes cuelgan del ID de wallet. Con ese ID en otras manos, una orden que
// cobrara un tercero saldría en el seguimiento con su «Enviar ahora» como cualquier otra
describe('la orden tiene que ser de esta wallet', () => {
	const EVM = '0x2A6f3C8bD3eE0c4F5a1b7c9D0e1F2a3B4c5D6e7F'
	const SOL = '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM'
	const DEPOSIT = '0x8f3Ae21cB57D9a0C4e6F1b2D3c4E5f6A7b8CC9d1'
	const ATTACKER_SOL = 'H8sMJSCQxfKiFTCfDR3DUMLPwcRbM61LGFJ8N4dK3WjS'
	const own = (assetId) => (assetId === 'bsc:usdt' ? { kind: 'evm', address: EVM } : assetId === 'solana:native' ? { kind: 'solana', address: SOL } : null)
	const expected = { to: DEPOSIT, own }
	const orderOf = (over = {}) => ({
		success: true,
		data: { uuid: 'ex-1', status: 'awaiting_deposit', from_asset: 'bsc:usdt', to_asset: 'solana:native', deposit_address: DEPOSIT, payout_address: SOL, refund_address: EVM, ...over },
	})

	test('paga y devuelve a direcciones propias, y el envío va a su depósito: adelante', async () => {
		exchangeApi.get.mockResolvedValue(orderOf())
		expect(await checkDeposit('ex-1', expected)).toEqual({ allowed: true })
		// EVM no distingue mayúsculas: el checksum no cambia de quién es la dirección
		exchangeApi.get.mockResolvedValue(orderOf({ refund_address: EVM.toLowerCase(), deposit_address: DEPOSIT.toLowerCase() }))
		expect(await checkDeposit('ex-1', expected)).toEqual({ allowed: true })
	})

	test('cobra otra dirección: no se firma', async () => {
		exchangeApi.get.mockResolvedValue(orderOf({ payout_address: ATTACKER_SOL }))
		expect(await checkDeposit('ex-1', expected)).toEqual({ allowed: false, reason: 'foreign' })
	})

	test('la devolución va a otra dirección: tampoco', async () => {
		exchangeApi.get.mockResolvedValue(orderOf({ refund_address: '0x000000000000000000000000000000000000dEaD' }))
		expect(await checkDeposit('ex-1', expected)).toEqual({ allowed: false, reason: 'foreign' })
	})

	test('lo que se va a enviar no va a la dirección de depósito de la orden: tampoco', async () => {
		exchangeApi.get.mockResolvedValue(orderOf({ deposit_address: '0x000000000000000000000000000000000000dEaD' }))
		expect(await checkDeposit('ex-1', expected)).toEqual({ allowed: false, reason: 'foreign' })
		exchangeApi.get.mockResolvedValue(orderOf({ deposit_address: null }))
		expect(await checkDeposit('ex-1', expected)).toEqual({ allowed: false, reason: 'foreign' })
	})

	test('una orden que no trae a quién paga cuenta como ajena', async () => {
		exchangeApi.get.mockResolvedValue(orderOf({ payout_address: undefined }))
		expect(await checkDeposit('ex-1', expected)).toEqual({ allowed: false, reason: 'foreign' })
	})

	test('si la wallet no tiene ese activo no se puede saber, y lo que no se sabe es «no»', async () => {
		exchangeApi.get.mockResolvedValue(orderOf({ to_asset: 'otra:cosa' }))
		expect(await checkDeposit('ex-1', expected)).toEqual({ allowed: false, reason: 'unknown' })
	})

	test('el orden de las comprobaciones: una orden cerrada se dice cerrada, sea de quien sea', async () => {
		exchangeApi.get.mockResolvedValue(orderOf({ status: 'expired', payout_address: ATTACKER_SOL }))
		expect(await checkDeposit('ex-1', expected)).toEqual({ allowed: false, reason: 'closed', status: 'expired' })
	})
})
