/**
 * Alta de wallet: sin PIN de bloqueo no se crea ni se importa NADA, con cuenta o sin ella.
 * Ese PIN es el gate para leer la seed; antes solo se pedía en el alta sin cuenta, y una
 * wallet creada con cuenta nacía sin él: quien tuviera el teléfono desbloqueado podía
 * ponerle el suyo y ver la frase.
 *
 * Y con una wallet cuyas llaves no se pueden usar en este teléfono (`recovery`), la pantalla
 * no ofrece crear ni importar otra encima: se restaura, se reintenta o se elimina.
 * @jest-environment node
 */
jest.mock('../../../theme/ThemeContext', () => {
	const { createTheme } = jest.requireActual('../../../theme/themeTokens')
	return { useTheme: () => ({ theme: createTheme(true) }) }
})
jest.mock('../../../api/client', () => ({ appLockPinStatus: jest.fn() }))
jest.mock('../../../wallet/WalletContext', () => ({ useWallet: jest.fn() }))
jest.mock('../../../auth/AuthContext', () => ({ useAuth: jest.fn() }))
jest.mock('./finishWalletSetup', () => ({ finishWalletSetup: jest.fn() }))
jest.mock('sonner-native', () => ({ toast: { error: jest.fn(), success: jest.fn() } }))
jest.mock('./components/WalletPinSetup', () => 'WalletPinSetup')
jest.mock('../../../ui/particles/QPButton', () => 'QPButton')
jest.mock('../../../ui/particles/QPPressable', () => 'QPPressable')
jest.mock('../../../ui/particles/QPAddress', () => 'QPAddress')
jest.mock('@react-native-vector-icons/fontawesome6', () => 'FontAwesome6')

import React from 'react'
import { act, create } from 'react-test-renderer'
import { toast } from 'sonner-native'
import { appLockPinStatus } from '../../../api/client'
import { useWallet } from '../../../wallet/WalletContext'
import { useAuth } from '../../../auth/AuthContext'
import { finishWalletSetup } from './finishWalletSetup'
import { ROUTES } from '../../../routes'
import WalletOnboarding from './WalletOnboarding'

const recheckKeys = jest.fn()
const ADDRESSES = { evm: '0xAbC0000000000000000000000000000000000001', tron: 'T1', btc: 'bc1q1', stx: 'SP1', stxPublicKey: '02aa', sol: 'So1' }

let tree
let navigation
const render = async (params) => {
	navigation = { replace: jest.fn(), navigate: jest.fn(), goBack: jest.fn() }
	await act(async () => { tree = create(<WalletOnboarding navigation={navigation} route={{ params }} />) })
}
const button = (testID) => tree.root.find(node => node.type === 'QPButton' && node.props.testID === testID)
const pinSetup = () => tree.root.findAll(node => node.type === 'WalletPinSetup')
const press = (testID) => act(async () => { button(testID).props.onPress() })

beforeEach(() => {
	jest.clearAllMocks()
	useWallet.mockReturnValue({ recovery: null, recheckKeys })
	useAuth.mockReturnValue({ isAuthenticated: true })
})
afterEach(() => { act(() => { tree?.unmount() }) })

describe.each([
	['con cuenta', undefined],
	['sin cuenta (modo wallet)', { guest: true }],
])('%s', (_label, params) => {

	test('sin PIN, crear pide antes el PIN y solo después abre el backup', async () => {
		appLockPinStatus.mockResolvedValue('none')
		await render(params)
		await press('wallet-onboarding-create')
		expect(navigation.replace).not.toHaveBeenCalled()
		expect(pinSetup()).toHaveLength(1)
		// Aún no hay wallet: no hace falta avisar de ninguna prueba de dueño
		expect(pinSetup()[0].props.ownerProof).toBe(false)

		await act(async () => { pinSetup()[0].props.onDone() })
		expect(navigation.replace).toHaveBeenCalledWith(ROUTES.WALLET_BACKUP)
	})

	test('sin PIN, importar también lo pide antes', async () => {
		appLockPinStatus.mockResolvedValue('none')
		await render(params)
		await press('wallet-onboarding-import')
		expect(navigation.replace).not.toHaveBeenCalled()
		await act(async () => { pinSetup()[0].props.onDone() })
		expect(navigation.replace).toHaveBeenCalledWith(ROUTES.WALLET_IMPORT)
	})

	test('con PIN, crear e importar siguen directo', async () => {
		appLockPinStatus.mockResolvedValue('set')
		await render(params)
		await press('wallet-onboarding-create')
		expect(navigation.replace).toHaveBeenCalledWith(ROUTES.WALLET_BACKUP)
		expect(pinSetup()).toHaveLength(0)
	})

	test('mientras no se sabe si hay PIN, los botones esperan (no se cuela un alta sin PIN)', async () => {
		let resolvePin
		appLockPinStatus.mockReturnValue(new Promise(resolve => { resolvePin = resolve }))
		await render(params)
		expect(button('wallet-onboarding-create').props.disabled).toBe(true)
		expect(button('wallet-onboarding-import').props.disabled).toBe(true)
		await act(async () => { resolvePin('none') })
		expect(button('wallet-onboarding-create').props.disabled).toBe(false)
	})

	test('si no se puede leer el Keychain se asume que NO hay PIN: se pide', async () => {
		appLockPinStatus.mockRejectedValue(new Error('keychain'))
		await render(params)
		await press('wallet-onboarding-create')
		expect(navigation.replace).not.toHaveBeenCalled()
		expect(pinSetup()).toHaveLength(1)
	})

	// Viajó cifrado a otro teléfono, sin su clave: no lo acierta nadie ni protege nada
	test('un PIN que existe pero no se deja leer cuenta como «sin PIN»: se pide uno nuevo', async () => {
		appLockPinStatus.mockResolvedValue('unreadable')
		await render(params)
		await press('wallet-onboarding-create')
		expect(navigation.replace).not.toHaveBeenCalled()
		expect(pinSetup()).toHaveLength(1)
	})
})

// En el teléfono hay una wallet cuyas llaves no se pueden usar (Android copia los datos a un
// teléfono nuevo, no las claves): esta pantalla NO ofrece crear ni importar otra encima
describe('wallet sin llaves (recovery)', () => {
	const pressable = (testID) => tree.root.find(node => node.type === 'QPPressable' && node.props.testID === testID)
	const buttons = () => tree.root.findAll(node => node.type === 'QPButton').map(node => node.props.testID)
	const texts = () => tree.root.findAll(node => typeof node.props.children === 'string').map(node => node.props.children)
	const inRecovery = (recovery) => useWallet.mockReturnValue({ recovery, recheckKeys })

	beforeEach(() => { appLockPinStatus.mockResolvedValue('set') })

	test('ni «crear» ni «importar»: se explica y se ofrece restaurar, reintentar o eliminar', async () => {
		inRecovery({ addresses: ADDRESSES, reason: 'unreadable' })
		await render()
		expect(buttons()).toEqual(['wallet-recovery-restore', 'wallet-recovery-retry'])
		expect(texts()).toContain('Restaura tu wallet')
		expect(tree.root.findByType('QPAddress').props.address).toBe(ADDRESSES.evm)
		expect(pressable('wallet-recovery-remove')).toBeTruthy()
	})

	test('restaurar lleva a escribir la frase', async () => {
		inRecovery({ addresses: ADDRESSES, reason: 'unreadable' })
		await render()
		await press('wallet-recovery-restore')
		expect(navigation.replace).toHaveBeenCalledWith(ROUTES.WALLET_IMPORT)
	})

	test('con el PIN también ilegible, antes se crea uno nuevo, avisando de la prueba de dueño', async () => {
		appLockPinStatus.mockResolvedValue('unreadable')
		inRecovery({ addresses: ADDRESSES, reason: 'unreadable' })
		await render()
		await press('wallet-recovery-restore')
		expect(navigation.replace).not.toHaveBeenCalled()
		expect(pinSetup()).toHaveLength(1)
		// La wallet ya está en el teléfono: crear su PIN pide la huella, la cara o el código
		expect(pinSetup()[0].props.ownerProof).toBe(true)
		await act(async () => { pinSetup()[0].props.onDone() })
		expect(navigation.replace).toHaveBeenCalledWith(ROUTES.WALLET_IMPORT)
	})

	test('sin saber qué wallet es no se ofrece restaurar (no habría con qué comprobar la frase)', async () => {
		inRecovery({ addresses: null, reason: 'unknown' })
		await render()
		expect(buttons()).toEqual(['wallet-recovery-retry'])
		expect(tree.root.findAllByType('QPAddress')).toHaveLength(0)
	})

	test('reintentar: si las llaves vuelven, la wallet ya está', async () => {
		inRecovery({ addresses: ADDRESSES, reason: 'unknown' })
		recheckKeys.mockResolvedValue(true)
		await render({ guest: true })
		await press('wallet-recovery-retry')
		expect(recheckKeys).toHaveBeenCalledTimes(1)
		expect(finishWalletSetup).toHaveBeenCalledWith(navigation, true)
		expect(toast.error).not.toHaveBeenCalled()
	})

	test('reintentar sin suerte: lo dice y no se mueve', async () => {
		inRecovery({ addresses: ADDRESSES, reason: 'unreadable' })
		recheckKeys.mockResolvedValue(false)
		await render()
		await press('wallet-recovery-retry')
		expect(finishWalletSetup).not.toHaveBeenCalled()
		expect(toast.error).toHaveBeenCalledWith('Las llaves siguen sin poder leerse.')
	})

	test('eliminar manda a Mi wallet, donde está el borrado con su confirmación', async () => {
		inRecovery({ addresses: ADDRESSES, reason: 'unreadable' })
		await render()
		act(() => { pressable('wallet-recovery-remove').props.onPress() })
		expect(navigation.navigate).toHaveBeenCalledWith(ROUTES.SETTINGS_STACK, { screen: ROUTES.WALLET_SETTINGS, initial: false })
	})
})
