import { useCallback, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner-native'

import i18n from '../../i18n'
import { userApi } from '../../api/userApi'
import { useUserBlockQuery, userBlockKey } from '../../hooks/useUserBlockQuery'
import { blockOutcome, buildReportPayload, NO_BLOCK } from './userModeration'
import type { BlockStatus, ReportForm } from './userModeration'
import type { P2PUser } from '../../types/domain'

/** Vista con la que se abre la hoja: el menú ⋯ o directamente una acción. */
export type ModerationView = 'menu' | 'report' | 'block' | 'unblock'

export type ModerationTarget = { user: P2PUser, view: ModerationView }

type Options = {
	/** Off para el perfil propio o sin sesión: ni se pide el estado ni se abre nada. */
	enabled?: boolean
}

/**
 * Bloquear/desbloquear y reportar a OTRO usuario: estado de bloqueo (React Query),
 * la hoja (`P2PUserModerationSheet`, una sola con vistas) y las tres acciones contra
 * `/user/block` y `/user/report`. Lo montan el perfil P2P y el trade room.
 *
 * Las acciones son mutaciones directas (no hay reintento: un doble toque se frena con
 * el ref en vuelo) y al terminar escriben la clave `['user','block',uuid]` para que el
 * banner del perfil y el menú del chat cambien a la vez. Los toasts van con `i18n.t`
 * en call time, como el resto de hooks con callbacks estables.
 */
const useUserModeration = (target: P2PUser | null | undefined, { enabled = true }: Options = {}) => {

	const queryClient = useQueryClient()
	const uuid = target?.uuid ?? null
	const status = useUserBlockQuery(uuid, enabled)
	const [sheet, setSheet] = useState<ModerationTarget | null>(null)
	const [busy, setBusy] = useState(false)
	const inFlight = useRef(false)

	const open = useCallback((view: ModerationView = 'menu') => {
		if (!target || !enabled) return
		setSheet({ user: target, view })
	}, [target, enabled])

	const close = useCallback(() => setSheet(null), [])

	const writeBlocked = useCallback(async (blocked: boolean) => {
		if (!uuid) return
		await queryClient.cancelQueries({ queryKey: userBlockKey(uuid) })
		queryClient.setQueryData<BlockStatus>(userBlockKey(uuid), prev => ({ blocked, blockedBy: prev?.blockedBy ?? false }))
		await queryClient.invalidateQueries({ queryKey: ['p2p', 'user', uuid] })
	}, [queryClient, uuid])

	const run = useCallback(async (job: () => Promise<boolean>) => {
		if (inFlight.current) return
		inFlight.current = true
		setBusy(true)
		try {
			const ok = await job()
			if (ok) setSheet(null)
		} finally {
			inFlight.current = false
			setBusy(false)
		}
	}, [])

	const block = useCallback(() => run(async () => {
		if (!uuid) return false
		const result = await userApi.blockUser(uuid)
		if (!result.success && blockOutcome('blocked', result) === 'failed') { toast.error(result.error ?? i18n.t('api.user.blockFailed')); return false }
		await writeBlocked(true)
		toast.success(i18n.t('p2p.moderation.toasts.blocked'))
		return true
	}), [run, uuid, writeBlocked])

	const unblock = useCallback(() => run(async () => {
		if (!uuid) return false
		const result = await userApi.unblockUser(uuid)
		if (!result.success && blockOutcome('unblocked', result) === 'failed') { toast.error(result.error ?? i18n.t('api.user.unblockFailed')); return false }
		await writeBlocked(false)
		toast.success(i18n.t('p2p.moderation.toasts.unblocked'))
		return true
	}), [run, uuid, writeBlocked])

	const report = useCallback((form: ReportForm) => run(async () => {
		if (!uuid) return false
		const payload = buildReportPayload(uuid, form)
		if (!payload) return false
		const result = await userApi.reportUser(payload)
		if (!result.success) { toast.error(result.error ?? i18n.t('api.user.reportFailed')); return false }
		toast.success(i18n.t('p2p.moderation.toasts.reported'))
		return true
	}), [run, uuid])

	const current = status.data ?? NO_BLOCK

	return {
		/** Yo lo tengo bloqueado. */
		blocked: current.blocked,
		/** Él me tiene bloqueado. */
		blockedBy: current.blockedBy,
		/** Hoja abierta (usuario + vista) o null. */
		sheet,
		open,
		close,
		busy,
		block,
		unblock,
		report,
	}
}

export default useUserModeration
