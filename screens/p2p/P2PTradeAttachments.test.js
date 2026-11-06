/**
 * Render tests for the trade proofs section: when it shows, what a row reveals and the
 * anti-fraud line — node environment with the icon/particle collaborators mocked.
 * @jest-environment node
 */
jest.mock('@react-native-vector-icons/fontawesome6', () => 'FontAwesome6')
jest.mock('../../ui/particles/QPButton', () => 'QPButton')
jest.mock('../../ui/particles/QPPressable', () => {
	const { Pressable } = require('react-native')
	return Pressable
})
jest.mock('../../helpers', () => ({ timeAgo: () => 'hace 5 min' }))

import React from 'react'
import { act, create } from 'react-test-renderer'
import { createTheme } from '../../theme/themeTokens'
import { createTextStyles, createContainerStyles } from '../../theme/themeUtils'
import P2PTradeAttachments from './P2PTradeAttachments'

const theme = createTheme(true)

const MINE = { uuid: 'a', kind: 'pdf', mime: 'application/pdf', size: 245120, mine: true, created_at: '2026-11-06T10:00:00Z' }
const THEIRS = { uuid: 'b', kind: 'image', mime: 'image/jpeg', size: 2048, mine: false, created_at: '2026-11-06T10:00:00Z' }

const render = (props) => {
	let tree
	act(() => {
		tree = create(
			<P2PTradeAttachments
				attachments={[]}
				canUpload={false}
				isPayer={false}
				isReceiver={false}
				proofReplaces={false}
				uploading={false}
				openingUuid={null}
				onPickImage={() => { }}
				onPickPdf={() => { }}
				onOpen={() => { }}
				theme={theme}
				textStyles={createTextStyles(theme)}
				containerStyles={createContainerStyles(theme)}
				{...props}
			/>
		)
	})
	return tree
}

const dump = (tree) => JSON.stringify(tree.toJSON())

describe('P2PTradeAttachments', () => {
	test('renders nothing with no proofs and nothing to upload', () => {
		expect(render({}).toJSON()).toBeNull()
	})

	test('offers both pickers while the trade accepts proofs', () => {
		const tree = render({ canUpload: true, isPayer: true })
		const buttons = tree.root.findAllByType('QPButton')
		expect(buttons.map(button => button.props.title)).toEqual(['Foto', 'PDF'])
	})

	test('hides the pickers once the trade no longer accepts proofs, keeping the list', () => {
		const tree = render({ attachments: [MINE] })
		expect(tree.root.findAllByType('QPButton')).toHaveLength(0)
		expect(dump(tree)).toContain('Comprobante 1')
	})

	test('tells the payer a proof is enough only when the server allows it', () => {
		expect(dump(render({ canUpload: true, isPayer: true, proofReplaces: true }))).toContain('con un comprobante basta')
		expect(dump(render({ canUpload: true, isPayer: true, proofReplaces: false }))).not.toContain('con un comprobante basta')
		expect(dump(render({ canUpload: true, isReceiver: true, proofReplaces: true }))).not.toContain('con un comprobante basta')
	})

	test('says whose each proof is', () => {
		const out = dump(render({ attachments: [MINE, THEIRS] }))
		expect(out).toContain('Tuyo')
		expect(out).toContain('De la contraparte')
	})

	// El comprobante falso es la estafa clásica del P2P
	test('warns the receiver next to a proof from the counterparty', () => {
		const warning = 'no por capturas ni promesas'
		expect(dump(render({ attachments: [THEIRS], isReceiver: true }))).toContain(warning)
		expect(dump(render({ attachments: [MINE], isReceiver: true }))).not.toContain(warning)
		expect(dump(render({ attachments: [THEIRS], isPayer: true }))).not.toContain(warning)
	})

	test('opens the tapped proof', () => {
		const onOpen = jest.fn()
		const tree = render({ attachments: [MINE, THEIRS], onOpen })
		act(() => { tree.root.findByProps({ accessibilityLabel: 'Abrir comprobante 2' }).props.onPress() })
		expect(onOpen).toHaveBeenCalledWith(THEIRS)
	})
})
