/**
 * Render tests for the deposit invoice bottom sheet — node environment with
 * QR, icons, particles and clipboard helpers mocked
 * (see keypadAmount.test.js for why node env).
 * @jest-environment node
 */
jest.mock('react-native-safe-area-context', () => {
	const { View } = require('react-native')
	return { SafeAreaView: View }
})
jest.mock('../../ui/particles/QPCoin', () => 'QPCoin')
jest.mock('../../ui/particles/QPButton', () => 'QPButton')
jest.mock('react-native-qrcode-styled', () => 'QRCodeStyled')
jest.mock('@react-native-vector-icons/fontawesome6', () => 'FontAwesome6')
jest.mock('../../helpers', () => {
	const actual = jest.requireActual('../../helpers')
	return { ...actual, copyTextToClipboard: jest.fn() }
})
jest.mock('sonner-native', () => ({ toast: { success: jest.fn() } }))
jest.mock('@react-native-clipboard/clipboard', () => ({ setString: jest.fn() }))
jest.mock('react-native-haptic-feedback', () => ({ trigger: jest.fn() }))

import React from 'react'
import { act, create } from 'react-test-renderer'
import { createTheme } from '../../theme/ThemeContext'
import { createTextStyles } from '../../theme/themeUtils'
import { copyTextToClipboard } from '../../helpers'
import DepositDetailsModal from './DepositDetailsModal'

const theme = createTheme(true)
const textStyles = createTextStyles(theme)

const cryptoInvoice = {
	transaction_uuid: '796a9e71-3d67-4a42-9dc2-02a5d069fa23',
	wallet: 'TEvQ7WSPCbJCKVC7qLo29L6zGJb2VQBRVy',
	coin: 'USDT',
	network: 'TRC20',
	value: '50.00000000',
	price: '1.00',
}

const renderModal = (props = {}) => {
	let tree
	act(() => {
		tree = create(
			<DepositDetailsModal
				visible
				onClose={jest.fn()}
				amount='50'
				selectedCoin={{ logo: 'usdt', network: 'TRC20' }}
				topupData={cryptoInvoice}
				depositStatus='pending'
				countdown={1800}
				sseConnected
				installedWallets={[]}
				onOpenWalletPicker={jest.fn()}
				theme={theme}
				textStyles={textStyles}
				{...props}
			/>
		)
	})
	return tree
}

describe('crypto flow', () => {
	test('renders the QR for the deposit address and the exact crypto total', () => {
		const tree = renderModal()
		expect(tree.root.findByType('QRCodeStyled').props.data).toBe(cryptoInvoice.wallet)
		const out = JSON.stringify(tree.toJSON())
		expect(out).toContain('50.00') // formatCryptoAmount(value)
		expect(out).toContain('USDT')
		expect(out).toContain('TRC20')
		expect(out).toContain('796a9e71') // short tx reference
	})

	test('the copy button copies the FULL address, not the truncated display', () => {
		const tree = renderModal()
		const copyButtons = tree.root.findAll(n => n.props.hitSlop === 8 && typeof n.props.onPress === 'function')
		act(() => { copyButtons[0].props.onPress() })
		expect(copyTextToClipboard).toHaveBeenCalledWith(cryptoInvoice.wallet)
	})

	test('"Abrir en mi wallet" appears only when wallets are installed', () => {
		const withWallets = renderModal({ installedWallets: [{ id: 'trust' }] })
		expect(withWallets.root.findAllByType('QPButton').some(b => b.props.title === 'Abrir en mi wallet')).toBe(true)
		const without = renderModal()
		expect(without.root.findAllByType('QPButton').some(b => b.props.title === 'Abrir en mi wallet')).toBe(false)
	})

	test('bank rails render holder/routing/account rows when present', () => {
		const out = JSON.stringify(renderModal({
			topupData: { ...cryptoInvoice, account_name: 'QvaPay LLC', routing_number: '0210', account_number: '9876' },
		}).toJSON())
		expect(out).toContain('QvaPay LLC')
		expect(out).toContain('0210')
		expect(out).toContain('9876')
	})
})

describe('PayPal flow', () => {
	test('a redirect_url swaps the QR for the PayPal body', () => {
		const tree = renderModal({
			topupData: { transaction_uuid: 'tx-1', redirect_url: 'https://paypal.com/pay/x', coin: 'PAYPAL' },
		})
		expect(tree.root.findAllByType('QRCodeStyled')).toHaveLength(0)
		expect(tree.root.findAllByType('QPButton').some(b => b.props.title === 'Abrir PayPal')).toBe(true)
		expect(JSON.stringify(tree.toJSON())).toContain('Esperando confirmación de pago en PayPal...')
	})
})

describe('status and countdown', () => {
	test('maps each status to its Spanish banner', () => {
		expect(JSON.stringify(renderModal({ depositStatus: 'processing' }).toJSON())).toContain('Pago detectado, procesando...')
		expect(JSON.stringify(renderModal({ depositStatus: 'paid' }).toJSON())).toContain('Pago confirmado')
		expect(JSON.stringify(renderModal({ depositStatus: 'expired' }).toJSON())).toContain('Depósito expirado')
		expect(JSON.stringify(renderModal({ depositStatus: 'failed' }).toJSON())).toContain('Error en el pago')
	})

	test('formats the countdown as MM:SS and shows Expirado at zero', () => {
		expect(JSON.stringify(renderModal({ countdown: 1800 }).toJSON())).toContain('30:00')
		expect(JSON.stringify(renderModal({ countdown: 65 }).toJSON())).toContain('01:05')
		const expired = renderModal({ countdown: 0 })
		const out = JSON.stringify(expired.toJSON())
		expect(out).toContain('Expirado')
		expect(out).toContain('Este depósito ha expirado. Por favor genera uno nuevo.')
	})
})
