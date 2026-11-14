/**
 * Importar / restaurar. Con una wallet en `recovery` (sus llaves no se pueden usar aquí) la
 * misma pantalla restaura, y solo con la frase de ESA wallet: escribirla pisa la seed que
 * hay, y con otra frase se perdería una wallet que quizá solo falla ahora.
 * @jest-environment node
 */
jest.mock('../../../theme/ThemeContext', () => {
	const { createTheme } = jest.requireActual('../../../theme/themeTokens')
	return { useTheme: () => ({ theme: createTheme(true) }) }
})
jest.mock('sonner-native', () => ({ toast: { error: jest.fn(), success: jest.fn() } }))
jest.mock('../../../wallet/WalletContext', () => ({ useWallet: jest.fn() }))
jest.mock('../../../auth/AuthContext', () => ({ useAuth: () => ({ isAuthenticated: true }) }))
jest.mock('../../../hooks/useSecureScreen', () => ({ __esModule: true, default: jest.fn() }))
jest.mock('../../../ui/QPSecureView', () => 'QPSecureView')
jest.mock('../../../ui/particles/QPButton', () => 'QPButton')
jest.mock('../../../ui/QPKeyboardAvoidingView', () => 'QPKeyboardAvoidingView')
jest.mock('./finishWalletSetup', () => ({ finishWalletSetup: jest.fn() }))

import React from 'react'
import { act, create } from 'react-test-renderer'
import { toast } from 'sonner-native'
import { useWallet } from '../../../wallet/WalletContext'
import { finishWalletSetup } from './finishWalletSetup'
import WalletImport from './WalletImport'

const PHRASE = 'legal winner thank year wave sausage worth useful legal winner thank yellow'
const ADDRESSES = { evm: '0xAbC0000000000000000000000000000000000001', tron: 'T1', btc: 'bc1q1', stx: 'SP1', stxPublicKey: '02aa', sol: 'So1' }
const importWallet = jest.fn()
const restoreWallet = jest.fn()
const navigation = { popToTop: jest.fn(), reset: jest.fn() }

let tree
const render = async () => { await act(async () => { tree = create(<WalletImport navigation={navigation} route={{}} />) }) }
const input = () => tree.root.find(node => node.props.testID === 'wallet-import-input' && typeof node.props.onChangeText === 'function')
const submit = () => tree.root.find(node => node.type === 'QPButton' && node.props.testID === 'wallet-import-submit')
const texts = () => tree.root.findAll(node => typeof node.props.children === 'string').map(node => node.props.children)
const type = (value) => act(() => { input().props.onChangeText(value) })
const press = () => act(async () => { await submit().props.onPress() })

beforeEach(() => {
	jest.clearAllMocks()
	useWallet.mockReturnValue({ importWallet, restoreWallet, recovery: null })
})
afterEach(() => { act(() => { tree?.unmount() }) })

describe('importar (sin wallet en el teléfono)', () => {
	test('una frase válida se importa y cierra el alta', async () => {
		importWallet.mockResolvedValue(true)
		await render()
		expect(texts()).toContain('Importar wallet')
		type(PHRASE)
		await press()
		expect(importWallet).toHaveBeenCalledWith(PHRASE)
		expect(restoreWallet).not.toHaveBeenCalled()
		expect(finishWalletSetup).toHaveBeenCalledWith(navigation, true)
	})

	test('si no se pudo guardar (p. ej. ya había una seed), lo dice y no avanza', async () => {
		importWallet.mockResolvedValue(false)
		await render()
		type(PHRASE)
		await press()
		expect(toast.error).toHaveBeenCalledWith('No se pudo importar la wallet.')
		expect(finishWalletSetup).not.toHaveBeenCalled()
	})

	test('con una frase inválida el botón ni responde', async () => {
		await render()
		type('doce palabras que no son una frase de verdad para nada aqui ya')
		expect(submit().props.disabled).toBe(true)
		await press()
		expect(importWallet).not.toHaveBeenCalled()
	})
})

describe('restaurar (wallet en recovery)', () => {
	beforeEach(() => { useWallet.mockReturnValue({ importWallet, restoreWallet, recovery: { addresses: ADDRESSES, reason: 'unreadable' } }) })

	test('la pantalla lo dice y usa restoreWallet, nunca importWallet', async () => {
		restoreWallet.mockResolvedValue('ok')
		await render()
		expect(texts()).toContain('Restaurar wallet')
		expect(submit().props.title).toBe('Restaurar')
		type(PHRASE)
		await press()
		expect(restoreWallet).toHaveBeenCalledWith(PHRASE)
		expect(importWallet).not.toHaveBeenCalled()
		expect(toast.success).toHaveBeenCalledWith('Wallet restaurada')
		expect(finishWalletSetup).toHaveBeenCalledWith(navigation, true)
	})

	test.each([
		['mismatch', 'Esa frase es de otra wallet. Revisa que sea la de esta.'],
		['unverifiable', 'No podemos comprobar que esa frase sea la de esta wallet.'],
		['failed', 'No se pudo importar la wallet.'],
	])('%s: lo dice y no avanza', async (result, message) => {
		restoreWallet.mockResolvedValue(result)
		await render()
		type(PHRASE)
		await press()
		expect(toast.error).toHaveBeenCalledWith(message)
		expect(finishWalletSetup).not.toHaveBeenCalled()
	})

	// Restaurar bien quita `recovery` del contexto: la pantalla no debe pasar a «importar» a medias
	test('sigue siendo «restaurar» aunque el contexto deje de estar en recovery', async () => {
		await render()
		useWallet.mockReturnValue({ importWallet, restoreWallet, recovery: null })
		act(() => { tree.update(<WalletImport navigation={navigation} route={{}} />) })
		expect(texts()).toContain('Restaurar wallet')
	})
})
