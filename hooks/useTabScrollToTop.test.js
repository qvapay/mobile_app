/**
 * useTabScrollToTop — la barra emulada se delega en `useScrollToTop` y el toque
 * repetido de la barra nativa (iOS 26+) se resuelve aquí, sin hacer doble scroll.
 * @jest-environment node
 */
const mockUnsubscribe = jest.fn()
const mockUseScrollToTop = jest.fn()
let mockTabPress = null

jest.mock('@react-navigation/native', () => ({
	useNavigation: () => mockNavigation,
	useScrollToTop: (ref) => mockUseScrollToTop(ref),
}))

const mockNavigation = {
	addListener: (type, handler) => {
		if (type === 'tabPress') { mockTabPress = handler }
		return mockUnsubscribe
	},
}

import { act, create } from 'react-test-renderer'
import useTabScrollToTop from './useTabScrollToTop'

const NATIVE_REPEAT = { origin: 'native', behavior: { scrollToTop: true, popToTop: true } }

const Probe = ({ scrollRef }) => {
	useTabScrollToTop(scrollRef)
	return null
}

const mount = (current) => {
	const ref = { current }
	let tree
	act(() => { tree = create(<Probe scrollRef={ref} />) })
	return { ref, tree }
}

beforeEach(() => {
	mockTabPress = null
	mockUnsubscribe.mockClear()
	mockUseScrollToTop.mockClear()
})

test('la barra emulada se delega en useScrollToTop con el mismo ref', () => {
	const { ref } = mount({ scrollTo: jest.fn() })
	expect(mockUseScrollToTop).toHaveBeenCalledWith(ref)
})

test('un ScrollView sube con el toque repetido de la barra nativa', () => {
	const scrollTo = jest.fn()
	mount({ scrollTo })
	mockTabPress({ data: NATIVE_REPEAT })
	expect(scrollTo).toHaveBeenCalledTimes(1)
	expect(scrollTo).toHaveBeenCalledWith({ y: 0, animated: true })
})

test('una FlashList usa su propio scrollToTop', () => {
	const list = { scrollToTop: jest.fn(), scrollTo: jest.fn() }
	mount(list)
	mockTabPress({ data: NATIVE_REPEAT })
	expect(list.scrollToTop).toHaveBeenCalledWith({ animated: true })
	expect(list.scrollTo).not.toHaveBeenCalled()
})

test('llegar a la pestaña desde otra no mueve el scroll', () => {
	const scrollTo = jest.fn()
	mount({ scrollTo })
	mockTabPress({ data: { origin: 'native', behavior: { scrollToTop: false, popToTop: false } } })
	expect(scrollTo).not.toHaveBeenCalled()
})

test('el tabPress de la barra emulada no se atiende dos veces', () => {
	const scrollTo = jest.fn()
	mount({ scrollTo })
	mockTabPress({ data: undefined })
	expect(scrollTo).not.toHaveBeenCalled()
})

test('sin lista montada (gate de P2P, carga de la Tienda) no hace nada', () => {
	mount(null)
	expect(() => mockTabPress({ data: NATIVE_REPEAT })).not.toThrow()
})

test('al desmontar deja de escuchar', () => {
	const { tree } = mount({ scrollTo: jest.fn() })
	act(() => { tree.unmount() })
	expect(mockUnsubscribe).toHaveBeenCalledTimes(1)
})
