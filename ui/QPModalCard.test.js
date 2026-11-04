/**
 * QPModalCard — la tarjeta centrada de los modales: pinta `modalCard` (surface) y declara
 * ese tono hacia dentro, así que un campo alojado se hunde a `background`.
 * @jest-environment node
 */
jest.mock('../theme/ThemeContext', () => {
	const { createTheme } = jest.requireActual('../theme/themeTokens')
	return { createTheme, useTheme: () => ({ theme: createTheme(true) }) }
})

import { Pressable, StyleSheet, Text } from 'react-native'
import { act, create } from 'react-test-renderer'
import QPModalCard from './QPModalCard'
import { useFieldFill } from './SurfaceContext'
import { createTheme } from '../theme/themeTokens'

const theme = createTheme(true)
const PressableType = Pressable.type || Pressable

const Probe = () => <Text testID="probe">{useFieldFill()}</Text>

const render = async (element) => {
	let tree
	await act(async () => { tree = create(element) })
	return tree
}

test('paints the modal card surface and forwards style and testID', async () => {
	const tree = await render(<QPModalCard style={{ maxHeight: 300 }} testID="card"><Probe /></QPModalCard>)
	const card = tree.root.findByType(PressableType)
	const style = StyleSheet.flatten(card.props.style)
	expect(style.backgroundColor).toBe(theme.colors.surface)
	expect(style.maxHeight).toBe(300)
	expect(card.props.testID).toBe('card')
})

test('a field inside the card sinks to the page background', async () => {
	const tree = await render(<QPModalCard><Probe /></QPModalCard>)
	expect(tree.root.findByProps({ testID: 'probe' }).props.children).toBe(theme.colors.background)
})

test('swallows the press by default so the backdrop never gets it', async () => {
	const tree = await render(<QPModalCard><Probe /></QPModalCard>)
	const card = tree.root.findByType(PressableType)
	expect(typeof card.props.onPress).toBe('function')
	expect(() => card.props.onPress()).not.toThrow()
})
