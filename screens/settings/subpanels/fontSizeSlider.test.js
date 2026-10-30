/**
 * Pure-logic unit test — runs in the node environment to avoid the React Native
 * jest preset's bundled jest 29 packages (which clash with jest 30 in devDeps).
 * @jest-environment node
 */
import { STEP_HIT, clampToTrack, nearestStep, stepCenterX } from './fontSizeSlider'

// Pista de 5 pasos: centros en 14, 84, 154, 224, 294
const WIDTH = 308
const COUNT = 5

describe('stepCenterX', () => {
	test('reparte los centros con medio paso de margen en cada borde', () => {
		expect([0, 1, 2, 3, 4].map(i => stepCenterX(i, WIDTH, COUNT))).toEqual([14, 84, 154, 224, 294])
		expect(stepCenterX(0, WIDTH, COUNT)).toBe(STEP_HIT / 2)
		expect(stepCenterX(COUNT - 1, WIDTH, COUNT)).toBe(WIDTH - STEP_HIT / 2)
	})

	test('con un solo paso, el centro de la pista', () => {
		expect(stepCenterX(0, WIDTH, 1)).toBe(WIDTH / 2)
	})
})

describe('nearestStep', () => {
	test('cada centro es su propio paso', () => {
		[0, 1, 2, 3, 4].forEach(i => expect(nearestStep(stepCenterX(i, WIDTH, COUNT), WIDTH, COUNT)).toBe(i))
	})

	test('cambia de paso al cruzar la mitad entre dos puntos', () => {
		expect(nearestStep(48, WIDTH, COUNT)).toBe(0)
		expect(nearestStep(50, WIDTH, COUNT)).toBe(1)
		expect(nearestStep(188, WIDTH, COUNT)).toBe(2)
		expect(nearestStep(190, WIDTH, COUNT)).toBe(3)
	})

	test('fuera de la pista se queda en los extremos', () => {
		expect(nearestStep(-200, WIDTH, COUNT)).toBe(0)
		expect(nearestStep(WIDTH + 200, WIDTH, COUNT)).toBe(COUNT - 1)
	})

	test('sin medir (ancho 0) o con un paso, el primero', () => {
		expect(nearestStep(100, 0, COUNT)).toBe(0)
		expect(nearestStep(100, WIDTH, 1)).toBe(0)
	})
})

describe('clampToTrack', () => {
	test('acota entre el primer y el último centro', () => {
		expect(clampToTrack(-50, WIDTH)).toBe(14)
		expect(clampToTrack(100, WIDTH)).toBe(100)
		expect(clampToTrack(1000, WIDTH)).toBe(294)
	})

	test('una pista más estrecha que un paso no invierte los límites', () => {
		expect(clampToTrack(100, 10)).toBe(STEP_HIT / 2)
	})
})
