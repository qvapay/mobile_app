import { useLayoutEffect, useRef } from 'react'
import { useWindowDimensions } from 'react-native'
import { useTranslation } from 'react-i18next'
import type { NativeStackHeaderItem, NativeStackNavigationProp } from '@react-navigation/native-stack'

import { useTheme } from '../../theme/ThemeContext'
import { headerBadgeText, type HeaderAction } from '../../miniapps/protocol'
import type { RootStackParamList } from '../../types/navigation'
import { HEADER_ICON_SF_SYMBOLS, type SfSymbolName } from './headerIcons'
import MiniAppHeaderTitle from './MiniAppHeaderTitle'

/** Entrada del menú ⋯ nativo (UIMenu). Solo datos: el toque llega por `onMenu(key)`. */
export type NativeMenuEntry<K extends string> = { key: K, label: string, sfSymbol: SfSymbolName, destructive?: boolean }

type Options<K extends string> = {
	/** `supportsLiquidGlass`: fuera de iOS 26+ la barra la pinta MiniAppHost en JS. */
	enabled: boolean
	backMode: 'app' | 'history' | 'close'
	title: string
	icon: string | null
	subtitle: string
	actions: HeaderAction[]
	/** Color de la barra puesto por la mini-app (`ui.colors.set`) y su tinta; null = tema. */
	headerColor: string | null
	headerInk: string | null
	menu: NativeMenuEntry<K>[]
	menuDisabled: boolean
	onBack: () => void
	onAction: (id: string) => void
	onMenu: (key: K) => void
}

// Medidas de la barra de iOS 26/27 para dar al título un ANCHO FIJO: los items `custom` se
// colocan con Auto Layout a partir del tamaño que llega de Yoga, y uno que cambia de ancho (al
// llegar el subtítulo, por ejemplo) hace que UIKit recoloque la barra con un brinco.
//
// El ancho tiene que quedar POR DEBAJO de lo que cabe: react-native-screens le pone al item
// custom resistencia a la compresión `required`, y en iOS 27, si no cabe, UIKit no lo encoge:
// TIRA el grupo entero de la izquierda (cerrar incluido; la mini-app se quedaba solo con el ⋯),
// y si sobra ancho a costa de la derecha, tira las acciones de la mini-app. Medido el 2026-11-01
// con una app UIKit de prueba en un iPhone de 440 pt: con cerrar + ⋯ el máximo que cabe son
// 288 pt = 440 − 2·20 − 2·(44 + 12); cada botón cuesta 44 + 12 de hueco.
const BAR_MARGIN = 20
const BAR_BUTTON = 44
const ITEM_GAP = 12
const SAFETY = 8
// Antes que perder el botón de cerrar, el nombre se trunca
const MIN_TITLE = 60

/**
 * Barra de la mini-app con los items nativos del header en iOS 26+, los de liquid glass: el
 * botón de cerrar/atrás y las acciones son botones del sistema (SF Symbols, badge nativo) y el
 * ⋯ un UIMenu. El título (logo, nombre registrado y subtítulo) va a la izquierda como item
 * `custom` sin fondo. Mismo estado y mismos manejadores que la barra propia de MiniAppHost.
 *
 * Los manejadores viajan por un ref: con ellos en las deps, `setOptions` se dispararía en
 * cada render de la pantalla.
 */
export function useNativeMiniAppHeader<K extends string>(
	navigation: Pick<NativeStackNavigationProp<RootStackParamList, 'MiniAppHost'>, 'setOptions'>,
	options: Options<K>,
) {
	const { t } = useTranslation()
	const { theme } = useTheme()
	const { width: windowWidth } = useWindowDimensions()

	const { enabled, backMode, title, icon, subtitle, headerColor, headerInk, menuDisabled, onBack, onAction, onMenu } = options
	const handlers = useRef({ onBack, onAction, onMenu })
	useLayoutEffect(() => { handlers.current = { onBack, onAction, onMenu } })

	// Claves estables: el padre recrea los arrays en cada render
	const actionsKey = JSON.stringify(options.actions)
	const menuKey = JSON.stringify(options.menu)
	// La barra nativa ya es opaca con el fondo del tema (stackScreenOptions de App.tsx);
	// teñirla es cambiar ese color. `headerTintColor` pinta los SF Symbols de los items
	const barColor = headerColor ?? theme.colors.background
	const tintColor = headerInk ?? theme.colors.primaryText
	const badgeStyle = headerColor && headerInk
		? { backgroundColor: headerInk, color: headerColor }
		: { backgroundColor: theme.colors.primary, color: '#FFFFFF' }
	const badgeKey = JSON.stringify(badgeStyle)

	useLayoutEffect(() => {
		if (!enabled) return
		const actions: HeaderAction[] = JSON.parse(actionsKey)
		const menu: NativeMenuEntry<K>[] = JSON.parse(menuKey)
		const isClose = backMode === 'close'
		const buttons = actions.length + 2 // cerrar/atrás + acciones + ⋯
		const titleWidth = Math.max(MIN_TITLE, windowWidth - 2 * BAR_MARGIN - buttons * (BAR_BUTTON + ITEM_GAP) - SAFETY)

		const left: NativeStackHeaderItem[] = [
			{
				type: 'button',
				label: isClose ? t('common.actions.close') : t('common.actions.back'),
				icon: { type: 'sfSymbol', name: isClose ? 'xmark' : 'chevron.left' },
				onPress: () => handlers.current.onBack(),
			},
			{
				type: 'custom',
				element: <MiniAppHeaderTitle name={title} icon={icon} subtitle={subtitle} ink={headerInk} style={{ width: titleWidth }} />,
				hidesSharedBackground: true,
			},
		]

		const right: NativeStackHeaderItem[] = [
			...actions.map((action): NativeStackHeaderItem => {
				const badge = headerBadgeText(action.badge)
				return {
					type: 'button',
					label: action.label,
					icon: { type: 'sfSymbol', name: HEADER_ICON_SF_SYMBOLS[action.icon] },
					onPress: () => handlers.current.onAction(action.id),
					accessibilityLabel: badge ? `${action.label} (${badge})` : action.label,
					...(badge ? { badge: { value: badge, style: JSON.parse(badgeKey) } } : null),
				}
			}),
			{
				type: 'menu',
				label: t('miniapps.host.menu'),
				icon: { type: 'sfSymbol', name: 'ellipsis' },
				disabled: menuDisabled,
				menu: {
					items: menu.map(entry => ({
						type: 'action' as const,
						label: entry.label,
						icon: { type: 'sfSymbol' as const, name: entry.sfSymbol },
						destructive: entry.destructive,
						onPress: () => handlers.current.onMenu(entry.key),
					})),
				},
			},
		]

		navigation.setOptions({
			headerStyle: { backgroundColor: barColor },
			headerTintColor: tintColor,
			unstable_headerLeftItems: () => left,
			unstable_headerRightItems: () => right,
		})
	}, [enabled, navigation, backMode, title, icon, subtitle, headerInk, barColor, tintColor, badgeKey, actionsKey, menuKey, menuDisabled, windowWidth, t])
}
