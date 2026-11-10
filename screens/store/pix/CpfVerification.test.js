/**
 * Pantalla del CPF: una errata no llega al servidor, y cada respuesta acaba en su estado.
 * @jest-environment node
 */
jest.mock('../../../ui/particles/QPButton', () => 'QPButton')
jest.mock('../../../ui/particles/QPInput', () => 'QPInput')
jest.mock('../../../ui/QPKeyboardView', () => ({ __esModule: true, default: ({ children, actions }) => {
	const { createElement } = require('react')
	return createElement('View', null, children, actions)
} }))
jest.mock('@react-native-vector-icons/fontawesome6', () => 'FontAwesome6')
jest.mock('@react-navigation/native', () => ({ useFocusEffect: (effect) => require('react').useEffect(effect, [effect]) }))
jest.mock('lottie-react-native', () => 'LottieView')
jest.mock('../../../api/userApi', () => ({ userApi: { getCip: jest.fn(), verifyCpf: jest.fn() } }))
jest.mock('../../../api/transferApi', () => ({ transferApi: {} }))
jest.mock('../../../api/pixApi', () => ({ pixApi: {} }))
jest.mock('../../../theme/ThemeContext', () => {
	const { createTheme } = require('../../../theme/themeTokens')
	const theme = createTheme(true)
	return { useTheme: () => ({ theme }) }
})

import React from 'react'
import { act, create } from 'react-test-renderer'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { userApi } from '../../../api/userApi'
import CpfVerification from './CpfVerification'

const CPF = (over) => ({ status: 'none', verified_at: null, cpf_last2: null, attempts_left: 3, attempts_max: 3, can_start: true, block_reason: null, message: null, ...over })
const cipWith = (cpf) => ({ success: true, data: { us_person: false, cpf_verification: cpf } })

const settle = () => act(async () => { await new Promise(resolve => setTimeout(resolve, 20)) })

describe('CpfVerification', () => {
	let client
	let tree
	let navigation

	const render = async () => {
		client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
		jest.spyOn(client, 'invalidateQueries')
		navigation = { goBack: jest.fn(), navigate: jest.fn() }
		await act(async () => { tree = create(<QueryClientProvider client={client}><CpfVerification navigation={navigation} /></QueryClientProvider>) })
		await settle()
	}

	const byTestId = (id) => tree.root.findAll(node => node.props.testID === id && typeof node.type === 'string')
	const type = (value) => act(() => { byTestId('cpf-input')[0].props.onChangeText(value) })
	const submit = async () => {
		await act(async () => { await byTestId('cpf-submit')[0].props.onPress() })
		await settle()
	}
	const textOf = (id) => JSON.stringify(byTestId(id).map(node => node.props.children))

	beforeEach(() => {
		jest.clearAllMocks()
		userApi.getCip.mockResolvedValue(cipWith(CPF()))
	})

	afterEach(async () => {
		await act(async () => { tree.unmount() })
		client.clear()
	})

	test('aplica la máscara mientras se teclea', async () => {
		await render()
		type('52998224725')
		expect(byTestId('cpf-input')[0].props.value).toBe('529.982.247-25')
		expect(byTestId('cpf-submit')[0].props.disabled).toBe(false)
	})

	test('con los dígitos verificadores mal no gasta un intento', async () => {
		await render()
		type('52998224724')
		expect(byTestId('cpf-invalid')).toHaveLength(1)
		expect(byTestId('cpf-submit')[0].props.disabled).toBe(true)
		await submit()
		expect(userApi.verifyCpf).not.toHaveBeenCalled()
	})

	test('a medio teclear no regaña', async () => {
		await render()
		type('529982')
		expect(byTestId('cpf-invalid')).toHaveLength(0)
		expect(byTestId('cpf-submit')[0].props.disabled).toBe(true)
	})

	test('verificado: enseña solo los dos últimos dígitos y refresca la eligibilidad', async () => {
		userApi.verifyCpf.mockResolvedValue({ success: true, data: { status: 'verified', verified_at: '2026-11-06T15:04:05.000Z', cpf_last2: '25', attempts_left: 2 } })
		await render()
		type('52998224725')
		await submit()
		expect(userApi.verifyCpf).toHaveBeenCalledWith('529.982.247-25')
		expect(textOf('cpf-masked')).toContain('***.***.***-25')
		expect(client.invalidateQueries).toHaveBeenCalledWith({ queryKey: ['pix', 'eligibility'] })
		act(() => { byTestId('cpf-continue')[0].props.onPress() })
		expect(navigation.goBack).toHaveBeenCalled()
	})

	test('el doble toque solo consulta una vez: cada consulta gasta un intento', async () => {
		let resolve
		userApi.verifyCpf.mockReturnValue(new Promise(r => { resolve = r }))
		await render()
		type('52998224725')
		const onPress = byTestId('cpf-submit')[0].props.onPress
		await act(async () => { onPress(); onPress() })
		await act(async () => { resolve({ success: false, status: 409, details: { code: 'CPF_NO_MATCH' } }) })
		await settle()
		expect(userApi.verifyCpf).toHaveBeenCalledTimes(1)
	})

	test('sin coincidencia lo dice y recuenta los intentos con el servidor', async () => {
		userApi.verifyCpf.mockResolvedValue({ success: false, status: 409, error: 'Los datos no coinciden', details: { code: 'CPF_NO_MATCH', attempts_left: 1 } })
		await render()
		type('52998224725')
		userApi.getCip.mockResolvedValue(cipWith(CPF({ status: 'no_match', attempts_left: 1 })))
		await submit()
		expect(textOf('cpf-error')).toContain('Los datos no coinciden con el registro de Brasil.')
		expect(JSON.stringify(tree.toJSON())).toContain('Te queda 1 intento.')
	})

	test('agotados los intentos, la salida es soporte', async () => {
		userApi.getCip.mockResolvedValue(cipWith(CPF({ can_start: false, attempts_left: 0, block_reason: 'ATTEMPTS_EXHAUSTED', message: 'Agotaste' })))
		await render()
		expect(byTestId('cpf-input')).toHaveLength(0)
		expect(textOf('cpf-blocked')).toContain('Agotaste los intentos de verificación')
		expect(byTestId('cpf-block-action')).toHaveLength(1)
	})

	test('sin documento verificado, la salida es rehacer la identidad', async () => {
		userApi.getCip.mockResolvedValue(cipWith(CPF({ can_start: false, block_reason: 'DOCUMENT_REQUIRED', message: 'Necesitamos' })))
		await render()
		act(() => { byTestId('cpf-block-action')[0].props.onPress() })
		expect(navigation.navigate).toHaveBeenCalledWith('SettingsStack', { screen: 'KYC', initial: false })
	})

	test('sin GOLD, la salida es comprarlo: no se queda sin botón', async () => {
		userApi.getCip.mockResolvedValue(cipWith(CPF({ can_start: false, block_reason: 'GOLD_REQUIRED', message: 'La verificación' })))
		await render()
		expect(textOf('cpf-blocked')).toContain('disponible para cuentas GOLD')
		act(() => { byTestId('cpf-block-action')[0].props.onPress() })
		expect(navigation.navigate).toHaveBeenCalledWith('GoldCheck')
	})

	test('un motivo sin salida no enseña botón', async () => {
		userApi.getCip.mockResolvedValue(cipWith(CPF({ can_start: false, block_reason: 'MINOR', message: 'Menor' })))
		await render()
		expect(textOf('cpf-blocked')).toContain('Debes ser mayor de edad')
		expect(byTestId('cpf-block-action')).toHaveLength(0)
	})

	test('ya verificado de antes: va directo a la confirmación', async () => {
		userApi.getCip.mockResolvedValue(cipWith(CPF({ status: 'verified', cpf_last2: '25', can_start: false })))
		await render()
		expect(textOf('cpf-masked')).toContain('***.***.***-25')
	})

	test('un qpweb sin la verificación no enseña el formulario', async () => {
		userApi.getCip.mockResolvedValue({ success: true, data: { us_person: false } })
		await render()
		expect(byTestId('cpf-input')).toHaveLength(0)
		expect(textOf('cpf-blocked')).toContain('no está disponible')
	})
})
