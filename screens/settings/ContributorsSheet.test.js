/**
 * Hoja de contribuidores del pie de Ajustes con la query real: de más a menos
 * contribuciones y diciendo cuántas lleva cada persona. El filtro de bots y el orden
 * en sí se prueban en contributors.test.js.
 * @jest-environment node
 */
jest.mock('../../theme/ThemeContext', () => {
	const { createTheme } = jest.requireActual('../../theme/themeTokens')
	return { useTheme: () => ({ theme: createTheme(true) }) }
})
jest.mock('../../ui/QPSheet', () => 'QPSheet')
jest.mock('../../ui/particles/QPPressable', () => 'QPPressable')
jest.mock('@react-native-vector-icons/fontawesome6', () => 'FontAwesome6')
jest.mock('@d11/react-native-fast-image', () => ({
	__esModule: true,
	default: Object.assign(() => null, { cacheControl: { web: 'web' }, resizeMode: { cover: 'cover' } }),
}))

import React from 'react'
import { act, create } from 'react-test-renderer'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import ContributorsSheet from './ContributorsSheet'
import bundled from './contributors.bundled.json'

const person = (login, contributions, extra = {}) => ({
	login, contributions, type: 'User',
	avatar_url: `https://avatars.githubusercontent.com/u/${login}?v=4`,
	html_url: `https://github.com/${login}`,
	...extra,
})
const github = (list) => ({ ok: true, json: async () => list })

const originalFetch = global.fetch
let client
let tree
const open = async () => {
	await act(async () => {
		tree = create(<QueryClientProvider client={client}><ContributorsSheet visible onClose={jest.fn()} /></QueryClientProvider>)
	})
}
const settle = () => act(async () => { await new Promise(resolve => setTimeout(resolve, 20)) })
// El primer texto es el agradecimiento y el último, la invitación a mandar un PR
const rows = () => tree.root.findAllByType('Text').map(text => [text.props.children].flat().join('')).slice(1, -1)

beforeEach(() => {
	client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
})
afterEach(async () => {
	global.fetch = originalFetch
	// Sin desmontar, el observer deja vivo su temporizador de 24 h (staleTime) y jest no cierra
	await act(async () => { tree.unmount() })
	client.clear()
	client.unmount()
})

test('lists people from most to fewest contributions and says how many each one has', async () => {
	global.fetch = jest.fn(async () => github([
		person('Pep3M', 2),
		person('dependabot[bot]', 4, { type: 'Bot' }),
		person('n3omaster', 828),
		person('nuevo', 1),
		person('ecejas', 8),
	]))
	await open()
	await settle()
	expect(rows()).toEqual([
		'@n3omaster', '828 contribuciones',
		'@ecejas', '8 contribuciones',
		'@Pep3M', '2 contribuciones',
		'@nuevo', '1 contribución',
	])
})

test('the bundled list also shows its counts until GitHub answers', async () => {
	let answer
	global.fetch = jest.fn(() => new Promise(resolve => { answer = resolve }))
	await open()
	expect(rows().slice(0, 2)).toEqual([`@${bundled[0].login}`, `${bundled[0].contributions} contribuciones`])

	await act(async () => { answer(github([person('n3omaster', 900)])) })
	await settle()
	expect(rows()).toEqual(['@n3omaster', '900 contribuciones'])
})
