import type { FontAwesome6SolidIconName } from '@react-native-vector-icons/fontawesome6'
import type { NativeStackHeaderItemButton } from '@react-navigation/native-stack'

import type { HeaderIcon } from '../../miniapps/protocol'

/** Nombre de un SF Symbol que acepta un item nativo del header (el tipo lo trae native-stack). */
export type SfSymbolName = Extract<NonNullable<NativeStackHeaderItemButton['icon']>, { type: 'sfSymbol' }>['name']

/**
 * Glifo nativo de cada icono del catálogo público `HEADER_ICONS`. El `Record`
 * obliga a cubrir TODOS los nombres: añadir uno al protocolo sin su glifo no
 * compila. Su espejo en el simulador de qpweb es `HEADER_ICONS` de
 * `components/dev/miniapp/Simulator.js` (Lineicons).
 */
export const HEADER_ICON_GLYPHS: Record<HeaderIcon, FontAwesome6SolidIconName> = {
	cart: 'cart-shopping',
	search: 'magnifying-glass',
	filter: 'filter',
	sort: 'arrow-down-wide-short',
	share: 'share-nodes',
	heart: 'heart',
	star: 'star',
	bookmark: 'bookmark',
	bell: 'bell',
	user: 'user',
	settings: 'gear',
	help: 'circle-question',
	plus: 'plus',
	edit: 'pen',
	chat: 'comment',
	calendar: 'calendar-days',
	wallet: 'wallet',
	ticket: 'ticket',
	home: 'house',
	location: 'location-dot',
	refresh: 'rotate-right',
}

/**
 * SF Symbol de cada icono del catálogo para la barra nativa de iOS 26+ (botones de liquid glass,
 * `useNativeMiniAppHeader`). Contorno, como los de las barras del sistema. Mismo `Record`: un
 * icono nuevo del protocolo sin su símbolo no compila.
 */
export const HEADER_ICON_SF_SYMBOLS: Record<HeaderIcon, SfSymbolName> = {
	cart: 'cart',
	search: 'magnifyingglass',
	filter: 'line.3.horizontal.decrease',
	sort: 'arrow.up.arrow.down',
	share: 'square.and.arrow.up',
	heart: 'heart',
	star: 'star',
	bookmark: 'bookmark',
	bell: 'bell',
	user: 'person',
	settings: 'gearshape',
	help: 'questionmark.circle',
	plus: 'plus',
	edit: 'pencil',
	chat: 'bubble.left',
	calendar: 'calendar',
	wallet: 'wallet.bifold',
	ticket: 'ticket',
	home: 'house',
	location: 'mappin.and.ellipse',
	refresh: 'arrow.clockwise',
}
