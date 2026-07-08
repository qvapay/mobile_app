/**
 * Render tests for FaceIDIcon — hand-traced Face ID glyph over react-native-svg.
 * @jest-environment node
 */
jest.mock('react-native-svg', () => ({ __esModule: true, default: 'Svg', Path: 'Path' }))

import { act, create } from 'react-test-renderer'
import FaceIDIcon from './FaceIDIcon'

const render = async (props) => {
	let tree
	await act(async () => { tree = create(<FaceIDIcon {...props} />) })
	return tree
}

describe('FaceIDIcon', () => {

	test('renders the 8 glyph strokes inside a 24x24 viewBox', async () => {
		const tree = await render()
		const svg = tree.root.findByType('Svg')
		expect(svg.props.viewBox).toBe('0 0 24 24')
		expect(tree.root.findAllByType('Path')).toHaveLength(8)
	})

	test('defaults to a 24px square with black strokes', async () => {
		const tree = await render()
		const svg = tree.root.findByType('Svg')
		expect(svg.props.width).toBe(24)
		expect(svg.props.height).toBe(24)
		tree.root.findAllByType('Path').forEach(path => {
			expect(path.props.stroke).toBe('#000')
		})
	})

	test('size prop scales width and height together', async () => {
		const tree = await render({ size: 48 })
		const svg = tree.root.findByType('Svg')
		expect(svg.props.width).toBe(48)
		expect(svg.props.height).toBe(48)
	})

	test('color prop propagates to every stroke', async () => {
		const tree = await render({ color: '#6759EF' })
		tree.root.findAllByType('Path').forEach(path => {
			expect(path.props.stroke).toBe('#6759EF')
		})
	})
})
