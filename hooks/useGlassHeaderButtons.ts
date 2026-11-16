import { useLayoutEffect, useRef } from 'react'
import type { NativeStackHeaderItem, NativeStackHeaderItemButton } from '@react-navigation/native-stack'

import { supportsLiquidGlass } from '../helpers/liquidGlass'

type SfSymbolName = Extract<NonNullable<NativeStackHeaderItemButton['icon']>, { type: 'sfSymbol' }>['name']

/** Botón nativo de la barra (liquid glass). `false`/`null`/`undefined` = no se pinta. */
export type GlassHeaderButton = {
	label: string
	sfSymbol: SfSymbolName
	onPress: () => void
	/** Contador sobre el icono (carrito); vacío o null = sin badge. */
	badge?: string | null
	badgeColor?: string
} | false | null | undefined

type Options = {
	left?: GlassHeaderButton[]
	right?: GlassHeaderButton[]
	/** Tinta de los iconos; por defecto la del navigator (texto del tema). */
	tintColor?: string
}

/**
 * Botones flotantes de una pantalla sin cabecera (cerrar, QR, compartir, carrito…) como
 * items NATIVOS del header en iOS 26+, los de liquid glass. La ruta se registra con
 * `glassOverlayHeader()` (cabecera transparente y sin título: el contenido sigue llegando
 * hasta arriba) y la pantalla llama a este hook; fuera de iOS 26+ no hace nada y la
 * pantalla pinta sus botones de siempre (`supportsLiquidGlass` decide cuál de los dos).
 *
 * Los manejadores viajan por un ref: con ellos en las deps, `setOptions` correría en cada
 * render, y unas options con identidad cambiante traen el parpadeo del header de iOS.
 */
export default function useGlassHeaderButtons(navigation: { setOptions: (options: object) => void }, { left = [], right = [], tintColor }: Options) {

	const handlers = useRef({ left, right })
	useLayoutEffect(() => { handlers.current = { left, right } })

	// Clave estable de lo que se pinta (sin los manejadores)
	const describe = (buttons: GlassHeaderButton[]) => buttons.map(button => button ? [button.label, button.sfSymbol, button.badge || '', button.badgeColor || ''] : null)
	const key = JSON.stringify([describe(left), describe(right)])

	useLayoutEffect(() => {
		if (!supportsLiquidGlass) return
		const items = (side: 'left' | 'right'): NativeStackHeaderItem[] => handlers.current[side].flatMap((button, index): NativeStackHeaderItem[] => button ? [{
			type: 'button',
			label: button.label,
			icon: { type: 'sfSymbol', name: button.sfSymbol },
			onPress: () => { const current = handlers.current[side][index]; if (current) current.onPress() },
			accessibilityLabel: button.badge ? `${button.label} (${button.badge})` : button.label,
			...(button.badge ? { badge: { value: button.badge, style: { backgroundColor: button.badgeColor, color: '#FFFFFF' } } } : null),
		}] : [])
		const leftItems = items('left')
		const rightItems = items('right')
		navigation.setOptions({
			...(tintColor ? { headerTintColor: tintColor } : null),
			unstable_headerLeftItems: () => leftItems,
			unstable_headerRightItems: () => rightItems,
		})
	}, [navigation, key, tintColor])
}
