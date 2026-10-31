/**
 * Icono del acceso directo de Android: lienzo de 216 px con el icono a 160 px
 * centrado. Skia va simulado: lo que se fija es CÓMO se pinta cada formato.
 * @jest-environment node
 */
const mockCanvas = {
	drawColor: jest.fn(),
	translate: jest.fn(),
	scale: jest.fn(),
	drawSvg: jest.fn(),
	drawImageRect: jest.fn(),
}
const mockSvgSize = { width: 512, height: 512 }
const mockSvg = { width: () => mockSvgSize.width, height: () => mockSvgSize.height }

jest.mock('react-native-skia', () => ({
	ImageFormat: { PNG: 4 },
	Skia: {
		Data: { fromURI: jest.fn(async () => 'bytes') },
		Surface: {
			MakeOffscreen: jest.fn(() => ({
				getCanvas: () => mockCanvas,
				flush: jest.fn(),
				makeImageSnapshot: () => ({ makeNonTextureImage: () => ({ encodeToBase64: () => 'PNG64' }) }),
			})),
		},
		Color: color => color,
		SVG: { MakeFromData: jest.fn(() => mockSvg) },
		Image: { MakeImageFromEncoded: jest.fn(() => ({ width: () => 1280, height: () => 720 })) },
		XYWHRect: (x, y, width, height) => ({ x, y, width, height }),
		Paint: () => ({}),
	},
}))

import { Skia } from 'react-native-skia'
import { renderMiniAppIconPng } from './miniAppIconBitmap'

const SVG_ICON = 'https://www.qvapay.com/miniapps/qvaboard.svg'

beforeEach(() => {
	jest.clearAllMocks()
	Object.assign(mockSvgSize, { width: 512, height: 512 })
})

test('un SVG con width/height propios se escala al hueco del icono', async () => {
	expect(await renderMiniAppIconPng(SVG_ICON)).toBe('PNG64')
	expect(mockCanvas.drawColor).toHaveBeenCalledWith('#FFFFFF')
	expect(mockCanvas.translate).toHaveBeenCalledWith(28, 28)
	expect(mockCanvas.scale).toHaveBeenCalledWith(160 / 512, 160 / 512)
	expect(mockCanvas.drawSvg).toHaveBeenCalledWith(mockSvg, 512, 512)
})

test('un SVG apaisado conserva la proporción y queda centrado', async () => {
	Object.assign(mockSvgSize, { width: 512, height: 256 })
	await renderMiniAppIconPng(SVG_ICON)
	expect(mockCanvas.scale).toHaveBeenCalledWith(160 / 512, 160 / 512)
	expect(mockCanvas.translate).toHaveBeenCalledWith(28, 68)
})

test('un SVG de medidas relativas se ajusta con el contenedor', async () => {
	Object.assign(mockSvgSize, { width: 0, height: 0 })
	await renderMiniAppIconPng(SVG_ICON)
	expect(mockCanvas.scale).not.toHaveBeenCalled()
	expect(mockCanvas.translate).toHaveBeenCalledWith(28, 28)
	expect(mockCanvas.drawSvg).toHaveBeenCalledWith(mockSvg, 160, 160)
})

test('una imagen que no es cuadrada se recorta al centro', async () => {
	expect(await renderMiniAppIconPng('https://x.com/portada.png')).toBe('PNG64')
	expect(mockCanvas.drawImageRect).toHaveBeenCalledWith(
		expect.anything(),
		{ x: 280, y: 0, width: 720, height: 720 },
		{ x: 28, y: 28, width: 160, height: 160 },
		expect.anything(),
	)
})

test('sin icono o si algo falla, null (el nativo pone el de QvaPay)', async () => {
	expect(await renderMiniAppIconPng(null)).toBeNull()
	Skia.Data.fromURI.mockRejectedValueOnce(new Error('red'))
	expect(await renderMiniAppIconPng(SVG_ICON)).toBeNull()
	Skia.SVG.MakeFromData.mockReturnValueOnce(null)
	expect(await renderMiniAppIconPng(SVG_ICON)).toBeNull()
})
