/**
 * Render tests for QPInput — themed text input with prelabel, prefix/suffix
 * icons and the eye/eye-slash password visibility toggle.
 * @jest-environment node
 */
let mockIsDark = true
jest.mock('../../theme/ThemeContext', () => {
	const { createTheme } = jest.requireActual('../../theme/themeTokens')
	return { createTheme, useTheme: () => ({ theme: createTheme(mockIsDark) }) }
})
jest.mock('@react-native-vector-icons/fontawesome6', () => 'FontAwesome6')

import { Pressable, Text, TextInput, StyleSheet } from 'react-native'
import { act, create } from 'react-test-renderer'
import QPInput from './QPInput'
import { SurfaceHost } from '../SurfaceContext'
import { createTheme } from '../../theme/themeTokens'

const theme = createTheme(true)
const lightTheme = createTheme(false)

beforeEach(() => { mockIsDark = true })

// Pressable is a React.memo — findByType needs the inner component
const PressableType = Pressable.type || Pressable

const render = async (props) => {
	let tree
	await act(async () => { tree = create(<QPInput {...props} />) })
	return tree
}

const inputOf = (tree) => tree.root.findByType(TextInput)
// El contenedor del campo es el padre directo del TextInput
const containerStyle = (tree) => StyleSheet.flatten(inputOf(tree).parent.props.style)

describe('QPInput', () => {

	test('renders the muted prelabel above the field', async () => {
		const tree = await render({ prelabel: 'Correo' })
		const label = tree.root.findAllByType(Text)[0]
		expect(label.props.children).toBe('Correo')
		expect(StyleSheet.flatten(label.props.style).color).toBe(theme.colors.secondaryText)
	})

	test('passes unrecognized props through to the TextInput', async () => {
		const tree = await render({ placeholder: 'usuario@qvapay.com', autoCapitalize: 'none' })
		const input = inputOf(tree)
		expect(input.props.placeholder).toBe('usuario@qvapay.com')
		expect(input.props.autoCapitalize).toBe('none')
		expect(input.props.placeholderTextColor).toBe(theme.colors.tertiaryText)
	})

	test('prefix icon renders and removes the left text padding', async () => {
		const tree = await render({ prefixIconName: 'envelope' })
		expect(tree.root.findByType('FontAwesome6').props.name).toBe('envelope')
		expect(StyleSheet.flatten(inputOf(tree).props.style).paddingLeft).toBe(0)
	})

	test('without icons the field keeps its 15px side paddings', async () => {
		const tree = await render({})
		expect(tree.root.findAllByType('FontAwesome6')).toHaveLength(0)
		const style = StyleSheet.flatten(inputOf(tree).props.style)
		expect(style.paddingLeft).toBe(15)
		expect(style.paddingRight).toBe(15)
	})

	test('the eye suffix toggles secureTextEntry on every press', async () => {
		const tree = await render({ secureTextEntry: true, suffixIconName: 'eye' })
		expect(inputOf(tree).props.secureTextEntry).toBe(true)
		const toggle = tree.root.findByType(PressableType)
		await act(async () => { toggle.props.onPress() })
		expect(inputOf(tree).props.secureTextEntry).toBe(false)
		await act(async () => { toggle.props.onPress() })
		expect(inputOf(tree).props.secureTextEntry).toBe(true)
	})

	test('the eye icon follows the visibility on every press (eye = hidden, eye-slash = shown)', async () => {
		const tree = await render({ secureTextEntry: true, suffixIconName: 'eye' })
		const iconName = () => tree.root.findByType('FontAwesome6').props.name
		const toggle = tree.root.findByType(PressableType)
		expect(iconName()).toBe('eye')
		await act(async () => { toggle.props.onPress() })
		expect(iconName()).toBe('eye-slash')
		await act(async () => { toggle.props.onPress() })
		expect(iconName()).toBe('eye')
	})

	test('a non-eye suffix follows prop changes after mount', async () => {
		const tree = await render({ suffixIconName: 'magnifying-glass' })
		await act(async () => { tree.update(<QPInput suffixIconName="circle-check" />) })
		expect(tree.root.findByType('FontAwesome6').props.name).toBe('circle-check')
	})

	test('a non-eye suffix never flips secureTextEntry', async () => {
		const tree = await render({ suffixIconName: 'magnifying-glass' })
		const toggle = tree.root.findByType(PressableType)
		await act(async () => { toggle.props.onPress() })
		expect(inputOf(tree).props.secureTextEntry).toBeUndefined()
	})

	test('on a page the field is surface; inside a surface host it sinks to background', async () => {
		const onPage = await render({})
		expect(containerStyle(onPage).backgroundColor).toBe(theme.colors.surface)
		let tree
		await act(async () => { tree = create(<SurfaceHost tone="surface"><QPInput /></SurfaceHost>) })
		expect(containerStyle(tree).backgroundColor).toBe(theme.colors.background)
	})

	test('focus ring: constant 1pt border, transparent at rest in dark, primary while focused', async () => {
		const tree = await render({ onFocus: undefined })
		expect(containerStyle(tree).borderWidth).toBe(1)
		expect(containerStyle(tree).borderColor).toBe('transparent')
		await act(async () => { inputOf(tree).props.onFocus({}) })
		expect(containerStyle(tree).borderWidth).toBe(1)
		expect(containerStyle(tree).borderColor).toBe(theme.colors.primary)
		await act(async () => { inputOf(tree).props.onBlur({}) })
		expect(containerStyle(tree).borderColor).toBe('transparent')
	})

	test('in light mode the resting border is the neutral `border` token', async () => {
		mockIsDark = false
		const tree = await render({})
		expect(containerStyle(tree).borderColor).toBe(lightTheme.colors.border)
		await act(async () => { inputOf(tree).props.onFocus({}) })
		expect(containerStyle(tree).borderColor).toBe(lightTheme.colors.primary)
	})

	test('the caller keeps receiving onFocus/onBlur', async () => {
		const onFocus = jest.fn()
		const onBlur = jest.fn()
		const tree = await render({ onFocus, onBlur })
		await act(async () => { inputOf(tree).props.onFocus('f') })
		await act(async () => { inputOf(tree).props.onBlur('b') })
		expect(onFocus).toHaveBeenCalledWith('f')
		expect(onBlur).toHaveBeenCalledWith('b')
	})

	test('multiline grows the field to 100px', async () => {
		const single = await render({})
		expect(StyleSheet.flatten(inputOf(single).props.style).height).toBe(50)
		const multi = await render({ multiline: true })
		expect(StyleSheet.flatten(inputOf(multi).props.style).height).toBe(100)
	})
})
