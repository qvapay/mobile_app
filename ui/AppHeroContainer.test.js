/**
 * Héroe de una transacción de App: logo del comercio a 120, nombre, descripción y web.
 * @jest-environment node
 */
jest.mock('../theme/ThemeContext', () => {
	const { createTheme } = jest.requireActual('../theme/themeTokens')
	return { useTheme: () => ({ theme: createTheme(true) }) }
})
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 47, bottom: 34, left: 0, right: 0 }) }))
jest.mock('./particles/QPAppLogo', () => 'QPAppLogo')

import { act, create } from 'react-test-renderer'
import AppHeroContainer from './AppHeroContainer'

const render = (app) => {
	let tree
	act(() => { tree = create(<AppHeroContainer app={app} />) })
	return tree
}
const text = (tree) => JSON.stringify(tree.toJSON())

test('pinta logo grande, nombre, descripción y web', () => {
	const tree = render({ name: 'La Tienda', logo: 'apps/t.png', desc: 'Ropa y calzado', url: 'https://latienda.cu' })
	const logo = tree.root.findByType('QPAppLogo')
	expect(logo.props.size).toBe(120)
	expect(logo.props.app.logo).toBe('apps/t.png')
	expect(text(tree)).toContain('La Tienda')
	expect(text(tree)).toContain('Ropa y calzado')
	expect(text(tree)).toContain('https://latienda.cu')
})

test('sin descripción ni web solo sale el nombre', () => {
	const out = text(render({ name: 'Solo nombre' }))
	expect(out).toContain('Solo nombre')
	expect(out).not.toContain('https://')
})
