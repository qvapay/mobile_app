import { Platform } from 'react-native'

/** Liquid glass (tabs y headers nativos translúcidos) requiere iOS 26+. Una sola definición para toda la app. */
export const supportsLiquidGlass = Platform.OS === 'ios' && parseInt(String(Platform.Version), 10) >= 26

const GLASS_OVERLAY_HEADER = {
	headerShown: true,
	headerTransparent: true,
	headerTitle: '',
	headerStyle: { backgroundColor: 'transparent' },
	headerShadowVisible: false,
} as const
const GLASS_OVERLAY_CLOSE = { ...GLASS_OVERLAY_HEADER, headerBackVisible: false } as const
const NO_HEADER = { headerShown: false } as const

/**
 * Options de una pantalla SIN cabecera propia (portada a sangre, cámara, menú de Ajustes)
 * cuyos botones flotantes pasan a ser los nativos de liquid glass en iOS 26+: cabecera
 * transparente y sin título, así el contenido sigue llegando hasta arriba. Los botones los
 * pone la pantalla con `hooks/useGlassHeaderButtons`. Fuera de iOS 26+, sin cabecera.
 *
 * Objetos con identidad ESTABLE (unas options que cambian de identidad traen el parpadeo
 * del header de iOS).
 *
 * @param back - `true` deja el botón atrás nativo; `false` lo quita (la pantalla pone su «cerrar»).
 */
export const glassOverlayHeader = (back: boolean) => !supportsLiquidGlass ? NO_HEADER : back ? GLASS_OVERLAY_HEADER : GLASS_OVERLAY_CLOSE
