/**
 * P2PChatSheet — cerrar el chat arrastrando la cabecera: el umbral vive en
 * `ui/sheetDrag`; aquí se prueba que la hoja lo respeta y que se reabre entera.
 * @jest-environment node
 */
let mockPan
let mockDragY

jest.mock('react-native-reanimated', () => ({
	...jest.requireActual('../../__mocks__/react-native-reanimated'),
	KeyboardState: { CLOSED: 0 },
	useAnimatedKeyboard: () => ({ state: { value: 0 }, height: { value: 0 } }),
	useSharedValue: (initial) => { mockDragY = mockDragY ?? { value: initial }; return mockDragY },
	withTiming: (to, _config, done) => { done?.(true); return to },
}))
jest.mock('react-native-gesture-handler', () => ({
	GestureDetector: ({ children }) => children,
	usePanGesture: (config) => { mockPan = config; return 'pan' },
}))
jest.mock('./P2PChatPanel', () => 'P2PChatPanel')
jest.mock('./P2PPeerRow', () => 'P2PPeerRow')

import { act, create } from 'react-test-renderer'
import P2PChatSheet from './P2PChatSheet'
import { SHEET_DISMISS_DISTANCE } from '../../ui/sheetDrag'
import { createTheme } from '../../theme/themeTokens'

const insets = { top: 0, right: 0, bottom: 34, left: 0 }

const build = (visible = true) => {
	const onClose = jest.fn()
	const props = { onClose, insets, theme: createTheme(true), textStyles: {}, containerStyles: {}, chatPanelProps: {} }
	let tree
	act(() => { tree = create(<P2PChatSheet visible={visible} {...props} />) })
	return { tree, onClose, setVisible: (next) => act(() => { tree.update(<P2PChatSheet visible={next} {...props} />) }) }
}

const release = (translationY, velocityY = 0, canceled = false) => mockPan.onDeactivate({ translationY, velocityY, canceled })

beforeEach(() => {
	mockDragY = undefined
})

test('solo arrastra hacia abajo: tirar hacia arriba no despega la hoja', () => {
	build()
	mockPan.onUpdate({ translationY: 60 })
	expect(mockDragY.value).toBe(60)
	mockPan.onUpdate({ translationY: -40 })
	expect(mockDragY.value).toBe(0)
})

test('soltarla poco la devuelve a su sitio sin cerrar', () => {
	const { onClose } = build()
	mockPan.onUpdate({ translationY: 40 })
	release(40)
	expect(mockDragY.value).toBe(0)
	expect(onClose).not.toHaveBeenCalled()
})

test('soltarla pasada la distancia la saca de pantalla y entonces avisa', () => {
	const { onClose } = build()
	release(SHEET_DISMISS_DISTANCE + 10)
	expect(mockDragY.value).toBeGreaterThan(SHEET_DISMISS_DISTANCE)
	expect(onClose).toHaveBeenCalledTimes(1)
})

test('un gesto cancelado por el sistema no cierra', () => {
	const { onClose } = build()
	release(SHEET_DISMISS_DISTANCE + 10, 0, true)
	expect(mockDragY.value).toBe(0)
	expect(onClose).not.toHaveBeenCalled()
})

test('la hoja que se cerró arrastrando se reabre en su sitio', () => {
	const { setVisible } = build()
	release(SHEET_DISMISS_DISTANCE + 10)
	setVisible(false)
	expect(mockDragY.value).toBeGreaterThan(0)
	setVisible(true)
	expect(mockDragY.value).toBe(0)
})

test('cerrada no pinta nada', () => {
	const { tree } = build(false)
	expect(tree.toJSON()).toBeNull()
})
