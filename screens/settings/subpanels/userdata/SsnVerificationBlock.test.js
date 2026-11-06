/**
 * Bloque de verificación del SSN: el éxito se queda en pantalla hasta que el usuario lo
 * cierre, y su modal nunca se presenta encima de la confirmación que aún se está yendo.
 * @jest-environment node
 */
jest.mock('../../../../ui/QPModalCard', () => 'QPModalCard')
jest.mock('../../../../ui/particles/QPButton', () => 'QPButton')
jest.mock('../../../../ui/particles/QPPressable', () => 'QPPressable')
jest.mock('@react-native-vector-icons/fontawesome6', () => 'FontAwesome6')
jest.mock('lottie-react-native', () => 'LottieView')
// El Modal de RN como host plano: el mock del preset no pinta nada con visible=false y la puerta necesita verlo
jest.mock('react-native/Libraries/Modal/Modal', () => ({ __esModule: true, default: 'Modal' }))
jest.mock('@react-navigation/native', () => ({ useNavigation: () => ({ navigate: jest.fn() }) }))
jest.mock('sonner-native', () => ({ toast: { success: jest.fn(), error: jest.fn(), info: jest.fn() } }))
jest.mock('../../../../api/userApi', () => ({ userApi: { verifySsn: jest.fn() } }))
jest.mock('../../../../api/transferApi', () => ({ transferApi: {} }))
jest.mock('../../../../theme/ThemeContext', () => {
	const { createTheme } = require('../../../../theme/themeTokens')
	const theme = createTheme(true)
	return { useTheme: () => ({ theme }) }
})

import React from 'react'
import { act, create } from 'react-test-renderer'
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query'
import { toast } from 'sonner-native'
import { userApi } from '../../../../api/userApi'
import { USER_CIP_QUERY } from '../../../../hooks/useOfacQueries'
import SsnVerificationBlock from './SsnVerificationBlock'

const CIP = {
	us_person: true,
	ssn_itin_last4: '6789',
	ssn_verification: { status: 'none', verified_at: null, attempts_left: 3, attempts_max: 3, can_start: true, block_reason: null, message: null },
}
const VERIFIED = { success: true, data: { status: 'verified', verified_at: '2026-11-05T12:00:00Z', attempts_left: 2 } }

/** La ficha sale de la caché real, como en Datos personales: verificar cambia la fase. */
const Harness = (props) => {
	const { data } = useQuery({ queryKey: USER_CIP_QUERY.queryKey, queryFn: () => CIP, enabled: false, initialData: CIP })
	return <SsnVerificationBlock cip={data} onHighlight={jest.fn()} {...props} />
}

const settle = () => act(async () => { await new Promise(resolve => setTimeout(resolve, 20)) })

const modals = (tree) => tree.root.findAllByType('Modal')
const button = (tree, testID) => tree.root.findAll(node => node.type === 'QPButton' && node.props.testID === testID)[0]
const texts = (node) => JSON.stringify(node.findAllByType('Text').map(item => item.props.children))

/** Abre la confirmación y llega al momento en que iOS avisa de que ya se presentó. */
const openConfirm = async (tree) => {
	act(() => { tree.root.findAll(node => node.type === 'QPButton' && node.props.icon === 'shield-halved')[0].props.onPress() })
	await settle()
	act(() => { modals(tree)[0].props.onShow() })
	await settle()
}

const accept = async (tree) => {
	await act(async () => { await button(tree, 'ssn-confirm-accept').props.onPress() })
	await settle()
}

describe('SsnVerificationBlock', () => {
	let client
	let tree

	const render = async (props) => {
		client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
		await act(async () => {
			tree = create(<QueryClientProvider client={client}><Harness {...props} /></QueryClientProvider>)
		})
		await settle()
	}

	beforeEach(() => { jest.clearAllMocks() })

	const verifyButton = () => tree.root.findAll(node => node.type === 'QPButton' && node.props.icon === 'shield-halved')[0]
	const unsavedHint = () => tree.root.findAll(node => node.props.testID === 'ssn-unsaved-hint' && typeof node.type === 'string')

	test('con cambios sin guardar no deja verificar y dice por qué', async () => {
		await render({ hasUnsavedChanges: true })
		expect(verifyButton().props.disabled).toBe(true)
		expect(texts(unsavedHint()[0])).toContain('Guarda los cambios de tu ficha antes de verificar')
	})

	test('sin cambios, ni aviso ni botón apagado', async () => {
		await render()
		expect(verifyButton().props.disabled).toBe(false)
		expect(unsavedHint()).toHaveLength(0)
	})

	afterEach(() => {
		act(() => { tree.unmount() })
		client.clear()
	})

	test('la confirmación no habla de los intentos', async () => {
		await render()
		await openConfirm(tree)
		expect(texts(modals(tree)[0])).toContain('registros de crédito')
		expect(texts(modals(tree)[0])).not.toMatch(/intento|30 días/)
	})

	test('el éxito se queda hasta que el usuario lo cierra', async () => {
		userApi.verifySsn.mockResolvedValue(VERIFIED)
		await render()
		await openConfirm(tree)
		await accept(tree)
		act(() => { modals(tree)[0].props.onDismiss() })
		await settle()

		const [success] = modals(tree)
		expect(success.props.visible).toBe(true)
		expect(texts(success)).toContain('SSN verificado')
		act(() => { success.props.onShow() })
		await settle()

		// La animación terminó: nada la oculta, ni se repite el aviso en un toast
		const lottie = tree.root.findByType('LottieView')
		expect(lottie.props.loop).toBe(false)
		expect(lottie.props.onAnimationFinish).toBeUndefined()
		expect(toast.success).not.toHaveBeenCalled()
		await act(async () => { await new Promise(resolve => setTimeout(resolve, 1600)) })
		expect(modals(tree)[0].props.visible).toBe(true)

		act(() => { button(tree, 'ssn-success-close').props.onPress() })
		await settle()
		expect(modals(tree)[0].props.visible).toBe(false)
		act(() => { modals(tree)[0].props.onDismiss() })
		await settle()
		expect(modals(tree)).toHaveLength(0)
		expect(tree.root.findAll(node => node.props.testID === 'ssn-verified-pill').length).toBeGreaterThan(0)
	})

	test('con la confirmación aún cerrándose, el éxito espera a su onDismiss (iOS)', async () => {
		userApi.verifySsn.mockResolvedValue(VERIFIED)
		await render()
		await openConfirm(tree)
		await accept(tree)

		// Ya es `verified` y la confirmación sigue montada: desmontarla ahora dejaría un zombi
		expect(tree.root.findAll(node => node.props.testID === 'ssn-verified-pill').length).toBeGreaterThan(0)
		expect(modals(tree)).toHaveLength(1)
		expect(modals(tree)[0].props.visible).toBe(false)
		expect(texts(modals(tree)[0])).toContain('registros de crédito')

		act(() => { modals(tree)[0].props.onDismiss() })
		await settle()
		expect(modals(tree)).toHaveLength(1)
		expect(texts(modals(tree)[0])).toContain('Ya puedes depositar')
		expect(modals(tree)[0].props.visible).toBe(true)
	})

	test('sin coincidencia no hay modal de éxito: toast con los intentos que quedan', async () => {
		userApi.verifySsn.mockResolvedValue({ success: false, status: 409, details: { code: 'SSN_NO_MATCH', attempts_left: 2 }, error: 'x' })
		await render()
		await openConfirm(tree)
		await accept(tree)
		act(() => { modals(tree)[0].props.onDismiss() })
		await settle()

		expect(modals(tree)).toHaveLength(0)
		expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('no coinciden'), { description: 'Te quedan 2 intentos.' })
	})
})
