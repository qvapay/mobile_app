/**
 * Alta de wallet: sin PIN de bloqueo no se crea ni se importa NADA, con cuenta o sin ella.
 * Ese PIN es el gate para leer la seed; antes solo se pedía en el alta sin cuenta, y una
 * wallet creada con cuenta nacía sin él: quien tuviera el teléfono desbloqueado podía
 * ponerle el suyo y ver la frase.
 * @jest-environment node
 */
jest.mock('../../../theme/ThemeContext', () => {
	const { createTheme } = jest.requireActual('../../../theme/themeTokens')
	return { useTheme: () => ({ theme: createTheme(true) }) }
})
jest.mock('../../../api/client', () => ({ hasAppLockPin: jest.fn() }))
jest.mock('./components/WalletPinSetup', () => 'WalletPinSetup')
jest.mock('../../../ui/particles/QPButton', () => 'QPButton')
jest.mock('@react-native-vector-icons/fontawesome6', () => 'FontAwesome6')

import React from 'react'
import { act, create } from 'react-test-renderer'
import { hasAppLockPin } from '../../../api/client'
import { ROUTES } from '../../../routes'
import WalletOnboarding from './WalletOnboarding'

let tree
let navigation
const render = async (params) => {
	navigation = { replace: jest.fn(), navigate: jest.fn(), goBack: jest.fn() }
	await act(async () => { tree = create(<WalletOnboarding navigation={navigation} route={{ params }} />) })
}
const button = (testID) => tree.root.find(node => node.type === 'QPButton' && node.props.testID === testID)
const pinSetup = () => tree.root.findAll(node => node.type === 'WalletPinSetup')
const press = (testID) => act(async () => { button(testID).props.onPress() })

afterEach(() => { act(() => { tree?.unmount() }) })

describe.each([
	['con cuenta', undefined],
	['sin cuenta (modo wallet)', { guest: true }],
])('%s', (_label, params) => {

	test('sin PIN, crear pide antes el PIN y solo después abre el backup', async () => {
		hasAppLockPin.mockResolvedValue(false)
		await render(params)
		await press('wallet-onboarding-create')
		expect(navigation.replace).not.toHaveBeenCalled()
		expect(pinSetup()).toHaveLength(1)

		await act(async () => { pinSetup()[0].props.onDone() })
		expect(navigation.replace).toHaveBeenCalledWith(ROUTES.WALLET_BACKUP)
	})

	test('sin PIN, importar también lo pide antes', async () => {
		hasAppLockPin.mockResolvedValue(false)
		await render(params)
		await press('wallet-onboarding-import')
		expect(navigation.replace).not.toHaveBeenCalled()
		await act(async () => { pinSetup()[0].props.onDone() })
		expect(navigation.replace).toHaveBeenCalledWith(ROUTES.WALLET_IMPORT)
	})

	test('con PIN, crear e importar siguen directo', async () => {
		hasAppLockPin.mockResolvedValue(true)
		await render(params)
		await press('wallet-onboarding-create')
		expect(navigation.replace).toHaveBeenCalledWith(ROUTES.WALLET_BACKUP)
		expect(pinSetup()).toHaveLength(0)
	})

	test('mientras no se sabe si hay PIN, los botones esperan (no se cuela un alta sin PIN)', async () => {
		let resolvePin
		hasAppLockPin.mockReturnValue(new Promise(resolve => { resolvePin = resolve }))
		await render(params)
		expect(button('wallet-onboarding-create').props.disabled).toBe(true)
		expect(button('wallet-onboarding-import').props.disabled).toBe(true)
		await act(async () => { resolvePin(false) })
		expect(button('wallet-onboarding-create').props.disabled).toBe(false)
	})

	test('si no se puede leer el Keychain se asume que NO hay PIN: se pide', async () => {
		hasAppLockPin.mockRejectedValue(new Error('keychain'))
		await render(params)
		await press('wallet-onboarding-create')
		expect(navigation.replace).not.toHaveBeenCalled()
		expect(pinSetup()).toHaveLength(1)
	})
})
