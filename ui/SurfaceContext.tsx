import { createContext, use } from 'react'
import type { ReactNode } from 'react'

// Theme
import { useTheme } from '../theme/ThemeContext'

/** Neutro sobre el que se está pintando: fondo de página o tarjeta/modal `surface`. */
export type SurfaceTone = 'background' | 'surface'

// Por defecto, una pantalla: una página normal no necesita provider, y no se lanza
// (a diferencia de useBottomBar) porque «sin anfitrión» es un estado válido
const SurfaceContext = createContext<SurfaceTone>('background')

/**
 * PURO: un campo (input, caja de código, chip, píldora de activo) es SIEMPRE el OTRO
 * neutro de su anfitrión — un pozo hundido. Sobre fondo de página va `surface`; sobre
 * una tarjeta o un modal `surface` va `background` (más oscuro en dark, blanco en light).
 * En dark no hay bordes y `surface` sobre `surface` es invisible: el campo desaparecía
 * en todos los modales; en light solo lo salvaba un hairline.
 *
 * @param host - Tono del anfitrión.
 * @returns Tono con el que pintar el campo.
 */
export const fieldFillTone = (host: SurfaceTone): SurfaceTone => host === 'surface' ? 'background' : 'surface'

/**
 * Lo coloca quien pinta un neutro: `QPModalCard` y las tarjetas `surface` de pantalla
 * declaran `'surface'`; `QPSheet` RESETEA a `'background'` (el contexto de React
 * atraviesa `<Modal>`, así que una hoja abierta desde una tarjeta heredaría el tono de la
 * tarjeta). Gana el anfitrión más interno.
 */
export const SurfaceHost = ({ tone, children }: { tone: SurfaceTone, children: ReactNode }) => (
	<SurfaceContext.Provider value={tone}>{children}</SurfaceContext.Provider>
)

/**
 * Tono del anfitrión actual (`'background'` sin provider).
 *
 * @returns El tono del anfitrión.
 */
export const useSurfaceTone = (): SurfaceTone => use(SurfaceContext)

/**
 * Hex con el que pintar un campo sobre el anfitrión actual. Es lo que leen QPInput,
 * QPCodeInput, QPAssetPill y la chip de QPPhoneInput: nunca `surface`/`background` fijos.
 *
 * @returns Color de relleno del campo.
 */
export const useFieldFill = (): string => {
	const { theme } = useTheme()
	return theme.colors[fieldFillTone(use(SurfaceContext))]
}
