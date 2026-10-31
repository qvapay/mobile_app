import type { FontAwesome6SolidIconName } from '@react-native-vector-icons/fontawesome6'

import type { HeaderIcon } from '../../miniapps/protocol'

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
