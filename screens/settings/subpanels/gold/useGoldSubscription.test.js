/**
 * Comprar GOLD tiene que llegar al resto de la app: todo lo demás lee `golden_check` del
 * AuthContext (la corona de la cabecera, la comisión de Retirar y la de tarjeta). Por las
 * tres vías de compra, y solo cuando la compra se confirma.
 * @jest-environment node
 */
let mockUser
// Como el de verdad: copia el usuario, espera a guardarlo en disco y solo entonces lo aplica
let mockStorageWrite
const mockUpdateUser = jest.fn(async (patch) => {
	const next = { ...mockUser, ...patch }
	await mockStorageWrite()
	mockUser = next
})
jest.mock('../../../../auth/AuthContext', () => ({ useAuth: () => ({ user: mockUser, updateUser: mockUpdateUser }) }))
let mockIap
const mockFinishTransaction = jest.fn(async () => {})
const mockGetAvailablePurchases = jest.fn()
jest.mock('react-native-iap', () => ({
	useIAP: (options) => {
		mockIap = options
		return { connected: false, subscriptions: [], fetchProducts: jest.fn(), requestPurchase: jest.fn() }
	},
	finishTransaction: (...args) => mockFinishTransaction(...args),
	getAvailablePurchases: (...args) => mockGetAvailablePurchases(...args),
}))
jest.mock('sonner-native', () => ({ toast: { success: jest.fn(), error: jest.fn(), info: jest.fn() } }))
jest.mock('../../../../api/userApi', () => ({
	userApi: { getGoldCheckStatus: jest.fn(), purchaseGold: jest.fn(), validateGoldReceipt: jest.fn(), getUserProfile: jest.fn() },
}))

import React from 'react'
import { Alert, Platform, Text } from 'react-native'
import { act, create } from 'react-test-renderer'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { toast } from 'sonner-native'
import { userApi } from '../../../../api/userApi'
import useProfileRefresh from '../../../../hooks/useProfileRefresh'
import useGoldSubscription from './useGoldSubscription'

const EXPIRE = '2026-12-08T00:00:00Z'
const PROFILE_KEY = ['home', 'profile']
const ACTIVATED = { golden_check: true, golden_expire: EXPIRE }
// La forma que entrega react-native-iap en Android: el recibo viaja en `purchaseToken`
const IAP_PURCHASE = { id: 'order-1', transactionId: 'order-1', purchaseToken: 'play-token', productId: 'gold_check', store: 'google', platform: 'android' }
const NOT_CONFIRMED = [
	['pendiente de pago', { success: true, status: 202, data: { pending: true } }],
	['que no valida', { success: false, status: 400, error: 'Recibo inválido' }],
]

const settle = () => act(async () => { await new Promise(resolve => setTimeout(resolve, 20)) })

let api
let refreshProfile
let tree
let client
let serverGold
let platform
const Probe = () => {
	api = useGoldSubscription()
	refreshProfile = useProfileRefresh()
	return <Text>x</Text>
}
const open = async () => {
	// gcTime infinito: una query sin terminar no deja vivo a jest si un test falla a medias
	client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } })
	await act(async () => { tree = create(<QueryClientProvider client={client}><Probe /></QueryClientProvider>) })
	await settle()
}
// La compra con saldo espera a que se acepte el aviso de confirmación
const payWithBalance = async () => {
	const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {})
	await act(async () => { api.handleSubscribe() })
	const pay = alert.mock.calls.at(-1)[2][1]
	alert.mockRestore()
	await act(async () => { await pay.onPress() })
	await settle()
}

beforeEach(() => {
	jest.clearAllMocks()
	platform = jest.replaceProperty(Platform, 'OS', 'android')
	mockUser = { uuid: 'me', username: 'ana', balance: 100, golden_check: false, golden_expire: null }
	mockStorageWrite = async () => {}
	serverGold = false
	userApi.getGoldCheckStatus.mockImplementation(async () => ({ success: true, data: { golden_check: serverGold, golden_expire: serverGold ? EXPIRE : null } }))
	userApi.purchaseGold.mockImplementation(async () => { serverGold = true; return { success: true, data: { golden_expire: EXPIRE } } })
	userApi.validateGoldReceipt.mockImplementation(async () => { serverGold = true; return { success: true, data: { success: true, golden_expire: EXPIRE } } })
	userApi.getUserProfile.mockResolvedValue({ success: true, data: { balance: 94.01, golden_check: 1, golden_expire: EXPIRE } })
})
afterEach(async () => {
	await act(async () => { tree.unmount() })
	client.clear()
	platform.restore()
})

describe('comprar GOLD llega al resto de la app', () => {
	test('con saldo: GOLD activo y el saldo que dice el servidor', async () => {
		await open()
		await payWithBalance()
		expect(mockUser.golden_check).toBeTruthy()
		expect(mockUser.golden_expire).toBe(EXPIRE)
		expect(mockUser.balance).toBe(94.01)
		expect(mockUser).not.toHaveProperty('gold_check')
		expect(api.goldCheckStatus).toBe(true)
		expect(api.goldCheckExpire).toBe(EXPIRE)
	})

	test('solo se escribe lo que cambia: una copia vieja del usuario no pisa nada', async () => {
		await open()
		await payWithBalance()
		expect(mockUpdateUser).toHaveBeenNthCalledWith(1, ACTIVATED)
	})

	test('si el perfil no se puede releer, GOLD queda activo igualmente', async () => {
		userApi.getUserProfile.mockResolvedValue({ success: false, error: 'red' })
		await open()
		await payWithBalance()
		expect(mockUser.golden_check).toBe(true)
		expect(mockUser.balance).toBe(100)
	})

	test('por la tienda: al validarse el recibo', async () => {
		await open()
		await act(async () => { await mockIap.onPurchaseSuccess(IAP_PURCHASE) })
		await settle()
		expect(userApi.validateGoldReceipt).toHaveBeenCalledWith(expect.objectContaining({ receipt: 'play-token', platform: 'android' }))
		expect(mockFinishTransaction).toHaveBeenCalledTimes(1)
		expect(mockUpdateUser).toHaveBeenNthCalledWith(1, ACTIVATED)
		expect(mockUser.golden_expire).toBe(EXPIRE)
	})

	test('por la tienda: si cerrar la compra falla, el servidor ya la aceptó y GOLD queda activo', async () => {
		mockFinishTransaction.mockRejectedValueOnce(new Error('billing'))
		await open()
		await act(async () => { await mockIap.onPurchaseSuccess(IAP_PURCHASE) })
		await settle()
		expect(mockUpdateUser).toHaveBeenNthCalledWith(1, ACTIVATED)
		expect(toast.success).toHaveBeenCalledTimes(1)
		expect(toast.error).not.toHaveBeenCalled()
	})

	test('al restaurar una compra', async () => {
		mockGetAvailablePurchases.mockResolvedValue([IAP_PURCHASE])
		await open()
		await act(async () => { await api.handleRestore() })
		await settle()
		expect(userApi.validateGoldReceipt).toHaveBeenCalledWith(expect.objectContaining({ receipt: 'play-token' }))
		expect(mockUpdateUser).toHaveBeenNthCalledWith(1, ACTIVATED)
	})

	test.each([
		['con el perfil en caché', { balance: 100, golden_check: 0, golden_expire: null }],
		['sin perfil en caché', undefined],
	])('una lectura anterior a la compra no la deshace al llegar tarde: %s', async (_, cached) => {
		await open()
		if (cached) { client.setQueryData(PROFILE_KEY, cached) }
		let answerOld
		userApi.getUserProfile.mockImplementationOnce(() => new Promise((resolve) => { answerOld = resolve }))
		let older
		await act(async () => { older = refreshProfile() })
		await payWithBalance()
		await act(async () => { answerOld({ success: true, data: { balance: 100, golden_check: 0, golden_expire: null } }) })
		await older
		await settle()
		expect(userApi.getUserProfile).toHaveBeenCalledTimes(2)
		// Ninguna escritura vuelve a decir que no es GOLD: si llegaran en otro orden, no importaría
		expect(mockUpdateUser.mock.calls.filter(([patch]) => 'golden_check' in patch && !patch.golden_check)).toEqual([])
		expect(mockUser.golden_check).toBeTruthy()
		expect(mockUser.balance).toBe(94.01)
	})

	test('el perfil se relee cuando GOLD ya está guardado: esa escritura lenta no pisa el saldo nuevo', async () => {
		await open()
		let finishWrite
		mockStorageWrite = () => new Promise((resolve) => {
			finishWrite = resolve
			mockStorageWrite = async () => {}
		})
		await payWithBalance()
		expect(userApi.getUserProfile).not.toHaveBeenCalled()
		await act(async () => { finishWrite() })
		await settle()
		expect(userApi.getUserProfile).toHaveBeenCalledTimes(1)
		expect(mockUser.golden_check).toBeTruthy()
		expect(mockUser.balance).toBe(94.01)
	})

	test('la caché del perfil también queda en GOLD: Home la vuelca al volver, aunque no se pueda releer', async () => {
		await open()
		client.setQueryData(PROFILE_KEY, { balance: 100, golden_check: 0, golden_expire: null })
		userApi.getUserProfile.mockResolvedValue({ success: false, error: 'red' })
		await payWithBalance()
		expect(client.getQueryData(PROFILE_KEY)).toMatchObject({ balance: 100, golden_check: true, golden_expire: EXPIRE })
	})
})

describe('sin compra confirmada no se activa nada', () => {
	test('un pago de tienda aún pendiente', async () => {
		userApi.validateGoldReceipt.mockResolvedValue({ success: true, status: 202, data: { pending: true } })
		await open()
		await act(async () => { await mockIap.onPurchaseSuccess(IAP_PURCHASE) })
		await settle()
		expect(mockFinishTransaction).not.toHaveBeenCalled()
		expect(mockUpdateUser).not.toHaveBeenCalled()
		expect(userApi.getUserProfile).not.toHaveBeenCalled()
	})

	test.each(NOT_CONFIRMED)('al restaurar una compra %s', async (_, answer) => {
		mockGetAvailablePurchases.mockResolvedValue([IAP_PURCHASE])
		userApi.validateGoldReceipt.mockResolvedValue(answer)
		await open()
		await act(async () => { await api.handleRestore() })
		await settle()
		expect(mockUpdateUser).not.toHaveBeenCalled()
		expect(userApi.getUserProfile).not.toHaveBeenCalled()
	})

	test('una compra con saldo rechazada', async () => {
		userApi.purchaseGold.mockResolvedValue({ success: false, error: 'Saldo insuficiente' })
		await open()
		await payWithBalance()
		expect(mockUpdateUser).not.toHaveBeenCalled()
		expect(userApi.getUserProfile).not.toHaveBeenCalled()
	})

	test('un recibo que no valida', async () => {
		userApi.validateGoldReceipt.mockResolvedValue({ success: false, status: 400, error: 'Recibo inválido' })
		await open()
		await act(async () => { await mockIap.onPurchaseSuccess(IAP_PURCHASE) })
		await settle()
		expect(mockUpdateUser).not.toHaveBeenCalled()
	})
})
