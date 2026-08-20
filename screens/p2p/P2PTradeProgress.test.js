/**
 * Render tests for the trade-room progress card: which statuses render it, the
 * viewer-perspective hero verb (payer sends / receiver awaits), the completed
 * state, the receiver safety line, the expiry notice and the TX-id gate helper
 * — node environment with the icon/particle collaborators mocked (see
 * P2PCreate.test.js). The live countdown lives in P2PHeaderTimer (own tests).
 * @jest-environment node
 */
jest.mock('@react-native-vector-icons/fontawesome6', () => 'FontAwesome6')
jest.mock('../../ui/particles/QPCoin', () => 'QPCoin')
jest.mock('../../ui/particles/QPInput', () => 'QPInput')

import React from 'react'
import { act, create } from 'react-test-renderer'
import { createTheme } from '../../theme/ThemeContext'
import { createTextStyles, createContainerStyles } from '../../theme/themeUtils'
import P2PTradeProgress from './P2PTradeProgress'

const theme = createTheme(true)
const textStyles = createTextStyles(theme)
const containerStyles = createContainerStyles(theme)

const OFFER = {
	amount: '10.00',
	receive: '3900',
	Coin: { name: 'BANDEC', logo: 'bandec' },
	updated_at: new Date(Date.now() - 5 * 60000).toISOString(),
}

const renderProgress = (props) => {
	let tree
	act(() => {
		tree = create(
			<P2PTradeProgress
				p2p={OFFER}
				isPayer={false}
				isReceiver={false}
				canMarkPaid={false}
				txIdInput=""
				setTxIdInput={() => { }}
				theme={theme}
				textStyles={textStyles}
				containerStyles={containerStyles}
				{...props}
			/>
		)
	})
	return tree
}

const dump = (tree) => JSON.stringify(tree.toJSON())

describe('render gating', () => {
	test('renders nothing outside the trade room (open/cancelled/revision) or for non-participants', () => {
		expect(renderProgress({ status: 'open', isPayer: true }).toJSON()).toBeNull()
		expect(renderProgress({ status: 'cancelled', isPayer: true }).toJSON()).toBeNull()
		expect(renderProgress({ status: 'revision', isPayer: true }).toJSON()).toBeNull()
		expect(renderProgress({ status: 'processing' }).toJSON()).toBeNull() // observer
	})
})

describe('viewer perspective', () => {
	test('the payer sees "Envías" with the rail amount and the balance they will get', () => {
		const tree = renderProgress({ status: 'processing', isPayer: true })
		const out = dump(tree)
		expect(out).toContain('Envías')
		expect(out).toContain('3900')
		expect(out).toContain('recibirás $10.00 de saldo')
	})

	test('the receiver sees "Recibirás" and, once paid, the release safety line', () => {
		const tree = renderProgress({ status: 'paid', isReceiver: true })
		const out = dump(tree)
		expect(out).toContain('Recibirás')
		expect(out).toContain('liberarás $10.00 de tu saldo')
		expect(out).toContain('Libera solo si el pago ya está en tu cuenta')
	})

	test('completed flips the verbs to past tense', () => {
		const out = dump(renderProgress({ status: 'completed', isPayer: true }))
		expect(out).toContain('Enviaste')
		expect(out).toContain('recibiste $10.00 de saldo')
	})
})

describe('payment window expiry', () => {
	beforeEach(() => { jest.useFakeTimers() })
	afterEach(() => { jest.useRealTimers() })

	test('a live window renders no countdown in the card (it lives in the header)', () => {
		const tree = renderProgress({
			status: 'processing',
			isPayer: true,
			p2p: { ...OFFER, payment_window_expires_at: new Date(Date.now() + 10 * 60000 + 500).toISOString() },
		})
		const out = dump(tree)
		expect(out).not.toContain('10:00')
		expect(out).not.toContain('Ventana de pago expirada')
	})

	test('an expired window surfaces the danger notice', () => {
		const tree = renderProgress({
			status: 'processing',
			isPayer: true,
			p2p: { ...OFFER, payment_window_expires_at: new Date(Date.now() - 1000).toISOString() },
		})
		expect(dump(tree)).toContain('Ventana de pago expirada')
	})

	test('a stale window on a paid offer never reads as expired', () => {
		const tree = renderProgress({
			status: 'paid',
			isReceiver: true,
			p2p: { ...OFFER, payment_window_expires_at: new Date(Date.now() - 1000).toISOString() },
		})
		expect(dump(tree)).not.toContain('Ventana de pago expirada')
	})
})

describe('TX-id gate', () => {
	test('the payer gets the TX-id input with its unlock helper while they can mark paid', () => {
		const tree = renderProgress({ status: 'processing', isPayer: true, canMarkPaid: true })
		expect(tree.root.findAllByType('QPInput')).toHaveLength(1)
		expect(dump(tree)).toContain('habilita «He pagado»')
	})

	test('the receiver never sees the TX-id input', () => {
		const tree = renderProgress({ status: 'paid', isReceiver: true })
		expect(tree.root.findAllByType('QPInput')).toHaveLength(0)
	})
})
