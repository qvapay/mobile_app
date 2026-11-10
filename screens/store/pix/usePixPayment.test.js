/**
 * La opción de pago: qué se ofrece, y que cada respuesta del servidor acabe donde tiene que acabar.
 * @jest-environment node
 */
const mockFocus = { current: null }
jest.mock('@react-navigation/native', () => ({
	useNavigation: jest.fn(),
	useFocusEffect: (effect) => require('react').useEffect(() => { mockFocus.current = effect; return effect() }, [effect]),
}))
jest.mock('sonner-native', () => ({ toast: { error: jest.fn() } }))
jest.mock('../../../api/pixApi', () => ({ pixApi: { getEligibility: jest.fn(), createCheckout: jest.fn() } }))

import React from 'react'
import { act, create } from 'react-test-renderer'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useNavigation } from '@react-navigation/native'
import { toast } from 'sonner-native'
import { pixApi } from '../../../api/pixApi'
import usePixPayment from './usePixPayment'

const ELIGIBLE = { eligible: true, reason: null, surfaces: ['topup', 'voucher'], quote: { usd_per_brl: 0.18, surcharge_pct: 3, provider_pct: 4.5 }, cap: { cap: 400, used: 0, remaining: 400, resets_at: null, window_days: 30 }, hold_hours: 72, instant_max_usd: 25 }
const CHARGE = { uuid: 'c1', surface: 'topup', stage: 'awaiting_payment' }

const settle = () => act(async () => { await new Promise(resolve => setTimeout(resolve, 20)) })

describe('usePixPayment', () => {
	let client
	let tree
	let navigate
	let pix

	const Harness = (props) => {
		pix = usePixPayment(props)
		return null
	}

	const render = async (props = {}) => {
		const args = { surface: 'topup', base: 10, enabled: true, buildBody: () => ({ offer_id: 'o1' }), ...props }
		client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
		await act(async () => { tree = create(<QueryClientProvider client={client}><Harness {...args} /></QueryClientProvider>) })
		await settle()
	}

	beforeEach(() => {
		jest.clearAllMocks()
		navigate = jest.fn()
		useNavigation.mockReturnValue({ navigate })
		pixApi.getEligibility.mockResolvedValue({ success: true, data: ELIGIBLE })
	})

	afterEach(async () => {
		await act(async () => { tree.unmount() })
		client.clear()
	})

	test('ofrece PIX con su precio y sale sin elegir', async () => {
		await render()
		expect(pix.offer).toEqual({ kind: 'ready', quote: { totalUsd: 10.79, totalBrl: 59.95 } })
		expect(pix.selected).toBe(false)
		expect(pix.payLabel).toBe('Pagar con PIX · R$ 59,95')
		expect(pix.holdHours).toBe(72)
	})

	test('con un precio estimado lo dice en el botón', async () => {
		await render({ estimate: true })
		expect(pix.payLabel).toBe('Pagar con PIX · ≈ R$ 59,95')
	})

	test('sin ruta en el backend no pinta nada y no molesta', async () => {
		pixApi.getEligibility.mockResolvedValue({ success: false, status: 404, error: 'Not found' })
		await render()
		expect(pix.offer.kind).toBe('hidden')
		expect(toast.error).not.toHaveBeenCalled()
	})

	test('no pregunta hasta que la compra va a pagarse, ni por una compra excluida', async () => {
		await render({ enabled: false })
		expect(pixApi.getEligibility).not.toHaveBeenCalled()
		await act(async () => { tree.unmount() })
		client.clear()
		await render({ excluded: true })
		expect(pixApi.getEligibility).not.toHaveBeenCalled()
		expect(pix.offer.kind).toBe('hidden')
	})

	test('elegir PIX avisa para apagar el descuento en sats; volver al saldo, no', async () => {
		const onChoose = jest.fn()
		await render({ onChoose })
		act(() => { pix.choose(true) })
		expect(pix.selected).toBe(true)
		expect(onChoose).toHaveBeenCalledTimes(1)
		act(() => { pix.choose(false) })
		expect(pix.selected).toBe(false)
		expect(onChoose).toHaveBeenCalledTimes(1)
	})

	test('sin CPF lleva a verificarlo y al volver ya sale elegida', async () => {
		pixApi.getEligibility.mockResolvedValue({ success: true, data: { ...ELIGIBLE, eligible: false, reason: 'CPF_REQUIRED', quote: null } })
		await render()
		expect(pix.offer.kind).toBe('cpf')
		act(() => { pix.openCpf() })
		expect(navigate).toHaveBeenCalledWith('CpfVerification')
		expect(pix.selected).toBe(false)

		pixApi.getEligibility.mockResolvedValue({ success: true, data: ELIGIBLE })
		await act(async () => { await client.invalidateQueries({ queryKey: ['pix', 'eligibility'] }) })
		await settle()
		expect(pix.selected).toBe(true)
	})

	test('sin GOLD lleva a comprarlo, y al volver a la compra pregunta otra vez', async () => {
		pixApi.getEligibility.mockResolvedValue({ success: true, data: { ...ELIGIBLE, eligible: false, reason: 'CPF_REQUIRED', gold_required: true, quote: null } })
		await render()
		expect(pix.offer.kind).toBe('gold')
		act(() => { pix.openGold() })
		expect(navigate).toHaveBeenCalledWith('GoldCheck')

		// Vuelve con GOLD: ya puede verificar el CPF
		pixApi.getEligibility.mockResolvedValue({ success: true, data: { ...ELIGIBLE, eligible: false, reason: 'CPF_REQUIRED', gold_required: false, quote: null } })
		await act(async () => { mockFocus.current() })
		await settle()
		expect(pix.offer.kind).toBe('cpf')
	})

	test('paga con el source de la compra y abre el QR', async () => {
		pixApi.createCheckout.mockResolvedValue({ success: true, data: CHARGE })
		await render({ doneDepth: 2, buildBody: () => ({ offer_id: 'o1', phone_number: '+55', country: 'BR', amount: 10 }) })
		await act(async () => { await pix.pay() })
		expect(pixApi.createCheckout).toHaveBeenCalledWith({ source: 'topup', offer_id: 'o1', phone_number: '+55', country: 'BR', amount: 10 })
		expect(navigate).toHaveBeenCalledWith('PixCheckout', { charge: CHARGE, holdHours: 72, doneDepth: 2 })
	})

	test('un cuerpo incompleto no llega al servidor', async () => {
		await render({ buildBody: () => null })
		await act(async () => { await pix.pay() })
		expect(pixApi.createCheckout).not.toHaveBeenCalled()
	})

	test('el doble toque solo crea un cobro', async () => {
		let resolve
		pixApi.createCheckout.mockReturnValue(new Promise(r => { resolve = r }))
		await render()
		await act(async () => { pix.pay(); pix.pay() })
		expect(pix.starting).toBe(true)
		await act(async () => { resolve({ success: true, data: CHARGE }) })
		await settle()
		expect(pixApi.createCheckout).toHaveBeenCalledTimes(1)
		expect(pix.starting).toBe(false)
	})

	test('PIX_QR_OPEN abre el QR abierto en vez de avisar', async () => {
		pixApi.createCheckout.mockResolvedValue({ success: false, status: 409, error: 'Ya tienes un PIX abierto', details: { code: 'PIX_QR_OPEN', charge: CHARGE } })
		await render()
		await act(async () => { await pix.pay() })
		expect(navigate).toHaveBeenCalledWith('PixCheckout', expect.objectContaining({ charge: CHARGE }))
		expect(toast.error).not.toHaveBeenCalled()
	})

	test('las líneas del carrito no viajan con el QR abierto de otra compra', async () => {
		pixApi.createCheckout.mockResolvedValue({ success: false, status: 409, details: { code: 'PIX_QR_OPEN', charge: { ...CHARGE, surface: 'topup' } } })
		pixApi.getEligibility.mockResolvedValue({ success: true, data: { ...ELIGIBLE, surfaces: ['market'] } })
		await render({ surface: 'market', cartKeys: ['a'] })
		await act(async () => { await pix.pay() })
		expect(navigate.mock.calls[0][1].cartKeys).toBeUndefined()
	})

	test('el tope dice cuánto queda y cuándo se renueva', async () => {
		pixApi.createCheckout.mockResolvedValue({ success: false, status: 409, details: { code: 'PIX_CAP_EXCEEDED', remaining: 12.5, resets_at: '2026-12-01T12:00:00.000Z' } })
		await render()
		await act(async () => { await pix.pay() })
		expect(navigate).not.toHaveBeenCalled()
		const [title, options] = toast.error.mock.calls[0]
		expect(title).toBe('Superas el tope de PIX de 30 días')
		expect(options.description).toContain('Te quedan $12.50.')
		expect(options.description).toContain('diciembre')
	})

	test('un CPF que se cayó vuelve a la pantalla del CPF', async () => {
		pixApi.createCheckout.mockResolvedValue({ success: false, status: 403, details: { code: 'CPF_REQUIRED' } })
		await render()
		await act(async () => { await pix.pay() })
		expect(navigate).toHaveBeenCalledWith('CpfVerification')
	})

	test('una recarga a Cuba que exige destinatario lo pide', async () => {
		const onRecipientRequired = jest.fn()
		pixApi.createCheckout.mockResolvedValue({ success: false, status: 400, error: 'Indica el nombre', details: { code: 'RECIPIENT_NAME_REQUIRED' } })
		await render({ onRecipientRequired })
		await act(async () => { await pix.pay() })
		expect(onRecipientRequired).toHaveBeenCalled()
	})

	test('un veto retira la opción de esta compra y traduce el motivo', async () => {
		pixApi.createCheckout.mockResolvedValue({ success: false, status: 403, error: 'Esta tarjeta no se puede pagar con PIX', details: { code: 'PIX_BRAND_BLOCKED' } })
		await render({ surface: 'voucher' })
		act(() => { pix.choose(true) })
		await act(async () => { await pix.pay() })
		await settle()
		expect(pix.offer.kind).toBe('hidden')
		expect(pix.selected).toBe(false)
		expect(toast.error).toHaveBeenCalledWith('Esta tarjeta no se puede pagar con PIX.')
	})

	test('un error reintentable deja la opción en pie', async () => {
		pixApi.createCheckout.mockResolvedValue({ success: false, status: 429, error: 'Too many requests, please wait', details: { error: 'Too many requests, please wait' } })
		await render()
		await act(async () => { await pix.pay() })
		expect(pix.offer.kind).toBe('ready')
		expect(toast.error).toHaveBeenCalledWith('Espera unos segundos e inténtalo de nuevo.')
	})

	test('la red caída se cuenta con el mensaje del cliente', async () => {
		pixApi.createCheckout.mockResolvedValue({ success: false, error: 'No se ha podido conectar con el servidor' })
		await render()
		await act(async () => { await pix.pay() })
		expect(toast.error).toHaveBeenCalledWith('No se ha podido conectar con el servidor')
	})
})
