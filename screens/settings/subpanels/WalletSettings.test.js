/**
 * Ajustes → Mi wallet, las dos cosas que tocó la auditoría:
 *
 * - Eliminar solo se da por hecho si el Keychain confirma que la seed ya no está. Antes la
 *   pantalla decía «eliminada» aunque el borrado fallara, y la seed se quedaba en el
 *   teléfono sin metadata y sin que nadie lo supiera.
 * - Una wallet cuyas llaves no se pueden leer (`recovery`) se puede eliminar, pero tras la
 *   prueba de dueño del dispositivo: ahí el PIN no sirve de gate.
 * @jest-environment node
 */
jest.mock('../../../theme/ThemeContext', () => {
	const { createTheme } = jest.requireActual('../../../theme/themeTokens')
	return { useTheme: () => ({ theme: createTheme(true) }) }
})
jest.mock('sonner-native', () => ({ toast: { error: jest.fn(), success: jest.fn() } }))
jest.mock('../../../helpers', () => ({ copyTextToClipboard: jest.fn() }))
jest.mock('@react-native-vector-icons/fontawesome6', () => 'FontAwesome6')
jest.mock('@react-navigation/native', () => ({ useNavigation: jest.fn(), useNavigationState: selector => selector({ index: 1 }) }))
jest.mock('@tanstack/react-query', () => ({ useQueryClient: jest.fn() }))
jest.mock('../../../wallet/WalletContext', () => ({ useWallet: jest.fn() }))
jest.mock('../../../wallet/keystore', () => ({ disableWalletBiometrics: jest.fn(async () => {}), enableWalletBiometrics: jest.fn(async () => true) }))
jest.mock('../../../api/client', () => ({ getSupportedBiometryType: jest.fn(async () => null) }))
jest.mock('../../../settings/SettingsContext', () => ({ useSettings: () => ({ getSetting: (_group, _key, fallback) => fallback, updateSetting: jest.fn() }) }))
jest.mock('../../../lock/AppLockContext', () => ({ useAppLock: jest.fn() }))
jest.mock('../../../helpers/deviceOwnerProof', () => ({
	confirmDeviceOwner: jest.fn(),
	ownerProofPasses: outcome => outcome === 'success' || outcome === 'unavailable',
}))
jest.mock('../../../hooks/useSecureScreen', () => ({ __esModule: true, default: jest.fn() }))
jest.mock('../../../ui/QPSecureView', () => 'QPSecureView')
jest.mock('../../crypto/wallet/historyCache', () => ({ clearHistoryCaches: jest.fn(async () => {}) }))
jest.mock('../../crypto/wallet/walletDiskCache', () => ({ clearWalletSnapshots: jest.fn(async () => {}) }))
jest.mock('../../../ui/particles/QPButton', () => 'QPButton')
jest.mock('../../../ui/particles/QPPressable', () => 'QPPressable')
jest.mock('../../../ui/particles/QPAddress', () => 'QPAddress')
jest.mock('../../crypto/wallet/components/WalletAuthModal', () => 'WalletAuthModal')
jest.mock('react-native/Libraries/Modal/Modal', () => ({ __esModule: true, default: 'Modal' }))

import React from 'react'
import { act, create } from 'react-test-renderer'
import { toast } from 'sonner-native'
import { useNavigation } from '@react-navigation/native'
import { useQueryClient } from '@tanstack/react-query'
import { useWallet } from '../../../wallet/WalletContext'
import { disableWalletBiometrics } from '../../../wallet/keystore'
import { useAppLock } from '../../../lock/AppLockContext'
import { confirmDeviceOwner } from '../../../helpers/deviceOwnerProof'
import { clearHistoryCaches } from '../../crypto/wallet/historyCache'
import { clearWalletSnapshots } from '../../crypto/wallet/walletDiskCache'
import WalletSettings from './WalletSettings'

const ADDRESSES = { evm: '0xAbC0000000000000000000000000000000000001', tron: 'T1', btc: 'bc1q1', stx: 'SP1', stxPublicKey: '02aa', sol: 'So1' }
const deleteWallet = jest.fn()
const releaseUnusedAppLock = jest.fn(async () => true)
const removeQueries = jest.fn()
const navigation = { goBack: jest.fn(), navigate: jest.fn(), setOptions: jest.fn() }

let tree
const render = async () => { await act(async () => { tree = create(<WalletSettings />) }) }
const byId = (testID) => tree.root.findAll(node => node.props.testID === testID && typeof node.type === 'string')
const button = (testID) => tree.root.find(node => node.type === 'QPButton' && node.props.testID === testID)
const modal = () => tree.root.findByType('Modal')
const texts = () => tree.root.findAll(node => typeof node.props.children === 'string').map(node => node.props.children)

/** Wallet sana: abre el borrado pasando el gate de PIN (el modal de autorización, simulado). */
const openDeleteWithPin = async () => {
	await act(async () => { button('wallet-settings-delete').props.onPress() })
	await act(async () => { await tree.root.findByType('WalletAuthModal').props.onAuthorized() })
}
const acknowledgeAndConfirm = async () => {
	act(() => { tree.root.find(node => node.props.testID === 'wallet-delete-ack' && typeof node.props.onPress === 'function').props.onPress() })
	await act(async () => { await button('wallet-delete-confirm').props.onPress() })
}

beforeEach(() => {
	jest.clearAllMocks()
	useNavigation.mockReturnValue(navigation)
	useQueryClient.mockReturnValue({ removeQueries })
	useAppLock.mockReturnValue({ releaseUnusedAppLock })
	useWallet.mockReturnValue({ hasWallet: true, isBackedUp: true, addresses: ADDRESSES, recovery: null, revealMnemonic: jest.fn(), deleteWallet })
	deleteWallet.mockResolvedValue(true)
})
afterEach(() => { act(() => { tree?.unmount() }) })

describe('eliminar', () => {
	test('confirmado por el Keychain: se limpia todo y se sale', async () => {
		await render()
		await openDeleteWithPin()
		expect(modal().props.visible).toBe(true)
		// Sin reconocer que se tiene la frase no se elimina nada
		await act(async () => { await button('wallet-delete-confirm').props.onPress() })
		expect(deleteWallet).not.toHaveBeenCalled()

		await acknowledgeAndConfirm()
		expect(deleteWallet).toHaveBeenCalledTimes(1)
		expect(disableWalletBiometrics).toHaveBeenCalled()
		expect(releaseUnusedAppLock).toHaveBeenCalled()
		expect(clearHistoryCaches).toHaveBeenCalled()
		expect(clearWalletSnapshots).toHaveBeenCalled()
		expect(toast.success).toHaveBeenCalledWith('Wallet eliminada de este teléfono')
		expect(navigation.goBack).toHaveBeenCalled()
	})

	test('si la seed sigue en el teléfono NO se dice «eliminada» ni se limpia nada más', async () => {
		deleteWallet.mockResolvedValue(false)
		await render()
		await openDeleteWithPin()
		await acknowledgeAndConfirm()
		expect(toast.error).toHaveBeenCalledWith('No se pudo eliminar: la frase sigue en este teléfono. Inténtalo de nuevo.')
		expect(toast.success).not.toHaveBeenCalled()
		// El PIN sigue protegiendo la seed, la biometría también, y los datos no se tocan
		expect(releaseUnusedAppLock).not.toHaveBeenCalled()
		expect(disableWalletBiometrics).not.toHaveBeenCalled()
		expect(clearHistoryCaches).not.toHaveBeenCalled()
		expect(removeQueries).not.toHaveBeenCalled()
		expect(navigation.goBack).not.toHaveBeenCalled()
	})
})

describe('wallet sin llaves (recovery)', () => {
	beforeEach(() => {
		useWallet.mockReturnValue({ hasWallet: false, isBackedUp: false, addresses: null, recovery: { addresses: ADDRESSES, reason: 'unreadable' }, revealMnemonic: jest.fn(), deleteWallet })
	})

	test('no enseña direcciones ni frase: explica y deja eliminarla', async () => {
		await render()
		expect(byId('wallet-settings-recovery')).toHaveLength(1)
		expect(tree.root.findAllByType('QPAddress')).toHaveLength(0)
		expect(texts()).not.toContain('No hay ninguna wallet en este teléfono.')
		expect(tree.root.findAllByType('WalletAuthModal')).toHaveLength(0)
	})

	test('eliminar pide la prueba de dueño del dispositivo; cancelada, no se abre nada', async () => {
		confirmDeviceOwner.mockResolvedValue('cancelled')
		await render()
		await act(async () => { await button('wallet-settings-delete').props.onPress() })
		expect(confirmDeviceOwner).toHaveBeenCalledWith('Confirma que eres tú', 'Vas a eliminar una wallet de este teléfono')
		expect(modal().props.visible).toBe(false)
		expect(toast.error).not.toHaveBeenCalled()
		expect(deleteWallet).not.toHaveBeenCalled()
	})

	test('si el diálogo del sistema no puede salir, tampoco', async () => {
		confirmDeviceOwner.mockResolvedValue('error')
		await render()
		await act(async () => { await button('wallet-settings-delete').props.onPress() })
		expect(modal().props.visible).toBe(false)
		expect(toast.error).toHaveBeenCalledWith('No pudimos confirmar que este teléfono es tuyo. Inténtalo de nuevo.')
	})

	test('pasada la prueba: confirmación con la frase reconocida y borrado', async () => {
		confirmDeviceOwner.mockResolvedValue('success')
		await render()
		await act(async () => { await button('wallet-settings-delete').props.onPress() })
		expect(modal().props.visible).toBe(true)
		await acknowledgeAndConfirm()
		expect(deleteWallet).toHaveBeenCalledTimes(1)
		expect(releaseUnusedAppLock).toHaveBeenCalled()
		expect(navigation.goBack).toHaveBeenCalled()
	})

	test('sin wallet y sin recovery: el aviso de siempre', async () => {
		useWallet.mockReturnValue({ hasWallet: false, isBackedUp: false, addresses: null, recovery: null, revealMnemonic: jest.fn(), deleteWallet })
		await render()
		expect(byId('wallet-settings-recovery')).toHaveLength(0)
		expect(texts()).toContain('No hay ninguna wallet en este teléfono.')
	})
})
