/**
 * Compra y puja del puesto promocionado (useP2PPromote): idempotencia, confirmación, slot
 * que devuelve el servidor y "tu puja va ganando" recordado en la sesión.
 * @jest-environment node
 */
jest.mock('../../api/p2pApi', () => ({ p2pApi: { promoState: jest.fn(), promote: jest.fn() } }))
jest.mock('../../auth/AuthContext', () => ({ useAuth: jest.fn() }))
jest.mock('sonner-native', () => ({ toast: { error: jest.fn(), success: jest.fn() } }))

import React from 'react'
import { act, create } from 'react-test-renderer'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { p2pApi } from '../../api/p2pApi'
import { useAuth } from '../../auth/AuthContext'
import { toast } from 'sonner-native'
import useP2PPromote from './useP2PPromote'

const HELD = { coin: 'BANK_CUP', offer_type: 'sell', state: 'held', holder: { uuid: 'otro', username: 'comerciante' }, starts_at: '2026-10-16T12:00:00.000Z', ends_at: '2026-11-15T12:00:00.000Z', leading_amount: 25, min_bid: 27.5, start_price: 5, period_days: 30 }
const FREE = { coin: 'BANK_CUP', offer_type: 'buy', state: 'free', holder: null, starts_at: null, ends_at: null, leading_amount: null, min_bid: 5, start_price: 5, period_days: 30 }
const PAYLOAD = { coin: 'BANK_CUP', enabled: true, slots: [HELD, FREE], rules: { requirements: { min_completed: 25, min_rating: 4.5 }, max_rate_gap_pct: 5, market_window_hours: 24, min_market_sample: 5 }, eligibility: { ok: true, missing: [] } }

let clients = []
let updateUser

const settle = () => act(async () => { await new Promise(r => setTimeout(r, 20)) })

const renderPromote = async (coin = 'BANK_CUP') => {
	const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
	clients.push(client)
	const result = { current: null }
	const Harness = () => { result.current = useP2PPromote(coin); return null }
	await act(async () => { create(<QueryClientProvider client={client}><Harness /></QueryClientProvider>) })
	await settle()
	return { result, client }
}

const slot = (result, type) => result.current.payload.slots.find(s => s.offer_type === type)

beforeEach(() => {
	jest.clearAllMocks()
	updateUser = jest.fn()
	useAuth.mockReturnValue({ user: { uuid: 'yo', balance: '100', kyc: 1, p2p_enabled: 1 }, updateUser })
	p2pApi.promoState.mockResolvedValue({ success: true, data: PAYLOAD })
})

afterEach(() => {
	for (const client of clients) { client.clear(); client.unmount() }
	clients = []
})

test('la puja arranca en el mínimo y se puede escribir otra', async () => {
	const { result } = await renderPromote()
	expect(p2pApi.promoState).toHaveBeenCalledWith('BANK_CUP')
	expect(result.current.bidText(slot(result, 'sell'))).toBe('27.5')
	await act(async () => { result.current.setBid(slot(result, 'sell'), '30') })
	expect(result.current.bidText(slot(result, 'sell'))).toBe('30')
	expect(result.current.blockOf(slot(result, 'sell'))).toBeNull()
})

test('comprar un puesto libre: confirma, cobra el precio de salida y actualiza el saldo', async () => {
	p2pApi.promote.mockResolvedValue({ success: true, status: 201, data: { data: { uuid: 'b1', kind: 'purchase', status: 'won', amount: 5 }, action: 'purchase', slot: { ...FREE, state: 'held', holder: { uuid: 'yo', username: 'yo' } }, balance: 95 } })
	const { result } = await renderPromote()

	await act(async () => { result.current.openConfirm('buy') })
	expect(result.current.confirming).toBe('buy')
	await act(async () => { await result.current.submit() })

	const [payload] = p2pApi.promote.mock.calls[0]
	expect(payload).toMatchObject({ coin: 'BANK_CUP', offer_type: 'buy', amount: 5 })
	expect(payload.idempotency_key).toMatch(/^[A-Za-z0-9._-]{8,64}$/)
	expect(updateUser).toHaveBeenCalledWith({ balance: 95 })
	expect(toast.success).toHaveBeenCalledWith('Listo: eres el comerciante promocionado de BANK_CUP · Vender durante 30 días')
	expect(result.current.confirming).toBeNull()
})

test('pujar deja la puja como líder en la sesión y bloquea subirla', async () => {
	p2pApi.promote.mockResolvedValue({ success: true, status: 201, data: { data: { uuid: 'b2', kind: 'bid', status: 'held', amount: 27.5 }, action: 'bid', slot: { ...HELD, leading_amount: 27.5, min_bid: 30.25 }, balance: 72.5 } })
	const { result } = await renderPromote()

	await act(async () => { result.current.openConfirm('sell') })
	await act(async () => { await result.current.submit() })

	expect(p2pApi.promote.mock.calls[0][0]).toMatchObject({ offer_type: 'sell', amount: 27.5 })
	expect(toast.success).toHaveBeenCalledWith('Puja de $27.50 registrada. Si alguien te supera, te devolvemos el dinero al instante.')
	expect(result.current.leadingMine('sell')).toBe(true)
	expect(result.current.blockOf(slot(result, 'sell'))).toBe('leading')
})

test('la clave se mantiene en un reintento tras un fallo y rota tras el éxito', async () => {
	p2pApi.promote.mockResolvedValueOnce({ success: false, status: undefined, error: 'No se ha podido conectar con el servidor' })
	p2pApi.promote.mockResolvedValueOnce({ success: true, status: 201, data: { data: { uuid: 'b3', kind: 'purchase', status: 'won', amount: 5 }, action: 'purchase', balance: 95 } })
	p2pApi.promote.mockResolvedValueOnce({ success: true, status: 201, data: { data: { uuid: 'b4', kind: 'bid', status: 'held', amount: 27.5 }, action: 'bid', balance: 67.5 } })
	const { result } = await renderPromote()

	for (const type of ['buy', 'buy', 'sell']) {
		await act(async () => { result.current.openConfirm(type) })
		await act(async () => { await result.current.submit() })
		await settle()
	}

	const keys = p2pApi.promote.mock.calls.map(([body]) => body.idempotency_key)
	expect(keys[0]).toBe(keys[1])
	expect(keys[2]).not.toBe(keys[1])
	expect(toast.error).toHaveBeenCalledWith('No se ha podido conectar con el servidor')
})

test('precio cambiado: el puesto del servidor pinta el nuevo mínimo y el campo vuelve a él', async () => {
	const fresh = { ...HELD, leading_amount: 27.5, min_bid: 30.25 }
	p2pApi.promote.mockResolvedValue({ success: false, status: 409, error: 'El precio cambió: ahora el mínimo es $30.25', details: { code: 'PROMO_PRICE_CHANGED', min: 30.25, slot: fresh } })
	p2pApi.promoState.mockResolvedValueOnce({ success: true, data: PAYLOAD }).mockResolvedValue({ success: true, data: { ...PAYLOAD, slots: [fresh, FREE] } })
	const { result } = await renderPromote()

	await act(async () => { result.current.openConfirm('sell') })
	await act(async () => { await result.current.submit() })
	await settle()

	expect(toast.error).toHaveBeenCalledWith('El precio cambió: ahora el mínimo es $30.25')
	expect(slot(result, 'sell').min_bid).toBe(30.25)
	expect(result.current.bidText(slot(result, 'sell'))).toBe('30.25')
	expect(updateUser).not.toHaveBeenCalled()
})

test('ALREADY_LEADING también deja la puja como líder', async () => {
	p2pApi.promote.mockResolvedValue({ success: false, status: 409, error: 'Ya tienes la puja más alta por el próximo periodo', details: { code: 'ALREADY_LEADING', slot: HELD } })
	const { result } = await renderPromote()
	await act(async () => { result.current.openConfirm('sell') })
	await act(async () => { await result.current.submit() })
	expect(result.current.leadingMine('sell')).toBe(true)
})

test('sin saldo, sin reputación o con puja inválida no se abre la confirmación', async () => {
	useAuth.mockReturnValue({ user: { uuid: 'yo', balance: '3', kyc: 1, p2p_enabled: 1 }, updateUser })
	const { result } = await renderPromote()
	expect(result.current.blockOf(slot(result, 'buy'))).toBe('balance')
	await act(async () => { result.current.openConfirm('buy') })
	expect(result.current.confirming).toBeNull()

	useAuth.mockReturnValue({ user: { uuid: 'yo', balance: '100', kyc: 1, p2p_enabled: 1 }, updateUser })
	p2pApi.promoState.mockResolvedValue({ success: true, data: { ...PAYLOAD, eligibility: { ok: false, missing: [{ key: 'min_completed', required: 25, actual: 12 }] } } })
	const second = await renderPromote()
	expect(second.result.current.eligible).toBe(false)
	expect(second.result.current.blockOf(slot(second.result, 'buy'))).toBe('ineligible')
	await act(async () => { second.result.current.openConfirm('buy') })
	expect(second.result.current.confirming).toBeNull()
	expect(p2pApi.promote).not.toHaveBeenCalled()
})

test('el doble toque manda una sola operación', async () => {
	let resolve
	p2pApi.promote.mockImplementation(() => new Promise(r => { resolve = r }))
	const { result } = await renderPromote()
	await act(async () => { result.current.openConfirm('buy') })
	await act(async () => {
		result.current.submit()
		result.current.submit()
	})
	expect(p2pApi.promote).toHaveBeenCalledTimes(1)
	await act(async () => { resolve({ success: true, status: 201, data: { data: { kind: 'purchase' }, action: 'purchase', balance: 95 } }) })
})
