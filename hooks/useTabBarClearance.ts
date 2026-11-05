import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { supportsLiquidGlass } from '../helpers/liquidGlass'
import { useSettings } from '../settings/SettingsContext'
import { tabBarClearance } from '../ui/glassTabBarMetrics'

/**
 * Hueco que una PESTAÑA de MainStack suma a su `insets.bottom + margen propio`
 * para que su último elemento no quede debajo de la barra inferior flotante
 * emulada (`ui/GlassTabBar`: iOS < 26 y Android), que va en `position:
 * 'absolute'` con el contenido pasando por debajo.
 *
 * En iOS 26+ devuelve 0: ahí la barra es la nativa y cada pestaña conserva el
 * hueco que ya tenía calibrado contra ella.
 *
 * @returns Puntos que la barra ocupa por encima del área segura.
 *
 * @example
 * const contentPadding = useContentPadding(20 + useTabBarClearance())
 */
export default function useTabBarClearance(): number {
	const insets = useSafeAreaInsets()
	const { appearance } = useSettings()
	if (supportsLiquidGlass) { return 0 }
	return tabBarClearance(insets.bottom, Boolean(appearance.bottomBarLabels))
}
