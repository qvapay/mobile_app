/**
 * Gate de Novedades: cuándo se enseña y cuál.
 * @jest-environment node
 */
import { compareSemver, pickRelease, releaseForVersion } from './whatsNewGate'

const R = (version) => ({ version, slides: [{ key: 'x', hero: { kind: 'icon', icon: 'star' }, titleKey: 't', bodyKey: 'b' }] })
const releases = [R('3.6.0'), R('3.8.0'), R('3.9.0')]

describe('compareSemver', () => {
	test('ordena y trata los segmentos que faltan como 0', () => {
		expect(compareSemver('3.8.0', '3.7.4')).toBe(1)
		expect(compareSemver('3.7.4', '3.8.0')).toBe(-1)
		expect(compareSemver('3.8', '3.8.0')).toBe(0)
		expect(compareSemver('3.10.0', '3.9.0')).toBe(1)
		expect(Number.isNaN(compareSemver('abc', '1.0'))).toBe(true)
	})
})

describe('pickRelease', () => {
	test('quien viene de antes de la pantalla (lastSeen null) ve la de su versión', () => {
		expect(pickRelease({ current: '3.8.0', lastSeen: null, releases })?.version).toBe('3.8.0')
		expect(pickRelease({ current: '3.8.0', lastSeen: undefined, releases })?.version).toBe('3.8.0')
	})

	test('ya vista = nada; una versión anterior vista = la nueva', () => {
		expect(pickRelease({ current: '3.8.0', lastSeen: '3.8.0', releases })).toBeNull()
		expect(pickRelease({ current: '3.8.0', lastSeen: '3.7.4', releases })?.version).toBe('3.8.0')
	})

	test('nunca una release más nueva que la app instalada', () => {
		expect(pickRelease({ current: '3.7.4', lastSeen: '3.6.0', releases })).toBeNull()
		expect(pickRelease({ current: '3.8.5', lastSeen: null, releases })?.version).toBe('3.8.0')
	})

	test('si se saltaron varias, solo la más nueva; un parche sin manifiesto hereda la última', () => {
		expect(pickRelease({ current: '3.9.2', lastSeen: '3.5.0', releases })?.version).toBe('3.9.0')
	})

	test('versiones malformadas y manifiestos vacíos no enseñan nada', () => {
		expect(pickRelease({ current: 'dev', lastSeen: null, releases })).toBeNull()
		expect(pickRelease({ current: '3.8.0', lastSeen: 'garbage', releases })?.version).toBe('3.8.0')
		expect(pickRelease({ current: '3.8.0', lastSeen: null, releases: [{ version: '3.8.0', slides: [] }] })).toBeNull()
	})
})

describe('releaseForVersion', () => {
	test('encuentra la de la versión exacta', () => {
		expect(releaseForVersion('3.8.0', releases)?.version).toBe('3.8.0')
		expect(releaseForVersion('3.8.1', releases)).toBeNull()
	})
})
