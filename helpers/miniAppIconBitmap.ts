import { mediaUrl } from './mediaUrl'

/** Lado del lienzo: los 108 dp de un icono adaptativo de Android a 2x. */
const CANVAS = 216
/**
 * Lado del icono pintado. El launcher solo enseña los 72 dp centrales (144 px)
 * con su máscara (círculo, squircle…); pintarlo algo más grande hace que esa
 * máscara recorte fondo del icono y no deje un marco blanco alrededor.
 */
const ICON = 160

/**
 * Pinta el icono de una mini-app (PNG/JPG/WebP o SVG del CDN) como bitmap
 * adaptativo para un acceso directo de Android: fondo blanco (lo que se ve si
 * el icono tiene transparencias) e icono centrado.
 *
 * Skia se carga al llamar: así los tests de node que importan los accesos
 * directos no arrastran el módulo nativo.
 *
 * @param icon - `MiniApp.icon` tal cual llega del backend.
 * @returns PNG en base64, o null si no hay icono o no se pudo pintar (el
 *   nativo usa entonces el icono de QvaPay).
 */
export const renderMiniAppIconPng = async (icon: string | null | undefined): Promise<string | null> => {
	const uri = mediaUrl(icon)
	if (!uri) return null
	try {
		const { Skia, ImageFormat } = require('react-native-skia') as typeof import('react-native-skia')
		const data = await Skia.Data.fromURI(uri)
		const surface = Skia.Surface.MakeOffscreen(CANVAS, CANVAS)
		if (!surface) return null
		const canvas = surface.getCanvas()
		canvas.drawColor(Skia.Color('#FFFFFF'))
		const offset = (CANVAS - ICON) / 2
		if (/\.svg($|\?)/i.test(uri)) {
			const svg = Skia.SVG.MakeFromData(data)
			if (!svg) return null
			canvas.translate(offset, offset)
			canvas.drawSvg(svg, ICON, ICON)
		} else {
			const image = Skia.Image.MakeImageFromEncoded(data)
			if (!image) return null
			// Recorte cuadrado centrado: un icono que no sea cuadrado no se deforma
			const side = Math.min(image.width(), image.height())
			const src = Skia.XYWHRect((image.width() - side) / 2, (image.height() - side) / 2, side, side)
			canvas.drawImageRect(image, src, Skia.XYWHRect(offset, offset, ICON, ICON), Skia.Paint())
		}
		surface.flush()
		// Fuera de la GPU antes de codificar (como `drawAsImageFromPicture` de Skia)
		const snapshot = surface.makeImageSnapshot().makeNonTextureImage()
		return snapshot ? snapshot.encodeToBase64(ImageFormat.PNG) : null
	} catch {
		return null
	}
}
