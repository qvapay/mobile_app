/**
 * modalPresence — contador de <Modal> en pantalla (módulo puro) y su enganche
 * en useModalGate: un modal cuenta mientras está montado, salida incluida.
 * @jest-environment node
 */
jest.mock('react-native', () => ({ Platform: { OS: 'ios' } }))

import { act, create } from 'react-test-renderer'
import { acquireModalPresence, isAnyModalPresented, useAnyModalPresented } from './modalPresence'
import { useModalGate } from './useModalGate'

afterEach(() => { expect(isAnyModalPresented()).toBe(false) })

test('cuenta los modales apuntados y la baja es idempotente', () => {
	expect(isAnyModalPresented()).toBe(false)
	const releaseA = acquireModalPresence()
	const releaseB = acquireModalPresence()
	expect(isAnyModalPresented()).toBe(true)
	releaseA()
	releaseA()
	expect(isAnyModalPresented()).toBe(true)
	releaseB()
	expect(isAnyModalPresented()).toBe(false)
})

test('useAnyModalPresented sigue al contador', () => {
	const seen = []
	const Probe = () => { seen.push(useAnyModalPresented()); return null }
	let tree
	act(() => { tree = create(<Probe />) })
	expect(seen.at(-1)).toBe(false)
	let release
	act(() => { release = acquireModalPresence() })
	expect(seen.at(-1)).toBe(true)
	act(() => { release() })
	expect(seen.at(-1)).toBe(false)
	act(() => { tree.unmount() })
})

describe('useModalGate', () => {
	const mount = (wanted) => {
		const gate = { current: null }
		const Harness = ({ open }) => { gate.current = useModalGate(open); return null }
		let tree
		act(() => { tree = create(<Harness open={wanted} />) })
		return {
			gate,
			set: (open) => act(() => { tree.update(<Harness open={open} />) }),
			unmount: () => act(() => { tree.unmount() }),
		}
	}

	test('en iOS el modal sigue contando hasta onDismiss, no hasta que se pide cerrarlo', () => {
		const { gate, set, unmount } = mount(true)
		expect(isAnyModalPresented()).toBe(true)

		act(() => { gate.current.onShow() })
		set(false)
		// Pedido el cierre: `visible` ya es false pero el modal aún se está yendo
		expect(gate.current.visible).toBe(false)
		expect(gate.current.mounted).toBe(true)
		expect(isAnyModalPresented()).toBe(true)

		act(() => { gate.current.onDismiss() })
		expect(gate.current.mounted).toBe(false)
		expect(isAnyModalPresented()).toBe(false)
		unmount()
	})

	test('cerrado antes de terminar de presentarse sigue contando hasta que se va', () => {
		const { gate, set, unmount } = mount(true)
		set(false) // p. ej. Face ID desbloquea antes del fundido de entrada
		expect(gate.current.visible).toBe(true)
		expect(isAnyModalPresented()).toBe(true)

		act(() => { gate.current.onShow() })
		expect(isAnyModalPresented()).toBe(true)
		act(() => { gate.current.onDismiss() })
		expect(isAnyModalPresented()).toBe(false)
		unmount()
	})

	test('desmontar el componente con el modal abierto lo da de baja', () => {
		const { unmount } = mount(true)
		expect(isAnyModalPresented()).toBe(true)
		unmount()
		expect(isAnyModalPresented()).toBe(false)
	})

	test('un modal que nunca se abre no cuenta', () => {
		const { unmount } = mount(false)
		expect(isAnyModalPresented()).toBe(false)
		unmount()
	})
})
