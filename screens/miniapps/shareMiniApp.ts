import { Share } from 'react-native'
import type { TFunction } from 'i18next'

import { buildMiniAppUrl, buildMiniAppShareMessage } from './miniappLinks'
import type { MiniApp } from '../../types/domain'

/**
 * Hoja nativa de compartir con el enlace público de una mini-app
 * (`https://www.qvapay.com/apps/<slug>`): la misma pieza para el menú ⋯ del
 * host, el long-press del catálogo y `QvaPay.share()` del SDK.
 *
 * Patrón de MarketStore: iOS toma `url` como payload y Android `message`.
 * La lógica pura (URL y texto) vive en `miniappLinks.ts`.
 *
 * @param app - Mini-app a compartir (solo hacen falta `slug` y `name`).
 * @param t - Traductor reactivo de la pantalla.
 * @param text - Texto propio de la mini-app (SDK); sin él, el copy por defecto.
 * @returns `dismissed` si el usuario cerró la hoja (solo iOS lo distingue:
 *   Android devuelve siempre `sharedAction`). Lanza si la hoja no pudo abrirse.
 */
export const shareMiniApp = async (app: Pick<MiniApp, 'slug' | 'name'>, t: TFunction, text?: string): Promise<'shared' | 'dismissed'> => {
	const url = buildMiniAppUrl(app.slug)
	const result = await Share.share({
		url,
		message: buildMiniAppShareMessage({ url, text, defaultMessage: t('miniapps.share.message', { name: app.name, url }) }),
		title: t('miniapps.share.title', { name: app.name }),
	})
	return result.action === Share.dismissedAction ? 'dismissed' : 'shared'
}
