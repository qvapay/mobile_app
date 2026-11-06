/**
 * Comprobantes de un trato P2P: reglas PURAS (sin react-native), espejo de la parte que le toca
 * a la app de `scripts/p2p/attachment-rules.js` de qpweb. El servidor es quien decide; esto solo
 * evita peticiones que van a fallar (`/paid` gasta su rate limit también con un 400).
 */

export const ATTACHMENT_FILE_PREFIX = 'p2p-att-'

/** Tope de reserva si la lista aún no llegó. El real viene en `limits.max_bytes`. */
export const ATTACHMENT_DEFAULT_MAX_BYTES = 4 * 1024 * 1024

const VISIBLE_STATUSES = ['processing', 'paid', 'revision', 'completed']
const PDF_MIME = 'application/pdf'

/** Sin orden elegida en una oferta por rango no hay trato: cada orden lleva los suyos. */
export const canShowAttachments = ({ isFlexibleOverview, isPayer, isReceiver, status }: { isFlexibleOverview: boolean, isPayer: boolean, isReceiver: boolean, status?: string | null }) =>
	!isFlexibleOverview && (isPayer || isReceiver) && VISIBLE_STATUSES.includes(status ?? '')

/** «He pagado» con el ID o, si el servidor lo permite, con un comprobante propio. */
export const canSubmitMarkPaid = ({ txId, ownProofs, proofReplaces }: { txId: string, ownProofs: number, proofReplaces: boolean }) =>
	txId.trim().length > 0 || (proofReplaces && ownProofs > 0)

/** Aviso antifraude junto a los adjuntos. En `paid` ya lo dice la línea de tiempo, y tras completar no decide nada. */
export const proofWarningVisible = ({ isReceiver, status, fromCounterparty }: { isReceiver: boolean, status?: string | null, fromCounterparty: boolean }) =>
	isReceiver && fromCounterparty && (status === 'processing' || status === 'revision')

/** → motivo por el que no vale subirlo, o null. Sin tamaño conocido decide el servidor. */
export const attachmentFileIssue = ({ size, type, name }: { size?: number | null, type?: string | null, name?: string | null }, maxBytes: number) => {
	if (size && size > maxBytes) return 'tooLarge'
	const mime = (type ?? '').toLowerCase()
	const isPdf = mime === PDF_MIME || (name ?? '').toLowerCase().endsWith('.pdf')
	if (mime && !mime.startsWith('image/') && !isPdf) return 'type'
	return null
}

/** Código de error del servidor → sufijo de `p2p.attachments.toasts.*`. */
const ERROR_KEYS: Record<string, string> = {
	ATTACHMENT_TOO_LARGE: 'tooLarge',
	ATTACHMENT_TYPE: 'type',
	ATTACHMENT_LIMIT: 'limit',
	ATTACHMENT_STATE: 'state',
	ATTACHMENTS_UNAVAILABLE: 'unavailable',
	RATE_LIMITED: 'rateLimited',
}

export const attachmentErrorKey = (code?: string | null) => ERROR_KEYS[code ?? ''] ?? 'uploadFailed'

export const attachmentFileName = (uuid: string, mime: string) => `${ATTACHMENT_FILE_PREFIX}${uuid}.${mime === PDF_MIME ? 'pdf' : 'jpg'}`

/** Bytes → «240 KB» / «1.5 MB». Sin decimales por debajo de 1 MB. */
export const formatAttachmentSize = (bytes: number) => bytes < 1024 * 1024
	? `${Math.max(1, Math.round(bytes / 1024))} KB`
	: `${(bytes / (1024 * 1024)).toFixed(1)} MB`
