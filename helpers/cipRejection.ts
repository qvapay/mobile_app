/**
 * Aviso del rechazo `403 CIP_REQUIRED` (ver `helpers/cipRequirement.ts`): un toast con lo
 * que falta y un botón que lleva a Ajustes → Datos personales. Sin hooks, para que lo
 * puedan llamar también los hooks de identidad calibrada (trade del P2P, swap).
 */

import { toast } from 'sonner-native'

import i18n, { getDateLocale } from '../i18n'
import { cipNoticeCopy, isCipRequiredError } from './cipRequirement'
import type { CipGateAction } from './cipRequirement'

/**
 * Si `details` es el rechazo de la ficha CIP, lo avisa y devuelve true.
 *
 * @param details - Cuerpo del error (`ApiResult.details`).
 * @param action - La salida que se intentaba.
 * @param onComplete - Abre Datos personales (botón del toast).
 */
export function notifyCipRequired(details: unknown, action: CipGateAction, onComplete: () => void): boolean {
	if (!isCipRequiredError(details)) { return false }
	const { missing } = details as { missing?: unknown }
	const { title, body } = cipNoticeCopy({ action, blocking: true, missing }, (key, params) => i18n.t(key, params), getDateLocale())
	toast.error(title, {
		description: body,
		duration: 8000,
		action: { label: i18n.t('ui.cipNotice.cta'), onClick: onComplete },
	})
	return true
}
