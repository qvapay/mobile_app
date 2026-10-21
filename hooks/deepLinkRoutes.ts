import linking from '../linking'
import { ROUTES } from '../routes'

/**
 * Pantallas que un deep link puede montar como ÚNICA ruta raíz (PURO).
 *
 * En un arranque en frío desde un enlace, React Navigation construye el estado
 * inicial a partir de `linking.config` y el stack arranca con el destino solo
 * (`[Pay]`, `[MiniAppHost]`…), sin `MainStack` debajo. Es la lista de
 * `linking.ts` menos `MainStack` (que ya es la raíz y no necesita arreglo).
 */
export const DEEP_LINK_ROUTES: ReadonlySet<string> = new Set(
	Object.keys(linking.config?.screens ?? {}).filter(name => name !== ROUTES.MAIN_STACK),
)

/** ¿Es una pantalla que un deep link monta como ruta raíz? */
export const isDeepLinkRoute = (name: string | undefined): name is string => !!name && DEEP_LINK_ROUTES.has(name)
