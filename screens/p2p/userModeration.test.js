/**
 * Bloquear y reportar usuarios: payload del reporte, estado de bloqueo y las
 * respuestas del servidor que cuentan como éxito.
 * @jest-environment node
 */
import { REPORT_REASONS, REPORT_REASON_TEXT, REPORT_DESCRIPTION_MAX, buildReportPayload, parseBlockStatus, blockOutcome, isBlockRestrictionError } from './userModeration'

test('cada motivo tiene su literal en español (lo que ve el equipo), en el orden de la web', () => {
	expect(REPORT_REASONS).toEqual(['inappropriate', 'spam', 'scam', 'harassment', 'offensive', 'fake', 'other'])
	expect(REPORT_REASONS.map(r => REPORT_REASON_TEXT[r])).toEqual([
		'Comportamiento inapropiado', 'Spam o publicidad no deseada', 'Estafa o fraude', 'Acoso o intimidación',
		'Contenido ofensivo', 'Cuenta falsa o suplantación', 'Otro',
	])
})

test('el payload manda el literal del motivo y omite la descripción vacía', () => {
	expect(buildReportPayload('u1', { reason: 'scam', description: '   ' })).toEqual({ reported_user_uuid: 'u1', reason: 'Estafa o fraude' })
	expect(buildReportPayload('u1', { reason: 'other', description: '  me pidió pagar fuera  ' })).toEqual({ reported_user_uuid: 'u1', reason: 'Otro', description: 'me pidió pagar fuera' })
})

test('sin motivo no hay payload; la descripción se recorta al tope', () => {
	expect(buildReportPayload('u1', { reason: null, description: 'x' })).toBeNull()
	expect(buildReportPayload('u1', { reason: 'nope', description: 'x' })).toBeNull()
	const long = 'a'.repeat(REPORT_DESCRIPTION_MAX + 50)
	expect(buildReportPayload('u1', { reason: 'spam', description: long }).description).toHaveLength(REPORT_DESCRIPTION_MAX)
})

test('parseBlockStatus lee blocked/blocked_by y cae a sin bloqueo con basura', () => {
	expect(parseBlockStatus({ blocked: true, blocked_by: false })).toEqual({ blocked: true, blockedBy: false })
	expect(parseBlockStatus({ blocked: false, blocked_by: true })).toEqual({ blocked: false, blockedBy: true })
	expect(parseBlockStatus(null)).toEqual({ blocked: false, blockedBy: false })
	expect(parseBlockStatus({ blocked: 'yes' })).toEqual({ blocked: false, blockedBy: false })
})

test('blockOutcome: «ya está bloqueado» y «no estaba bloqueado» son el estado deseado, el resto falla', () => {
	expect(blockOutcome('blocked', { success: true })).toBe('done')
	expect(blockOutcome('blocked', { success: false, status: 400, error: 'Este usuario ya está bloqueado' })).toBe('done')
	expect(blockOutcome('blocked', { success: false, status: 400, error: 'No puedes bloquearte a ti mismo' })).toBe('failed')
	expect(blockOutcome('unblocked', { success: false, status: 404, error: 'Este usuario no estaba bloqueado' })).toBe('done')
	expect(blockOutcome('unblocked', { success: false, status: 404, error: 'Usuario a desbloquear no encontrado' })).toBe('failed')
	expect(blockOutcome('blocked', { success: false, status: 500, error: 'Error interno del servidor' })).toBe('failed')
})

test('isBlockRestrictionError reconoce el 403 del P2P por bloqueo', () => {
	expect(isBlockRestrictionError('No tienes permisos para ver esta oferta debido a un bloqueo entre usuarios')).toBe(true)
	expect(isBlockRestrictionError('No puedes aplicar a esta oferta debido a un bloqueo entre usuarios')).toBe(true)
	expect(isBlockRestrictionError('No tienes VIP para ver esta oferta')).toBe(false)
	expect(isBlockRestrictionError(null)).toBe(false)
})
