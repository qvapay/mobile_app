import { useCallback, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner-native'

import { miniappsApi } from '../../api/miniappsApi'
import { settleInvite, forgetTesting } from './miniappsQueries'
import { inviteAnswerFailure } from './miniappTesting'
import type { MiniApp, MiniAppTesterInvite } from '../../types/domain'

/**
 * Acciones del tester de una mini-app sin publicar: responder la invitación
 * (catálogo) y dejar de probarla (menú ⋯ del host y pulsación larga).
 * Llamadas directas + caché, como el resto de mutaciones de mini-apps.
 *
 * Una respuesta a la vez: dos toques seguidos en «Probar» no mandan dos
 * peticiones (`pending` = la respuesta en vuelo, para pintar su botón cargando).
 */
export default function useMiniAppTesting() {

	const { t } = useTranslation()
	const queryClient = useQueryClient()
	const inFlightRef = useRef(false)
	const [pending, setPending] = useState<{ slug: string, accept: boolean } | null>(null)

	/** @returns true si quedó respondida como se pidió (aceptada o rechazada). */
	const answer = useCallback(async (invite: MiniAppTesterInvite, accept: boolean): Promise<boolean> => {
		if (inFlightRef.current) return false
		inFlightRef.current = true
		setPending({ slug: invite.slug, accept })
		try {
			const result = await miniappsApi.answerInvite(invite.slug, accept)
			if (result.success) {
				settleInvite(queryClient, invite.slug)
				if (!accept) toast(t('miniapps.testing.declined', { name: invite.name }))
				return true
			}
			if (inviteAnswerFailure(result.status) === 'gone') {
				settleInvite(queryClient, invite.slug)
				toast.error(t('miniapps.testing.inviteGone'))
			} else {
				toast.error(t('miniapps.errors.answerInvite'), { description: result.error })
			}
			return false
		} finally {
			inFlightRef.current = false
			setPending(null)
		}
	}, [queryClient, t])

	/**
	 * Dejar de probarla. Un 404 (la mini-app ya no existe) también cuenta como hecho.
	 * @returns true si ya no la prueba.
	 */
	const leave = useCallback(async (app: Pick<MiniApp, 'slug' | 'name'>): Promise<boolean> => {
		const result = await miniappsApi.leaveTesting(app.slug)
		if (result.success || result.status === 404) {
			forgetTesting(queryClient, app.slug)
			toast.success(t('miniapps.testing.left', { name: app.name }))
			return true
		}
		toast.error(t('miniapps.errors.leaveTesting'), { description: result.error })
		return false
	}, [queryClient, t])

	return { answer, leave, pending }
}
