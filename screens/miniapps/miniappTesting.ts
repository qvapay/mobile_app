import type { MiniApp, MiniAppTesterInvite } from '../../types/domain'

/**
 * Reglas PURAS de las mini-apps en prueba (sin react-native: se testean en node).
 *
 * Una mini-app sin publicar (`draft` o `review`) la ven su dueño y los testers
 * que invitó y que aceptaron. QvaPay aún no la ha revisado, así que:
 * - no cobra: ni hoja de pago ni PIN (qpweb responde 403 `PREVIEW_NO_PAYMENTS`);
 * - no se comparte: `/apps/<slug>` solo existe para las publicadas y a cualquier
 *   otro le saldría «no encontrada»;
 * - el host enseña un aviso fijo que la mini-app no puede tapar.
 * Contrato completo en `~/.claude/plans/miniapp-testers.md`.
 */

export type PreviewRole = 'owner' | 'tester'

/**
 * Invitaciones pendientes (`GET /miniapps/invites`). Vive aquí y no solo en
 * `miniappsQueries` para que la push de invitación la invalide desde
 * `useAppNavigation` sin arrastrar el api de mini-apps.
 */
export const MINIAPPS_INVITES_KEY = ['miniapps', 'invites'] as const

type PreviewFields = Pick<MiniApp, 'preview' | 'preview_role'>

/**
 * Quién ve esta mini-app en prueba; null si está publicada. Sin `preview_role`
 * (un qpweb anterior a los testers) es del dueño: era el único que las veía.
 */
export const previewRoleOf = (app: PreviewFields | null | undefined): PreviewRole | null => {
	if (!app?.preview) return null
	return app.preview_role === 'tester' ? 'tester' : 'owner'
}

/** Solo las publicadas tienen enlace público que compartir. */
export const canShareMiniApp = (app: PreviewFields | null | undefined): boolean => !!app && !app.preview

/** En prueba no se cobra nada: QvaPay no la ha revisado. */
export const canPayInMiniApp = (app: PreviewFields | null | undefined): boolean => !!app && !app.preview

/**
 * Acceso directo en la pantalla de inicio (Android): no para quien la prueba por
 * invitación. Sería un icono fuera de QvaPay de algo que nadie ha revisado, y
 * se quedaría muerto en cuanto deje de probarla o el dueño lo quite.
 */
export const canPinMiniApp = (app: PreviewFields | null | undefined): boolean => !!app && previewRoleOf(app) !== 'tester'

/** Un tester puede dejar de probarla (el dueño no: es suya). */
export const canLeaveTesting = (app: PreviewFields | null | undefined): boolean => previewRoleOf(app) === 'tester'

/** La invitación sale de la lista en cuanto se responde (o resulta que ya no existe). */
export const withoutInvite = (invites: MiniAppTesterInvite[] | undefined, slug: string): MiniAppTesterInvite[] | undefined =>
	invites?.filter(invite => invite.slug !== slug)

/** Tras dejar de probarla, fuera del directorio al momento. */
export const withoutMiniApp = (apps: MiniApp[] | undefined, slug: string): MiniApp[] | undefined =>
	apps?.filter(app => app.slug !== slug)

/**
 * Fallo al responder una invitación. 404 (`INVITE_NOT_FOUND`) = caducó, la retiraron
 * o la mini-app ya no está en prueba: se quita de la lista. El resto (red, 5xx,
 * límite) se puede reintentar y la tarjeta se queda.
 */
export const inviteAnswerFailure = (status: number | undefined): 'gone' | 'retry' => status === 404 ? 'gone' : 'retry'

/** Quién invita, como se enseña (`@usuario`); null si el backend no lo manda. */
export const inviterLabel = (invite: Pick<MiniAppTesterInvite, 'invited_by'>): string | null => {
	const username = invite.invited_by?.username?.trim().replace(/^@/, '')
	return username ? `@${username}` : null
}
