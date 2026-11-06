/**
 * Datos personales con el bloque del SSN de verdad: la consulta usa la ficha GUARDADA, así
 * que no se ofrece con cambios a medias, y lo que permite se refresca al entrar y al volver.
 * @jest-environment node
 */
jest.mock('../../../theme/ThemeContext', () => {
	const { createTheme } = jest.requireActual('../../../theme/themeTokens')
	return { useTheme: () => ({ theme: createTheme(true) }) }
})
jest.mock('../../../auth/AuthContext', () => ({ useAuth: () => ({ updateUser: jest.fn() }) }))
jest.mock('../../../ui/QPKeyboardView', () => {
	const React = require('react')
	const { View } = require('react-native')
	return ({ children, actions }) => React.createElement(View, null, children, actions)
})
jest.mock('../../../ui/particles/QPInput', () => 'QPInput')
jest.mock('../../../ui/particles/QPButton', () => 'QPButton')
jest.mock('../../../ui/particles/QPLoader', () => 'QPLoader')
jest.mock('../../../ui/particles/QPPressable', () => 'QPPressable')
jest.mock('../../../ui/QPModalCard', () => 'QPModalCard')
jest.mock('../../../ui/OptionPickerModal', () => 'OptionPickerModal')
jest.mock('../../../ui/AddressAutocomplete', () => 'AddressAutocomplete')
jest.mock('@react-native-vector-icons/fontawesome6', () => 'FontAwesome6')
jest.mock('lottie-react-native', () => 'LottieView')
jest.mock('react-native/Libraries/Modal/Modal', () => ({ __esModule: true, default: 'Modal' }))
// El useFocusEffect de React Navigation corre al enfocar la pantalla (el paquete real es
// ESM y jest no lo transforma); `mockRefocus` es volver a ella desde otra
let mockRefocus
jest.mock('@react-navigation/native', () => {
	const { useEffect } = require('react')
	return {
		useNavigation: () => ({ navigate: jest.fn() }),
		useFocusEffect: (effect) => { useEffect(() => { mockRefocus = effect; return effect() }, [effect]) },
	}
})
jest.mock('sonner-native', () => ({ toast: { success: jest.fn(), error: jest.fn(), info: jest.fn() } }))
jest.mock('../../../api/userApi', () => ({
	userApi: { verifySsn: jest.fn(), getCip: jest.fn(), getUserProfile: jest.fn(), updateUser: jest.fn(), getDepositEligibility: jest.fn() },
}))
jest.mock('../../../api/transferApi', () => ({ transferApi: {} }))

import React from 'react'
import { Text } from 'react-native'
import { act, create } from 'react-test-renderer'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { userApi } from '../../../api/userApi'
import Userdata from './Userdata'
import CipSection from './userdata/CipSection'

const VERIFY = 'Verificar mi SSN'
const GOLD_MESSAGE = 'disponible para cuentas GOLD'

const ssn = (over = {}) => ({ status: 'none', verified_at: null, attempts_left: 3, attempts_max: 3, can_start: true, block_reason: null, message: null, ...over })
const cipWith = (verification) => ({
	us_person: true, ssn_itin_last4: '1234', addr_line1: '818 Leahy Cir', addr_line2: '', addr_city: 'Dover', addr_state: 'DE', addr_postal: '19901', addr_country: 'US',
	cip_status: 'complete', has_document_hash: true, ssn_verification: verification,
})
const NO_MATCH = cipWith(ssn({ status: 'no_match', attempts_left: 2 }))
const NEEDS_GOLD = cipWith(ssn({ can_start: false, block_reason: 'GOLD_REQUIRED' }))
const READY = cipWith(ssn())

const serveCip = (data) => userApi.getCip.mockResolvedValue({ success: true, data })

const settle = () => act(async () => { await new Promise(resolve => setTimeout(resolve, 20)) })

let client
let trees = []
const open = async () => {
	let tree
	await act(async () => { tree = create(<QueryClientProvider client={client}><Userdata /></QueryClientProvider>) })
	trees.push(tree)
	await settle()
	return tree
}
const leave = async (tree) => {
	await act(async () => { tree.unmount() })
	trees = trees.filter(item => item !== tree)
}

const buttons = (tree) => tree.root.findAllByType('QPButton')
const verifyButton = (tree) => buttons(tree).find(button => button.props.title === VERIFY)
const saveButton = (tree) => buttons(tree).at(-1)
const byTestId = (tree, testID) => tree.root.findAll(node => node.props.testID === testID && typeof node.type === 'string')
const hasText = (tree, needle) => tree.root.findAllByType(Text).some(node => [].concat(node.props.children).join('').includes(needle))
const editCip = (tree, patch) => act(async () => { tree.root.findByType(CipSection).props.onChange(patch) })

beforeEach(() => {
	jest.clearAllMocks()
	client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
	userApi.getUserProfile.mockResolvedValue({ success: true, data: { name: 'Ana', lastname: 'Diaz', username: 'ana', email: 'ana@example.invalid', bio: '' } })
	userApi.updateUser.mockResolvedValue({ success: true, data: { name: 'Ana', lastname: 'Diaz' } })
	userApi.getDepositEligibility.mockResolvedValue({ success: true, data: {} })
	serveCip(NO_MATCH)
})
afterEach(async () => {
	for (const tree of trees) { await act(async () => { tree.unmount() }) }
	trees = []
	client.clear()
})

describe('verificar con la ficha sin guardar', () => {
	test('un SSN corregido sin guardar no deja verificar: se gastaría un intento con el viejo', async () => {
		const tree = await open()
		expect(verifyButton(tree).props.disabled).toBe(false)
		await act(async () => { byTestId(tree, 'cip-ssn')[0].props.onChangeText('987654321') })
		expect(verifyButton(tree).props.disabled).toBe(true)
		expect(byTestId(tree, 'ssn-unsaved-hint')).toHaveLength(1)
		expect(userApi.verifySsn).not.toHaveBeenCalled()
	})

	test('una dirección a medias tampoco, y deshacer el cambio lo devuelve', async () => {
		const tree = await open()
		await editCip(tree, { addrCity: 'Newark' })
		expect(verifyButton(tree).props.disabled).toBe(true)
		await editCip(tree, { addrCity: 'Dover' })
		expect(verifyButton(tree).props.disabled).toBe(false)
		expect(byTestId(tree, 'ssn-unsaved-hint')).toHaveLength(0)
	})

	test('cambiar la bio no toca la ficha: se puede verificar', async () => {
		const tree = await open()
		await act(async () => { tree.root.findAllByType('QPInput').find(input => input.props.multiline).props.onChangeText('Hola') })
		expect(verifyButton(tree).props.disabled).toBe(false)
	})

	test('al guardar se puede verificar, y primero viaja el SSN nuevo', async () => {
		userApi.verifySsn.mockResolvedValue({ success: false, status: 409, error: 'x', details: { code: 'SSN_NO_MATCH', attempts_left: 1 } })
		const tree = await open()
		await act(async () => { byTestId(tree, 'cip-ssn')[0].props.onChangeText('987654321') })
		serveCip(cipWith(ssn()))
		await act(async () => { saveButton(tree).props.onPress() })
		await settle()
		expect(userApi.updateUser).toHaveBeenCalledWith(expect.objectContaining({ cip: expect.objectContaining({ ssn: '987654321' }) }))
		expect(verifyButton(tree).props.disabled).toBe(false)

		await act(async () => { verifyButton(tree).props.onPress() })
		await settle()
		await act(async () => { byTestId(tree, 'ssn-confirm-accept')[0].props.onPress() })
		await settle()
		expect(userApi.verifySsn).toHaveBeenCalledTimes(1)
		expect(userApi.updateUser.mock.invocationCallOrder[0]).toBeLessThan(userApi.verifySsn.mock.invocationCallOrder[0])
	})
})

describe('lo que permite la ficha se refresca', () => {
	test('al volver de comprar GOLD ofrece verificar, sin esperar a que caduque la caché', async () => {
		serveCip(NEEDS_GOLD)
		const tree = await open()
		expect(hasText(tree, GOLD_MESSAGE)).toBe(true)
		expect(verifyButton(tree)).toBeUndefined()

		serveCip(READY)
		await act(async () => { mockRefocus() })
		await settle()
		expect(hasText(tree, GOLD_MESSAGE)).toBe(false)
		expect(verifyButton(tree).props.disabled).toBe(false)
	})

	test('al entrar de nuevo con la ficha aún en caché, también', async () => {
		serveCip(NEEDS_GOLD)
		await leave(await open())

		serveCip(READY)
		const tree = await open()
		expect(hasText(tree, GOLD_MESSAGE)).toBe(false)
		expect(verifyButton(tree).props.disabled).toBe(false)
	})

	test('al entrar con la ficha caducada se pide una sola vez', async () => {
		client.setQueryData(['user', 'cip'], READY, { updatedAt: Date.now() - 11 * 60 * 1000 })
		await open()
		expect(userApi.getCip).toHaveBeenCalledTimes(1)
	})

	test('refrescar no pisa lo que se está tecleando', async () => {
		const tree = await open()
		await act(async () => { byTestId(tree, 'cip-ssn')[0].props.onChangeText('987654321') })
		serveCip(READY)
		await act(async () => { mockRefocus() })
		await settle()
		expect(byTestId(tree, 'cip-ssn')[0].props.value).toBe('987-65-4321')
		expect(verifyButton(tree).props.disabled).toBe(true)
	})
})
