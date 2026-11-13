/**
 * Retiro de una cuenta de Cuba por un método conectado a EE. UU. (CCO de QvaPay, 11 nov 2026, punto 5).
 * PURO: espejo de `scripts/compliance/us-rail-rules.js` y `scripts/constants/withdraw-invoice.js` de qpweb.
 *
 * El servidor dice si la cuenta está afectada y trae las opciones y los textos (`GET /withdraw/us-rail`):
 * aquí no se copia ningún texto legal, porque el CCO todavía no los aprobó y cambiarlos no debe pedir una
 * versión de la app. Lo que sí vive aquí es qué hace falta para enviar (misma regla que `usRailMissing`
 * del servidor) y cómo se arma `us_payment`. El servidor repite cada comprobación y es el que manda.
 */

export type UsRailPayee = 'third_party' | 'own'
export type UsRailPurposeCode = 'E-1' | 'S-1' | 'E-2' | 'OTHER'

/** Respuesta de `GET /withdraw/us-rail`. */
export type UsRailRequirements = {
	applies: boolean
	enforced: boolean
	ticks: string[]
	own_account_suspended: boolean
	text_version: string
	payees: { code: UsRailPayee, label: string, suspended?: boolean, invoice_required: boolean, recipient_required: boolean }[]
	purposes: { code: UsRailPurposeCode, label: string, summary: string, needs: string[] }[]
	service_kinds: { code: string, label: string }[]
	declarations: { key: string, es: string, en: string }[]
	goods_attestation: { text_version: string, es: string, en: string }
	note_min_length: number
	invoice: { field: string, max_bytes: number }
	messages: { required: string, own_suspended: string, invoice: string }
}

/** Lo que el cliente va rellenando en el formulario. */
export type UsRailValue = {
	payee: UsRailPayee | ''
	purpose: UsRailPurposeCode | ''
	service_kind: string
	note: string
	recipient: { name: string, country: string }
	goods: { description: string, manufacturer: string, origin_country: string, end_use: string, shipping: string }
	service: { description: string }
	/** Atestación A (solo E-1): el importe y el beneficiario salen del propio retiro. */
	goodsA: { entity: string, invoice: string, endUser: string, accepted: boolean }
	attestations: Record<string, boolean>
}

/** `us_payment` tal como lo lee `POST /withdraw`. */
export type UsRailPayload = {
	payee: UsRailPayee
	purpose: UsRailPurposeCode
	attestations: Record<string, boolean>
	language: 'es' | 'en'
	service_kind?: string
	service?: { description: string }
	goods?: UsRailValue['goods']
	goods_attestation?: { entity: string, invoice: string, endUser: string, accepted: true, language: 'es' | 'en' }
	recipient?: { name: string, country: string }
	note?: string
}

/** Factura elegida con el selector de documentos. */
export type InvoiceFile = { uri: string, name: string, type: string, size?: number | null }

export const OTHER_PURPOSE = 'OTHER'
const DEFAULT_NOTE_MIN = 10

// Factura en retiros bancarios grandes, para TODAS las cuentas (el servidor la exige desde nov 2026)
export const INVOICE_REQUIRED_TICKS = ['BANK', 'BANK_EUR', 'BANK_INTL']
export const INVOICE_THRESHOLD = 3000
export const INVOICE_MAX_BYTES = 10 * 1024 * 1024

const clean = (v: unknown, max = 300) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '')
const isIso2 = (v: unknown) => typeof v === 'string' && /^[A-Z]{2}$/.test(v.trim().toUpperCase())
const upper = (tick: unknown) => String(tick || '').trim().toUpperCase()

/**
 * Formulario vacío. Las declaraciones nacen sin marcar: nunca se presume una.
 *
 * @param declarationKeys - Claves de `declarations` del servidor.
 */
export const emptyUsRailValue = (declarationKeys: string[] = []): UsRailValue => ({
	payee: '',
	purpose: '',
	service_kind: '',
	note: '',
	recipient: { name: '', country: '' },
	goods: { description: '', manufacturer: '', origin_country: '', end_use: '', shipping: '' },
	service: { description: '' },
	goodsA: { entity: '', invoice: '', endUser: '', accepted: false },
	attestations: Object.fromEntries(declarationKeys.map(k => [k, false])),
})

/** ¿Esta cuenta tiene que mandar `us_payment` para este método? */
export const usRailApplies = (req: Pick<UsRailRequirements, 'applies' | 'ticks'> | null | undefined, tick: unknown): boolean =>
	!!req?.applies && Array.isArray(req.ticks) && req.ticks.map(upper).includes(upper(tick))

/** Un nombre de al menos dos letras con una palabra de dos letras o más (el servidor descarta partículas). */
const nameOk = (v: string) => v.length >= 2 && v.split(' ').some(w => w.replace(/[^\p{L}\p{N}]/gu, '').length > 1)

/**
 * Qué falta para poder enviar, con las mismas claves que `missing` del 400 `US_RAIL_PURPOSE_REQUIRED`.
 * Vacío = completo. La cuenta propia suspendida no "falta": se bloquea aparte (`ownBlocked`).
 *
 * @param value - Formulario.
 * @param req - Requisitos del servidor (para las claves de las declaraciones y el mínimo de la nota).
 */
export const usRailMissing = (value: UsRailValue | null | undefined, req?: Pick<UsRailRequirements, 'declarations' | 'note_min_length'> | null): string[] => {
	const v = value || emptyUsRailValue()
	const missing: string[] = []
	if (!v.payee) missing.push('payee')
	if (!v.purpose) missing.push('purpose')
	if (v.purpose === 'S-1') {
		if (!v.service_kind) missing.push('service_kind')
		if (clean(v.service.description).length < 3) missing.push('service.description')
	}
	if (v.purpose === 'E-1') {
		const a = v.goodsA
		if (!(a.accepted && clean(a.entity, 160).length >= 2 && clean(a.invoice, 60).length >= 1 && clean(a.endUser, 160).length >= 2)) missing.push('goods_attestation')
	}
	if (v.purpose === 'E-1' || v.purpose === 'E-2') {
		if (clean(v.goods.description).length < 3) missing.push('goods.description')
		if (clean(v.goods.manufacturer, 160).length < 2) missing.push('goods.manufacturer')
		if (!isIso2(v.goods.origin_country)) missing.push('goods.origin_country')
		if (clean(v.goods.end_use).length < 3) missing.push('goods.end_use')
		if (clean(v.goods.shipping).length < 3) missing.push('goods.shipping')
	}
	if (v.purpose === OTHER_PURPOSE && clean(v.note).length < (req?.note_min_length || DEFAULT_NOTE_MIN)) missing.push('note')
	if (v.payee === 'third_party') {
		if (!nameOk(clean(v.recipient.name, 160))) missing.push('recipient.name')
		if (!isIso2(v.recipient.country)) missing.push('recipient.country')
	}
	const keys = (req?.declarations || []).map(d => d.key)
	const declKeys = keys.length ? keys : Object.keys(v.attestations)
	if (!declKeys.length || !declKeys.every(k => v.attestations[k] === true)) missing.push('attestations')
	return missing
}

/** La cuenta propia está suspendida y es lo elegido: no se puede continuar. */
export const ownBlocked = (value: UsRailValue | null | undefined, req: Pick<UsRailRequirements, 'own_account_suspended'> | null | undefined): boolean =>
	value?.payee === 'own' && req?.own_account_suspended !== false

export const isUsRailComplete = (value: UsRailValue | null | undefined, req?: Parameters<typeof usRailMissing>[1] & Pick<UsRailRequirements, 'own_account_suspended'> | null): boolean =>
	usRailMissing(value, req).length === 0 && !ownBlocked(value, req)

/**
 * `us_payment` listo para el servidor, solo con lo que pide el propósito elegido.
 * Devuelve null si el formulario no está completo (nunca se manda a medias).
 */
export const buildUsRailPayload = (value: UsRailValue, req: UsRailRequirements | null | undefined, language: 'es' | 'en' = 'es'): UsRailPayload | null => {
	if (!value || !value.payee || !value.purpose) return null
	if (!isUsRailComplete(value, req)) return null
	const lang = language === 'en' ? 'en' : 'es'
	const purpose = value.purpose
	const goods = purpose === 'E-1' || purpose === 'E-2'
	return {
		payee: value.payee,
		purpose,
		attestations: Object.fromEntries(Object.entries(value.attestations).map(([k, v]) => [k, v === true])),
		language: lang,
		...(purpose === 'S-1' ? { service_kind: value.service_kind, service: { description: clean(value.service.description) } } : {}),
		...(goods ? {
			goods: {
				description: clean(value.goods.description),
				manufacturer: clean(value.goods.manufacturer, 160),
				origin_country: upper(value.goods.origin_country),
				end_use: clean(value.goods.end_use),
				shipping: clean(value.goods.shipping),
			},
		} : {}),
		...(purpose === 'E-1' ? {
			goods_attestation: {
				entity: clean(value.goodsA.entity, 160),
				invoice: clean(value.goodsA.invoice, 60),
				endUser: clean(value.goodsA.endUser, 160),
				accepted: true as const,
				language: lang,
			},
		} : {}),
		...(value.payee === 'third_party' ? { recipient: { name: clean(value.recipient.name, 160), country: upper(value.recipient.country) } } : {}),
		...(purpose === OTHER_PURPOSE || clean(value.note) ? { note: clean(value.note) } : {}),
	}
}

/** Retiro bancario de $3,000 o más: factura obligatoria para cualquier cuenta. */
export const largeBankInvoiceRequired = (tick: unknown, amount: unknown): boolean =>
	INVOICE_REQUIRED_TICKS.includes(upper(tick)) && Number(amount) >= INVOICE_THRESHOLD

/** ¿Este retiro necesita la factura en PDF? */
export const invoiceRequiredFor = ({ tick, amount, usRailOn, payee }: { tick: unknown, amount: unknown, usRailOn: boolean, payee?: string | null }): boolean =>
	largeBankInvoiceRequired(tick, amount) || (usRailOn && payee === 'third_party')

/** Problema de un PDF elegido antes de mandarlo (el servidor lo vuelve a mirar por dentro). */
export const invoiceFileProblem = (file: Pick<InvoiceFile, 'name' | 'type' | 'size'> | null | undefined, maxBytes = INVOICE_MAX_BYTES): 'not_pdf' | 'too_big' | 'empty' | null => {
	if (!file) return 'empty'
	const isPdf = file.type === 'application/pdf' || String(file.name || '').toLowerCase().endsWith('.pdf')
	if (!isPdf) return 'not_pdf'
	if (typeof file.size === 'number') {
		if (file.size <= 0) return 'empty'
		if (file.size > maxBytes) return 'too_big'
	}
	return null
}

/**
 * Texto de la Atestación A con los datos del retiro (el servidor lo vuelve a escribir al certificar).
 *
 * @param template - `goods_attestation.es|en` del servidor, con huecos `{entity}`, `{amount}`, `{payee}`, `{invoice}`, `{end_user}`.
 */
export const fillGoodsAttestation = (template: string, { entity, amount, payee, invoice, endUser }: { entity?: string, amount?: number | string, payee?: string, invoice?: string, endUser?: string }): string => {
	const blank = '___'
	const money = Number(amount)
	return String(template || '')
		.replaceAll('{entity}', clean(entity, 160) || blank)
		.replaceAll('{amount}', Number.isFinite(money) && money > 0 ? money.toFixed(2) : blank)
		.replaceAll('{payee}', clean(payee, 160) || blank)
		.replaceAll('{invoice}', clean(invoice, 60) || blank)
		.replaceAll('{end_user}', clean(endUser, 160) || blank)
}

/** Códigos del servidor que piden volver al formulario de este paso. */
export type UsRailErrorKind = 'purpose' | 'invoice' | 'own' | null
export const usRailErrorKind = (code: unknown): UsRailErrorKind => {
	switch (code) {
		case 'US_RAIL_PURPOSE_REQUIRED': return 'purpose'
		case 'INVOICE_REQUIRED':
		case 'INVOICE_INVALID':
		case 'INVOICE_HAS_PAN': return 'invoice'
		case 'CU_OWN_ACCOUNT_SUSPENDED': return 'own'
		default: return null
	}
}

/** Claves que el 400 marcó como faltantes (solo strings conocidas). */
export const missingFromError = (details: unknown): string[] => {
	const missing = (details as { missing?: unknown } | null)?.missing
	return Array.isArray(missing) ? missing.filter((m): m is string => typeof m === 'string') : []
}

/**
 * Cuerpo de `POST /withdraw`: JSON normal o, con factura, multipart con el JSON en `payload`
 * y el PDF en `invoice` (es lo que lee el servidor).
 */
export const withdrawBody = (payload: Record<string, unknown>, invoice?: InvoiceFile | null): { kind: 'json', body: Record<string, unknown> } | { kind: 'multipart', parts: [string, unknown][] } => {
	if (!invoice) return { kind: 'json', body: payload }
	return {
		kind: 'multipart',
		parts: [
			['payload', JSON.stringify(payload)],
			['invoice', { uri: invoice.uri, name: invoice.name || 'factura.pdf', type: 'application/pdf' }],
		],
	}
}
