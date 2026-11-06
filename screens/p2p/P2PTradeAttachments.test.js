/**
 * Render tests for the trade proofs: only the fiat payer attaches, with two icons, and a
 * receiver sees nothing until there is something to open. Node environment with the
 * icon/particle collaborators mocked.
 * @jest-environment node
 */
jest.mock('@react-native-vector-icons/fontawesome6', () => 'FontAwesome6')
jest.mock('../../ui/particles/QPPressable', () => {
	const { Pressable } = require('react-native')
	return Pressable
})
jest.mock('../../helpers', () => ({ timeAgo: () => 'hace 5 min' }))
jest.mock('../../ui/SurfaceContext', () => ({ SurfaceHost: ({ children }) => children, useFieldFill: () => '#000000' }))

import React from 'react'
import { act, create } from 'react-test-renderer'
import { createTheme } from '../../theme/themeTokens'
import { createTextStyles, createContainerStyles } from '../../theme/themeUtils'
import P2PTradeAttachments, { P2PProofPickers, P2PProofRows } from './P2PTradeAttachments'

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
				isReceiver={false}
				status="paid"
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

const textStyles = createTextStyles(theme)

const renderPickers = (props) => {
	let tree
	act(() => {
		tree = create(<P2PProofPickers uploading={false} onPickImage={() => { }} onPickPdf={() => { }} theme={theme} {...props} />)
	})
	return tree
}

describe('P2PTradeAttachments', () => {
	test('takes no space with nothing to open and nothing to upload, which is the usual receiver', () => {
		expect(render({ isReceiver: true }).toJSON()).toBeNull()
	})

	test('lets the payer attach from a compact header, without a hint or wide buttons', () => {
		const tree = render({ canUpload: true })
		expect(tree.root.findByProps({ accessibilityLabel: 'Adjuntar foto' })).toBeTruthy()
		expect(tree.root.findByProps({ accessibilityLabel: 'Adjuntar PDF' })).toBeTruthy()
		expect(dump(tree)).not.toContain('Solo lo ven')
	})

	test('a receiver gets the list without the pickers', () => {
		const tree = render({ attachments: [THEIRS], isReceiver: true })
		expect(tree.root.findAllByProps({ accessibilityLabel: 'Adjuntar foto' })).toHaveLength(0)
		expect(dump(tree)).toContain('Imagen')
	})

	test('says whose each proof is', () => {
		const out = dump(render({ attachments: [MINE, THEIRS] }))
		expect(out).toContain('Tuyo')
		expect(out).toContain('De la contraparte')
	})

	// En `paid` el aviso ya sale en la línea de tiempo: dos iguales son ruido
	test('warns the receiver only where the timeline does not', () => {
		const warning = 'no por capturas ni promesas'
		expect(dump(render({ attachments: [THEIRS], isReceiver: true, status: 'revision' }))).toContain(warning)
		expect(dump(render({ attachments: [THEIRS], isReceiver: true, status: 'paid' }))).not.toContain(warning)
		expect(dump(render({ attachments: [MINE], isReceiver: true, status: 'revision' }))).not.toContain(warning)
	})

	test('opens the tapped proof', () => {
		const onOpen = jest.fn()
		let tree
		act(() => {
			tree = create(<P2PProofRows attachments={[MINE, THEIRS]} openingUuid={null} onOpen={onOpen} theme={theme} textStyles={textStyles} />)
		})
		act(() => { tree.root.findByProps({ accessibilityLabel: 'Abrir comprobante 2' }).props.onPress() })
		expect(onOpen).toHaveBeenCalledWith(THEIRS)
	})
})

describe('P2PProofPickers', () => {
	test('launches each picker from its icon', () => {
		const onPickImage = jest.fn()
		const onPickPdf = jest.fn()
		const tree = renderPickers({ onPickImage, onPickPdf })
		act(() => { tree.root.findByProps({ accessibilityLabel: 'Adjuntar foto' }).props.onPress() })
		act(() => { tree.root.findByProps({ accessibilityLabel: 'Adjuntar PDF' }).props.onPress() })
		expect(onPickImage).toHaveBeenCalledTimes(1)
		expect(onPickPdf).toHaveBeenCalledTimes(1)
	})

	test('blocks both icons while uploading', () => {
		const tree = renderPickers({ uploading: true })
		expect(tree.root.findByProps({ accessibilityLabel: 'Adjuntar foto' }).props.disabled).toBe(true)
		expect(tree.root.findByProps({ accessibilityLabel: 'Adjuntar PDF' }).props.disabled).toBe(true)
	})
})
