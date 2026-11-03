/**
 * Puerta de presentación de un <Modal>: nunca ocultar antes de `onShow` ni
 * presentar antes de `onDismiss` (en iOS deja un modal zombi que bloquea el resto).
 * @jest-environment node
 */
import { initialModalGate, isModalGateMounted, isModalGatePending, reduceModalGate } from './modalGate'

const run = (state, ...events) => events.reduce(reduceModalGate, state)

test('arranca como se pide y la primera presentación es la generación 1', () => {
	expect(initialModalGate(true)).toMatchObject({ visible: true, wanted: true, presented: false, dismissing: false, generation: 1 })
	expect(initialModalGate(false)).toMatchObject({ visible: false, wanted: false, generation: 0 })
})

test('ciclo normal: presentar, onShow, pedir cierre, onDismiss', () => {
	let s = initialModalGate(false)
	s = run(s, { type: 'want', visible: true })
	expect(s).toMatchObject({ visible: true, presented: false, generation: 1 })
	// Abierto y pedido abierto: no hay nada pendiente que vigilar
	expect(isModalGatePending(s)).toBe(false)
	s = run(s, { type: 'shown' })
	expect(s.presented).toBe(true)
	s = run(s, { type: 'want', visible: false })
	expect(s).toMatchObject({ visible: false, dismissing: true })
	expect(isModalGateMounted(s)).toBe(true)
	expect(isModalGatePending(s)).toBe(false)
	s = run(s, { type: 'dismissed' })
	expect(s).toMatchObject({ visible: false, dismissing: false })
	expect(isModalGateMounted(s)).toBe(false)
})

test('cerrar antes de onShow (Face ID más rápido que el fade): espera y cierra al llegar onShow', () => {
	let s = run(initialModalGate(true), { type: 'want', visible: false })
	expect(s).toMatchObject({ visible: true, wanted: false, dismissing: false })
	expect(isModalGatePending(s)).toBe(true)
	s = run(s, { type: 'shown' })
	expect(s).toMatchObject({ visible: false, dismissing: true, presented: false })
	s = run(s, { type: 'dismissed' })
	expect(isModalGateMounted(s)).toBe(false)
})

test('cerrar y volver a abrir antes de onShow: se queda abierto sin re-presentar', () => {
	const s = run(initialModalGate(true), { type: 'want', visible: false }, { type: 'want', visible: true }, { type: 'shown' })
	expect(s).toMatchObject({ visible: true, wanted: true, presented: true, generation: 1 })
})

test('reabrir mientras se cierra: espera a onDismiss y presenta una generación nueva', () => {
	let s = run(initialModalGate(true), { type: 'shown' }, { type: 'want', visible: false }, { type: 'want', visible: true })
	expect(s).toMatchObject({ visible: false, dismissing: true, wanted: true })
	expect(isModalGatePending(s)).toBe(true)
	s = run(s, { type: 'dismissed' })
	expect(s).toMatchObject({ visible: true, dismissing: false, presented: false, generation: 2 })
})

test('timeout sin onShow (presentación rechazada): se oculta sin esperar', () => {
	const s = run(initialModalGate(true), { type: 'want', visible: false }, { type: 'timeout' })
	expect(s).toMatchObject({ visible: false, dismissing: false })
	expect(isModalGateMounted(s)).toBe(false)
})

test('timeout sin onDismiss con reapertura pedida: vuelve a presentar', () => {
	const s = run(initialModalGate(true), { type: 'shown' }, { type: 'want', visible: false }, { type: 'want', visible: true }, { type: 'timeout' })
	expect(s).toMatchObject({ visible: true, dismissing: false, generation: 2 })
})

test('eventos fuera de sitio no hacen nada', () => {
	const closed = initialModalGate(false)
	expect(run(closed, { type: 'shown' })).toBe(closed)
	expect(run(closed, { type: 'dismissed' })).toBe(closed)
	expect(run(closed, { type: 'timeout' })).toBe(closed)
	const open = run(initialModalGate(true), { type: 'shown' })
	expect(run(open, { type: 'timeout' })).toBe(open)
})
