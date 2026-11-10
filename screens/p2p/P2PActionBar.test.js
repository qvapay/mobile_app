/**
 * Render tests for the owner's pause control in the P2P action bar and the notice
 * that replaces the search animation — node environment with the real dark theme.
 * @jest-environment node
 */
jest.mock('@react-native-vector-icons/fontawesome6', () => 'FontAwesome6')
jest.mock('../../ui/particles/QPButton', () => 'QPButton')
jest.mock('../../ui/particles/QPPressable', () => 'QPPressable')
jest.mock('../../ui/particles/QPRate', () => 'QPRate')

import React from 'react'
import { act, create } from 'react-test-renderer'
import { createTheme } from '../../theme/themeTokens'
import P2PActionBar from './P2PActionBar'
import P2PPausedNotice from './P2PPausedNotice'

const theme = createTheme(true)
const textStyles = { h5: {}, h6: {}, h7: {} }
const containerStyles = { bottomButtonContainer: {} }
const noop = () => { }

const LOADING = { apply: false, cancel: false, received: false, markPaid: false, rate: false, pause: false }

const renderBar = (props) => {
	let tree
	act(() => {
		tree = create(
			<P2PActionBar
				p2p={{ status: 'open' }}
				isOwner
				isPayer={false}
				isReceiver={false}
				canApply={false}
				canCancel
				canMarkPaid={false}
				canConfirmReceived={false}
				canRatePeer={false}
				loading={LOADING}
				markPaidReady={false}
				onApply={noop}
				onCancel={noop}
				onMarkPaid={noop}
				onConfirmReceived={noop}
				onEdit={noop}
				onShare={noop}
				onRate={noop}
				keyboardVisible={false}
				insets={{ top: 0, bottom: 0, left: 0, right: 0 }}
				theme={theme}
				textStyles={textStyles}
				containerStyles={containerStyles}
				{...props}
			/>,
		)
	})
	return tree
}

const toggle = (tree) => tree.root.findAll(n => n.props.testID === 'p2p-pause-toggle' && n.type === 'QPButton')[0]

describe('owner of an open offer', () => {
	test('a live offer offers «Pausar», on the free slot next to edit and share', () => {
		const onTogglePause = jest.fn()
		const tree = renderBar({ onTogglePause })
		const button = toggle(tree)
		expect(button.props.title).toBe('Pausar')
		expect(button.props.icon).toBe('pause')
		button.props.onPress()
		expect(onTogglePause).toHaveBeenCalledTimes(1)
		// X · Pausar · editar · compartir
		expect(tree.root.findAllByType('QPButton')).toHaveLength(4)
	})

	test('a paused offer offers «Reactivar», still editable and shareable', () => {
		const tree = renderBar({ paused: true })
		expect(toggle(tree).props.title).toBe('Reactivar')
		expect(toggle(tree).props.icon).toBe('play')
		expect(tree.root.findAllByType('QPButton')).toHaveLength(4)
	})

	test('the button spins while the request is in flight', () => {
		const tree = renderBar({ loading: { ...LOADING, pause: true } })
		expect(toggle(tree).props.loading).toBe(true)
	})
})

test('no pause control once the offer stops being open, or for someone else', () => {
	expect(toggle(renderBar({ p2p: { status: 'processing' } }))).toBeUndefined()
	expect(toggle(renderBar({ isOwner: false, canCancel: false }))).toBeUndefined()
})

test('whoever is not the owner reads why there is nothing to tap', () => {
	const tree = renderBar({ isOwner: false, canCancel: false, pausedLocked: true })
	expect(JSON.stringify(tree.toJSON())).toContain('El dueño pausó esta oferta')
	expect(tree.root.findAllByType('QPButton')).toHaveLength(0)
})

describe('P2PPausedNotice', () => {
	const renderNotice = (props) => {
		let tree
		act(() => { tree = create(<P2PPausedNotice pause={{ reason: 'owner', until: null }} theme={theme} textStyles={textStyles} {...props} />) })
		return JSON.stringify(tree.toJSON())
	}

	test('a pause by the owner lasts until it is resumed', () => {
		const out = renderNotice()
		expect(out).toContain('Oferta en pausa')
		expect(out).toContain('hasta que la reactives')
		expect(out).not.toContain('órdenes en curso')
	})

	test('the automatic pause tells when the offer comes back', () => {
		const until = '2026-11-09T20:10:00.000Z'
		const time = new Date(until).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
		const out = renderNotice({ pause: { reason: 'taker_left', until } })
		expect(out).toContain('Quien la tomó se fue')
		expect(out).toContain(time)
	})

	test('a range offer with live orders says they carry on', () => {
		expect(renderNotice({ hasLiveOrders: true })).toContain('Las órdenes en curso siguen normalmente')
	})
})
