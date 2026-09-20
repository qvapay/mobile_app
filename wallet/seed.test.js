/**
 * @jest-environment node
 *
 * Quiz de backup: la palabra correcta NO puede tener posición predecible
 * entre las opciones (un usuario reportó que "siempre era la primera") y las
 * opciones nunca se repiten aunque la frase tenga palabras duplicadas.
 */
import { buildQuiz, pickQuizPositions, QUIZ_QUESTIONS, QUIZ_OPTIONS, secureRandomInt, shuffleSecure } from './seed'

const WORDS = 'legal winner thank year wave sausage worth useful legal winner thank yellow'.split(' ')

describe('secureRandomInt', () => {
	test('siempre dentro de rango', () => {
		for (let i = 0; i < 2000; i++) {
			const value = secureRandomInt(7)
			expect(value).toBeGreaterThanOrEqual(0)
			expect(value).toBeLessThan(7)
		}
		expect(secureRandomInt(1)).toBe(0)
	})
})

describe('shuffleSecure', () => {
	test('no muta la entrada y conserva los elementos', () => {
		const input = ['a', 'b', 'c', 'd']
		const output = shuffleSecure(input)
		expect(input).toEqual(['a', 'b', 'c', 'd'])
		expect([...output].sort()).toEqual(input)
	})

	test('reparto uniforme de la primera posición (3 opciones)', () => {
		const RUNS = 30000
		const counts = { a: 0, b: 0, c: 0 }
		for (let i = 0; i < RUNS; i++) counts[shuffleSecure(['a', 'b', 'c'])[0]]++
		Object.values(counts).forEach(count => {
			// 1/3 ± 2 puntos: holgura de ~7 sigmas, el test no es flaky
			expect(count / RUNS).toBeGreaterThan(0.31)
			expect(count / RUNS).toBeLessThan(0.357)
		})
	})
})

describe('buildQuiz', () => {
	test('4 preguntas en posiciones distintas, 3 opciones con la correcta', () => {
		const quiz = buildQuiz(WORDS)
		expect(QUIZ_QUESTIONS).toBe(4)
		expect(quiz).toHaveLength(QUIZ_QUESTIONS)
		expect(new Set(quiz.map(q => q.position)).size).toBe(QUIZ_QUESTIONS)
		quiz.forEach(({ position, options }) => {
			expect(options).toHaveLength(QUIZ_OPTIONS)
			expect(options).toContain(WORDS[position])
			// "legal/winner/thank" están duplicadas en la frase: jamás dos opciones iguales
			expect(new Set(options).size).toBe(QUIZ_OPTIONS)
		})
	})

	test('la correcta no cae siempre en el mismo índice', () => {
		const RUNS = 3000
		const hits = [0, 0, 0]
		for (let i = 0; i < RUNS; i++) {
			const [{ position, options }] = buildQuiz(WORDS, 1)
			hits[options.indexOf(WORDS[position])]++
		}
		hits.forEach(count => {
			expect(count / RUNS).toBeGreaterThan(0.28)
			expect(count / RUNS).toBeLessThan(0.39)
		})
	})

	test('la fuente aleatoria es inyectable (determinista en tests)', () => {
		let next = 11
		const descending = (max) => next-- % max
		expect(pickQuizPositions(12, 3, descending)).toEqual([9, 10, 11])
	})
})
