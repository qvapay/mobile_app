/**
 * Bloquear y reportar usuarios — lógica PURA (sin react-native), espejo de los
 * modales de qpweb `components/modals/{Report,Block}UserModal.js` y de las rutas
 * `app/api/user/{block,report}/route.js`.
 *
 * Contrato del backend:
 * - `GET /user/block?uuid=` → `{ blocked, blocked_by }` (yo lo bloqueé / él me bloqueó).
 * - `POST /user/block { blocked_user_uuid }` · `DELETE /user/block?uuid=`.
 * - `POST /user/report { reported_user_uuid, reason, description? }`.
 *
 * Un bloqueo en CUALQUIER sentido hace que `GET /p2p/{uuid}` y `apply` respondan 403
 * a terceros; quien ya es parte de un trato conserva el acceso (así que bloquear al
 * peer con un trato abierto no lo rompe).
 */

/** Motivos del reporte, en el orden del selector de la web. */
export const REPORT_REASONS = ['inappropriate', 'spam', 'scam', 'harassment', 'offensive', 'fake', 'other'] as const

export type ReportReason = typeof REPORT_REASONS[number]

/**
 * Lo que se GUARDA en `UserReport.reason`: los literales exactos de la web, siempre en
 * español, para que el equipo vea el mismo motivo venga del idioma que venga. La UI
 * enseña `p2p.moderation.reportSheet.reasons.<clave>`.
 */
export const REPORT_REASON_TEXT: Record<ReportReason, string> = {
	inappropriate: 'Comportamiento inapropiado',
	spam: 'Spam o publicidad no deseada',
	scam: 'Estafa o fraude',
	harassment: 'Acoso o intimidación',
	offensive: 'Contenido ofensivo',
	fake: 'Cuenta falsa o suplantación',
	other: 'Otro',
}

/** Tope del texto libre (la columna es TEXT; el tope es de UX, no del servidor). */
export const REPORT_DESCRIPTION_MAX = 500

export type ReportForm = {
	reason: ReportReason | null
	description: string
}

export type ReportPayload = {
	reported_user_uuid: string
	reason: string
	description?: string
}

/** Payload de `POST /user/report`; null sin motivo (el botón va deshabilitado, esto es el cinturón). */
export const buildReportPayload = (uuid: string, form: ReportForm): ReportPayload | null => {
	if (!form.reason || !REPORT_REASON_TEXT[form.reason]) return null
	const description = form.description.trim().slice(0, REPORT_DESCRIPTION_MAX)
	return {
		reported_user_uuid: uuid,
		reason: REPORT_REASON_TEXT[form.reason],
		...(description ? { description } : {}),
	}
}

export type BlockStatus = {
	/** Yo lo tengo bloqueado. */
	blocked: boolean
	/** Él me tiene bloqueado. */
	blockedBy: boolean
}

export const NO_BLOCK: BlockStatus = { blocked: false, blockedBy: false }

/** `{ blocked, blocked_by }` del servidor → camelCase; cualquier cosa rara = sin bloqueo. */
export const parseBlockStatus = (payload: unknown): BlockStatus => {
	const p = (payload && typeof payload === 'object' ? payload : {}) as Record<string, unknown>
	return { blocked: p.blocked === true, blockedBy: p.blocked_by === true }
}

type ApiOutcome = { success: boolean, status?: number, error?: string }

/**
 * El backend no manda códigos, solo prosa: un 400 «ya está bloqueado» al bloquear o un
 * 404 «no estaba bloqueado» al desbloquear dicen que el estado que queríamos YA es el
 * real (doble toque, otra sesión), y eso es un éxito, no un error.
 */
export const blockOutcome = (want: 'blocked' | 'unblocked', result: ApiOutcome): 'done' | 'failed' => {
	if (result.success) return 'done'
	const message = (result.error ?? '').toLowerCase()
	if (want === 'blocked' && result.status === 400 && message.includes('ya está bloqueado')) return 'done'
	if (want === 'unblocked' && result.status === 404 && message.includes('no estaba bloqueado')) return 'done'
	return 'failed'
}

/** El 403 de `GET /p2p/{uuid}` y de `apply` cuando hay bloqueo entre los dos (prosa del servidor). */
export const isBlockRestrictionError = (message: unknown): boolean =>
	typeof message === 'string' && /bloqueo entre usuarios/i.test(message)
