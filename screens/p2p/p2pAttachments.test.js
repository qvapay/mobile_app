/**
 * @jest-environment node
 */
import {
	ATTACHMENT_FILE_PREFIX,
	attachmentErrorKey,
	attachmentFileIssue,
	attachmentFileName,
	canShowAttachments,
	canSubmitMarkPaid,
	formatAttachmentSize,
} from './p2pAttachments'

const MAX = 4 * 1024 * 1024

describe('canShowAttachments', () => {
	const base = { isFlexibleOverview: false, isPayer: true, isReceiver: false, status: 'processing' }

	it('se ve para las dos partes durante el trato y al terminar', () => {
		for (const status of ['processing', 'paid', 'revision', 'completed']) {
			expect(canShowAttachments({ ...base, status })).toBe(true)
		}
		expect(canShowAttachments({ ...base, isPayer: false, isReceiver: true })).toBe(true)
	})

	it('un tercero no', () => {
		expect(canShowAttachments({ ...base, isPayer: false })).toBe(false)
	})

	it('sin trato tampoco', () => {
		for (const status of ['open', 'cancelled', undefined, null]) {
			expect(canShowAttachments({ ...base, status })).toBe(false)
		}
	})

	it('la vista general de una oferta por rango no tiene comprobantes: van por orden', () => {
		expect(canShowAttachments({ ...base, isFlexibleOverview: true })).toBe(false)
	})
})

describe('canSubmitMarkPaid', () => {
	it('con el ID basta, aunque el servidor no acepte comprobantes', () => {
		expect(canSubmitMarkPaid({ txId: 'REF-1', ownProofs: 0, proofReplaces: false })).toBe(true)
	})

	it('un ID de espacios no cuenta', () => {
		expect(canSubmitMarkPaid({ txId: '   ', ownProofs: 0, proofReplaces: true })).toBe(false)
	})

	it('el comprobante propio basta solo si el servidor lo permite', () => {
		expect(canSubmitMarkPaid({ txId: '', ownProofs: 1, proofReplaces: true })).toBe(true)
		expect(canSubmitMarkPaid({ txId: '', ownProofs: 1, proofReplaces: false })).toBe(false)
	})

	it('sin nada no se puede', () => {
		expect(canSubmitMarkPaid({ txId: '', ownProofs: 0, proofReplaces: true })).toBe(false)
	})
})

describe('attachmentFileIssue', () => {
	it('acepta imágenes y PDF', () => {
		expect(attachmentFileIssue({ size: 1000, type: 'image/jpeg' }, MAX)).toBeNull()
		expect(attachmentFileIssue({ size: 1000, type: 'application/pdf' }, MAX)).toBeNull()
	})

	it('un PDF con tipo genérico se reconoce por la extensión', () => {
		expect(attachmentFileIssue({ size: 1000, type: 'application/octet-stream', name: 'Recibo.PDF' }, MAX)).toBeNull()
	})

	it('rechaza lo que supera el tope que manda el servidor', () => {
		expect(attachmentFileIssue({ size: MAX + 1, type: 'image/jpeg' }, MAX)).toBe('tooLarge')
		expect(attachmentFileIssue({ size: 2000, type: 'image/jpeg' }, 1000)).toBe('tooLarge')
	})

	it('rechaza otros tipos', () => {
		expect(attachmentFileIssue({ size: 1000, type: 'text/html', name: 'recibo.html' }, MAX)).toBe('type')
	})

	it('sin datos deja que decida el servidor', () => {
		expect(attachmentFileIssue({}, MAX)).toBeNull()
	})
})

describe('attachmentErrorKey', () => {
	it('traduce los códigos del servidor', () => {
		expect(attachmentErrorKey('ATTACHMENT_TOO_LARGE')).toBe('tooLarge')
		expect(attachmentErrorKey('ATTACHMENT_TYPE')).toBe('type')
		expect(attachmentErrorKey('ATTACHMENT_LIMIT')).toBe('limit')
		expect(attachmentErrorKey('ATTACHMENT_STATE')).toBe('state')
		expect(attachmentErrorKey('ATTACHMENTS_UNAVAILABLE')).toBe('unavailable')
		expect(attachmentErrorKey('RATE_LIMITED')).toBe('rateLimited')
	})

	it('cualquier otro cae en el genérico', () => {
		expect(attachmentErrorKey('OTRO')).toBe('uploadFailed')
		expect(attachmentErrorKey(undefined)).toBe('uploadFailed')
	})
})

describe('attachmentFileName', () => {
	it('lleva el prefijo que barre la caché y la extensión del tipo', () => {
		expect(attachmentFileName('abc', 'application/pdf')).toBe(`${ATTACHMENT_FILE_PREFIX}abc.pdf`)
		expect(attachmentFileName('abc', 'image/jpeg')).toBe(`${ATTACHMENT_FILE_PREFIX}abc.jpg`)
	})
})

describe('formatAttachmentSize', () => {
	it('redondea a KB y a un decimal en MB', () => {
		expect(formatAttachmentSize(10)).toBe('1 KB')
		expect(formatAttachmentSize(245120)).toBe('239 KB')
		expect(formatAttachmentSize(1572864)).toBe('1.5 MB')
	})
})
