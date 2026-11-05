/**
 * Manifiesto de Novedades por versión. Cada entrada es lo que se enseña UNA vez
 * tras actualizar a esa versión (`screens/whatsnew/WhatsNew`); `whatsNewGate`
 * elige cuál. Copy en i18n (`whatsnew.<versión>.<slide>.*`, los 3 idiomas); el
 * héroe es una clave que resuelve `whatsnew/heroes` (nada de componentes aquí:
 * este módulo es puro y lo importa la reconciliación de navegación).
 *
 * Añadir una versión = una entrada aquí + sus claves en `whatsnew.json`. Sin
 * entrada, la versión no enseña nada.
 */
import { ROUTES } from '../routes'
import type { FontAwesome6SolidIconName } from '@react-native-vector-icons/fontawesome6'

export type WhatsNewHero =
	| { kind: 'lightning' }
	| { kind: 'icon', icon: FontAwesome6SolidIconName, tint?: string }

export type WhatsNewSlide = {
	key: string
	hero: WhatsNewHero
	titleKey: string
	bodyKey: string
	/** Botón de la última slide: abre la función (ruta raíz + params). */
	cta?: { labelKey: string, target: { route: string, params?: Record<string, unknown> } }
}

export type WhatsNewRelease = { version: string, slides: WhatsNewSlide[] }

export const RELEASES: WhatsNewRelease[] = [
	{
		version: '3.10.0',
		slides: [
			{
				key: 'ssnDeposit',
				hero: { kind: 'icon', icon: 'id-card-clip' },
				titleKey: 'whatsnew.v3_10_0.ssnDeposit.title',
				bodyKey: 'whatsnew.v3_10_0.ssnDeposit.body',
				cta: { labelKey: 'whatsnew.v3_10_0.ssnDeposit.cta', target: { route: ROUTES.SETTINGS_STACK, params: { screen: ROUTES.USERDATA, initial: false } } },
			},
		],
	},
	{
		version: '3.9.0',
		slides: [
			{
				key: 'viaP2P',
				hero: { kind: 'icon', icon: 'arrow-right-arrow-left' },
				titleKey: 'whatsnew.v3_9_0.viaP2P.title',
				bodyKey: 'whatsnew.v3_9_0.viaP2P.body',
				cta: { labelKey: 'whatsnew.v3_9_0.viaP2P.cta', target: { route: ROUTES.ADD, params: { preselectedCoin: 'ETECSA' } } },
			},
		],
	},
	{
		version: '3.8.0',
		slides: [
			{
				key: 'lightningAddress',
				hero: { kind: 'lightning' },
				titleKey: 'whatsnew.v3_8_0.lightningAddress.title',
				bodyKey: 'whatsnew.v3_8_0.lightningAddress.body',
			},
			{
				key: 'receiveAnywhere',
				hero: { kind: 'icon', icon: 'qrcode' },
				titleKey: 'whatsnew.v3_8_0.receiveAnywhere.title',
				bodyKey: 'whatsnew.v3_8_0.receiveAnywhere.body',
			},
			{
				key: 'satsOrUsd',
				hero: { kind: 'icon', icon: 'arrows-rotate', tint: '#F7931A' },
				titleKey: 'whatsnew.v3_8_0.satsOrUsd.title',
				bodyKey: 'whatsnew.v3_8_0.satsOrUsd.body',
				cta: { labelKey: 'whatsnew.v3_8_0.satsOrUsd.cta', target: { route: ROUTES.SETTINGS_STACK, params: { screen: ROUTES.LIGHTNING_ADDRESS, initial: false } } },
			},
		],
	},
]
