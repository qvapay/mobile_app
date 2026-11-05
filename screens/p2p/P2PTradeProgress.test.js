/**
 * Render tests for the trade-room status card: which statuses render it, the
 * viewer-perspective summary (payer sends / receiver awaits), the vertical
 * timeline, the receiver safety line, the expiry notice and the TX-id gate
 * helper — node environment with the icon/particle collaborators mocked (see
 * P2PCreate.test.js). The live countdown lives in P2PHeaderTimer (own tests);
 * the copy per role and status, in p2pTradeRoom.test.js.
 * @jest-environment node
 */
jest.mock('@react-native-vector-icons/fontawesome6', () => 'FontAwesome6')
jest.mock('../../ui/particles/QPCoin', () => 'QPCoin')
jest.mock('../../ui/particles/QPInput', () => 'QPInput')

import React from 'react'
import { act, create } from 'react-test-renderer'
import { createTheme } from '../../theme/themeTokens'
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
				counterparty={{ username: 'peer' }}
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
	test('the payer sees what they send, what they get and the rate', () => {
		const tree = renderProgress({ status: 'processing', isPayer: true })
		const out = dump(tree)
		expect(out).toContain('Envías')
		expect(out).toContain('3900')
		expect(out).toContain('Recibirás')
		expect(out).toContain('10.00')
		expect(out).toContain('Tasa')
		expect(out).toContain('390.00')
	})

	test('the receiver sees what they await, what they release and, once paid, the safety line', () => {
		const out = dump(renderProgress({ status: 'paid', isReceiver: true }))
		expect(out).toContain('Recibirás')
		expect(out).toContain('Liberarás')
		expect(out).toContain('Libera solo si el pago ya está en tu cuenta')
	})

	test('the safety line waits for the offer to be marked as paid', () => {
		const out = dump(renderProgress({ status: 'processing', isReceiver: true }))
		expect(out).not.toContain('Libera solo si el pago ya está en tu cuenta')
	})

	test('completed flips the verbs to past tense', () => {
		const out = dump(renderProgress({ status: 'completed', isPayer: true }))
		expect(out).toContain('Enviaste')
		expect(out).toContain('Recibiste')
		expect(out).not.toContain('Envías')
	})

	test('an offer without amount hides the rate instead of dividing by zero', () => {
		const out = dump(renderProgress({ status: 'processing', isPayer: true, p2p: { ...OFFER, amount: '0' } }))
		expect(out).not.toContain('Tasa')
	})
})

describe('timeline', () => {
	test('names the counterparty in the steps', () => {
		const out = dump(renderProgress({ status: 'processing', isPayer: true }))
		expect(out).toContain('Realiza el pago')
		expect(out).toContain('a @peer con los datos de pago')
	})

	test('falls back to a generic counterparty without a username', () => {
		const out = dump(renderProgress({ status: 'processing', isPayer: true, counterparty: null }))
		expect(out).toContain('a tu contraparte con los datos de pago')
	})

	test('pending steps show their number and done steps a check', () => {
		const processing = renderProgress({ status: 'processing', isPayer: true })
		expect(processing.root.findAllByType('FontAwesome6').filter(icon => icon.props.name === 'check')).toHaveLength(0)
		const completed = renderProgress({ status: 'completed', isPayer: true })
		expect(completed.root.findAllByType('FontAwesome6').filter(icon => icon.props.name === 'check')).toHaveLength(3)
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
