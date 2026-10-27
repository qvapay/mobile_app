/**
 * Lógica pura del easter egg de contribuidores (pie de Ajustes).
 * @jest-environment node
 */
import { filterContributors, isDoubleTap, avatarUrl, DOUBLE_TAP_MS } from './contributors'
import bundled from './contributors.bundled.json'

const person = (login, contributions, extra = {}) => ({
	login, contributions, type: 'User',
	avatar_url: `https://avatars.githubusercontent.com/u/${login}?v=4`,
	html_url: `https://github.com/${login}`,
	...extra,
})

describe('filterContributors', () => {
	it('quita bots y agentes y ordena por contribuciones', () => {
		const list = filterContributors([
			person('Pep3M', 2),
			person('dependabot[bot]', 3, { type: 'Bot' }),
			person('n3omaster', 790),
			person('claude-bot', 500),
			person('anthropic-claude', 40),
			person('cursoragent', 20),
			person('copilot-swe-agent', 9),
			person('github-actions[bot]', 100),
			person('renovate-bot', 5),
			person('Delgado74', 11),
		])
		expect(list.map(c => c.login)).toEqual(['n3omaster', 'Delgado74', 'Pep3M'])
	})

	it('trata la ausencia de type como persona', () => {
		const list = filterContributors([person('alguien', 1, { type: undefined })])
		expect(list).toHaveLength(1)
		expect(list[0].type).toBe('User')
	})

	it('devuelve [] con payloads que no son una lista o con entradas rotas', () => {
		expect(filterContributors({ message: 'API rate limit exceeded' })).toEqual([])
		expect(filterContributors(null)).toEqual([])
		expect(filterContributors('x')).toEqual([])
		expect(filterContributors([null, 7, { login: 'sin-urls' }, person('ok', 1, { avatar_url: 'http://inseguro' })])).toEqual([])
	})

	it('el empaquetado es válido y no trae bots', () => {
		const list = filterContributors(bundled)
		expect(list.length).toBe(bundled.length)
		expect(list.map(c => c.login)).toContain('n3omaster')
		expect(list.map(c => c.login)).not.toContain('dependabot[bot]')
	})
})

describe('avatarUrl', () => {
	it('añade el tamaño respetando una query existente', () => {
		expect(avatarUrl({ avatar_url: 'https://avatars.githubusercontent.com/u/1?v=4' })).toBe('https://avatars.githubusercontent.com/u/1?v=4&s=96')
		expect(avatarUrl({ avatar_url: 'https://avatars.githubusercontent.com/u/1' }, 64)).toBe('https://avatars.githubusercontent.com/u/1?s=64')
	})
})

describe('isDoubleTap', () => {
	it('solo dentro de la ventana y con un toque previo', () => {
		expect(isDoubleTap(null, 1000)).toBe(false)
		expect(isDoubleTap(1000, 1000 + DOUBLE_TAP_MS)).toBe(true)
		expect(isDoubleTap(1000, 1000 + DOUBLE_TAP_MS + 1)).toBe(false)
		expect(isDoubleTap(1000, 900)).toBe(false)
	})
})
