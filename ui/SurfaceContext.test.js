/**
 * Tono del anfitrión → relleno del campo: un campo es siempre el OTRO neutro de donde
 * está (surface sobre página, background sobre tarjeta/modal), y gana el anfitrión más
 * interno (una hoja `background` abierta desde una tarjeta `surface` vuelve a surface).
 * @jest-environment node
 */
jest.mock('../theme/ThemeContext', () => {
	const { createTheme } = jest.requireActual('../theme/themeTokens')
	return { createTheme, useTheme: () => ({ theme: createTheme(true) }) }
})

import { Text } from 'react-native'
import { act, create } from 'react-test-renderer'
import { SurfaceHost, fieldFillTone, useFieldFill, useSurfaceTone } from './SurfaceContext'
import { createTheme } from '../theme/themeTokens'

const theme = createTheme(true)

const Probe = () => <Text testID="probe" tone={useSurfaceTone()}>{useFieldFill()}</Text>

const render = async (element) => {
	let tree
	await act(async () => { tree = create(element) })
	return tree.root.findByProps({ testID: 'probe' }).props
}

describe('fieldFillTone', () => {
	test('a field is the other neutral of its host', () => {
		expect(fieldFillTone('background')).toBe('surface')
		expect(fieldFillTone('surface')).toBe('background')
	})
})

describe('useFieldFill / useSurfaceTone', () => {
	test('without a host the field is surface on the page background', async () => {
		const probe = await render(<Probe />)
		expect(probe.tone).toBe('background')
		expect(probe.children).toBe(theme.colors.surface)
	})

	test('inside a surface host the field sinks to the page background', async () => {
		const probe = await render(<SurfaceHost tone="surface"><Probe /></SurfaceHost>)
		expect(probe.tone).toBe('surface')
		expect(probe.children).toBe(theme.colors.background)
	})

	test('the innermost host wins: a background sheet opened from a card is surface again', async () => {
		const probe = await render(
			<SurfaceHost tone="surface">
				<SurfaceHost tone="background"><Probe /></SurfaceHost>
			</SurfaceHost>
		)
		expect(probe.tone).toBe('background')
		expect(probe.children).toBe(theme.colors.surface)
	})
})
