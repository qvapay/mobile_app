/**
 * Cuenta de Cuba por un método de EE. UU. — espejo de `usRailMissing` / `normalizeUsRailPayload`
 * de qpweb (scripts/compliance/us-rail-rules.js): mismas claves de `missing`, mismo payload.
 * @jest-environment node
 */
import {
	emptyUsRailValue, usRailApplies, usRailMissing, ownBlocked, isUsRailComplete, buildUsRailPayload,
	largeBankInvoiceRequired, invoiceRequiredFor, invoiceFileProblem, fillGoodsAttestation,
	usRailErrorKind, missingFromError, withdrawBody, INVOICE_MAX_BYTES,
} from './usRail'

const KEYS = ['notProhibitedOfficial', 'notProhibitedPartyMember', 'notRestrictedList', 'lawfulPurpose']
const REQ = {
	applies: true,
	enforced: true,
	ticks: ['BANK', 'BANK_INTL', 'BANK_EUR', 'BANK_LATAM', 'PAYPAL', 'VENMO', 'ZELLE', 'CASHAPP', 'APPLECASH', 'WISE'],
	own_account_suspended: true,
	declarations: KEYS.map(key => ({ key, es: 'x', en: 'y' })),
	note_min_length: 10,
}
const allChecked = () => Object.fromEntries(KEYS.map(k => [k, true]))
const base = (patch = {}) => ({ ...emptyUsRailValue(KEYS), attestations: allChecked(), ...patch })

describe('usRailApplies', () => {
	test('solo con applies y un método de la lista (sin mayúsculas)', () => {
		expect(usRailApplies(REQ, 'paypal')).toBe(true)
		expect(usRailApplies(REQ, 'BANK_CUP')).toBe(false)
		expect(usRailApplies({ ...REQ, applies: false }, 'PAYPAL')).toBe(false)
		expect(usRailApplies(null, 'PAYPAL')).toBe(false)
	})
})

describe('usRailMissing', () => {
	test('vacío: falta lo básico', () => {
		expect(usRailMissing(emptyUsRailValue(KEYS), REQ)).toEqual(['payee', 'purpose', 'attestations'])
	})

	test('S-1 a un tercero: tipo, descripción y destinatario', () => {
		const v = base({ payee: 'third_party', purpose: 'S-1' })
		expect(usRailMissing(v, REQ)).toEqual(['service_kind', 'service.description', 'recipient.name', 'recipient.country'])
		const ok = base({ payee: 'third_party', purpose: 'S-1', service_kind: 'software', service: { description: 'Licencia anual' }, recipient: { name: 'Vendor Inc', country: 'US' } })
		expect(usRailMissing(ok, REQ)).toEqual([])
	})

	test('E-1: Atestación A y los cinco datos de la mercancía', () => {
		const v = base({ payee: 'third_party', purpose: 'E-1', recipient: { name: 'Vendor Inc', country: 'US' } })
		expect(usRailMissing(v, REQ)).toEqual(['goods_attestation', 'goods.description', 'goods.manufacturer', 'goods.origin_country', 'goods.end_use', 'goods.shipping'])
		const filled = base({
			payee: 'third_party', purpose: 'E-1', recipient: { name: 'Vendor Inc', country: 'US' },
			goodsA: { entity: 'Mi Mipyme', invoice: 'INV-1', endUser: 'Mi Mipyme', accepted: true },
			goods: { description: 'Paneles solares', manufacturer: 'Acme', origin_country: 'US', end_use: 'Mi negocio', shipping: 'DHL 123' },
		})
		expect(usRailMissing(filled, REQ)).toEqual([])
		expect(usRailMissing({ ...filled, goodsA: { ...filled.goodsA, accepted: false } }, REQ)).toEqual(['goods_attestation'])
	})

	test('E-2 pide la mercancía pero no la Atestación A', () => {
		const v = base({ payee: 'third_party', purpose: 'E-2', recipient: { name: 'Shop', country: 'US' }, goods: { description: 'Ropa', manufacturer: 'Acme', origin_country: 'us', end_use: 'Personal', shipping: 'USPS' } })
		expect(usRailMissing(v, REQ)).toEqual([])
	})

	test('OTHER necesita la nota con el mínimo del servidor', () => {
		const v = base({ payee: 'third_party', purpose: 'OTHER', recipient: { name: 'Juan Perez', country: 'MX' }, note: 'corto' })
		expect(usRailMissing(v, REQ)).toEqual(['note'])
		expect(usRailMissing({ ...v, note: 'Pago de un curso en línea' }, REQ)).toEqual([])
	})

	test('las cuatro declaraciones, todas', () => {
		const v = base({ payee: 'third_party', purpose: 'OTHER', recipient: { name: 'Juan Perez', country: 'MX' }, note: 'Pago de un curso en línea' })
		expect(usRailMissing({ ...v, attestations: { ...allChecked(), lawfulPurpose: false } }, REQ)).toEqual(['attestations'])
	})

	test('un nombre de una letra no vale como destinatario', () => {
		const v = base({ payee: 'third_party', purpose: 'OTHER', recipient: { name: 'J', country: 'US' }, note: 'Pago de un curso en línea' })
		expect(usRailMissing(v, REQ)).toEqual(['recipient.name'])
	})
})

describe('cuenta propia', () => {
	test('suspendida bloquea aunque el formulario esté completo', () => {
		const v = base({ payee: 'own', purpose: 'S-1', service_kind: 'internet', service: { description: 'Mi plan' } })
		expect(usRailMissing(v, REQ)).toEqual([])
		expect(ownBlocked(v, REQ)).toBe(true)
		expect(isUsRailComplete(v, REQ)).toBe(false)
		expect(isUsRailComplete(v, { ...REQ, own_account_suspended: false })).toBe(true)
	})
})

describe('buildUsRailPayload', () => {
	test('S-1 a un tercero: solo lo que pide el propósito', () => {
		const v = base({ payee: 'third_party', purpose: 'S-1', service_kind: 'software', service: { description: '  Licencia   anual ' }, recipient: { name: 'Vendor Inc', country: 'us' }, goods: { description: 'no viaja', manufacturer: '', origin_country: '', end_use: '', shipping: '' } })
		expect(buildUsRailPayload(v, REQ, 'es')).toEqual({
			payee: 'third_party',
			purpose: 'S-1',
			attestations: allChecked(),
			language: 'es',
			service_kind: 'software',
			service: { description: 'Licencia anual' },
			recipient: { name: 'Vendor Inc', country: 'US' },
		})
	})

	test('E-1 lleva la Atestación A con el idioma', () => {
		const v = base({
			payee: 'third_party', purpose: 'E-1', recipient: { name: 'Vendor Inc', country: 'US' },
			goodsA: { entity: 'Mi Mipyme', invoice: 'INV-1', endUser: 'Mi Mipyme', accepted: true },
			goods: { description: 'Paneles solares', manufacturer: 'Acme', origin_country: 'US', end_use: 'Mi negocio', shipping: 'DHL 123' },
		})
		const p = buildUsRailPayload(v, REQ, 'en')
		expect(p.goods_attestation).toEqual({ entity: 'Mi Mipyme', invoice: 'INV-1', endUser: 'Mi Mipyme', accepted: true, language: 'en' })
		expect(p.goods.origin_country).toBe('US')
		expect(p.language).toBe('en')
	})

	test('incompleto o cuenta propia suspendida: null, nunca a medias', () => {
		expect(buildUsRailPayload(base({ payee: 'third_party' }), REQ)).toBeNull()
		expect(buildUsRailPayload(base({ payee: 'own', purpose: 'S-1', service_kind: 'internet', service: { description: 'Mi plan' } }), REQ)).toBeNull()
	})
})

describe('factura', () => {
	test('retiro bancario de $3,000 o más, para cualquier cuenta', () => {
		expect(largeBankInvoiceRequired('BANK', 3000)).toBe(true)
		expect(largeBankInvoiceRequired('bank_eur', '3500')).toBe(true)
		expect(largeBankInvoiceRequired('BANK', 2999.99)).toBe(false)
		expect(largeBankInvoiceRequired('PAYPAL', 5000)).toBe(false)
	})

	test('pago a un tercero desde Cuba, a cualquier monto', () => {
		expect(invoiceRequiredFor({ tick: 'PAYPAL', amount: 20, usRailOn: true, payee: 'third_party' })).toBe(true)
		expect(invoiceRequiredFor({ tick: 'PAYPAL', amount: 20, usRailOn: true, payee: 'own' })).toBe(false)
		expect(invoiceRequiredFor({ tick: 'PAYPAL', amount: 20, usRailOn: false, payee: 'third_party' })).toBe(false)
	})

	test('el archivo tiene que ser un PDF de 10 MB o menos', () => {
		expect(invoiceFileProblem({ name: 'f.pdf', type: 'application/pdf', size: 1000 })).toBeNull()
		expect(invoiceFileProblem({ name: 'F.PDF', type: 'application/octet-stream', size: 1000 })).toBeNull()
		expect(invoiceFileProblem({ name: 'f.jpg', type: 'image/jpeg', size: 1000 })).toBe('not_pdf')
		expect(invoiceFileProblem({ name: 'f.pdf', type: 'application/pdf', size: INVOICE_MAX_BYTES + 1 })).toBe('too_big')
		expect(invoiceFileProblem({ name: 'f.pdf', type: 'application/pdf', size: 0 })).toBe('empty')
		expect(invoiceFileProblem({ name: 'f.pdf', type: 'application/pdf', size: null })).toBeNull()
		expect(invoiceFileProblem(null)).toBe('empty')
	})
})

describe('fillGoodsAttestation', () => {
	test('rellena los huecos del texto del servidor', () => {
		const tpl = 'Declaro, en nombre de {entity}, que este pago de USD {amount} a {payee} corresponde a la factura {invoice}; el usuario final es {end_user}.'
		expect(fillGoodsAttestation(tpl, { entity: 'Mi Mipyme', amount: 250, payee: 'Vendor Inc', invoice: 'INV-1', endUser: 'Mi Mipyme' }))
			.toBe('Declaro, en nombre de Mi Mipyme, que este pago de USD 250.00 a Vendor Inc corresponde a la factura INV-1; el usuario final es Mi Mipyme.')
		expect(fillGoodsAttestation(tpl, {})).toContain('{entity}'.replace('{entity}', '___'))
	})
})

describe('errores del servidor', () => {
	test('cada código vuelve a su parte del formulario', () => {
		expect(usRailErrorKind('US_RAIL_PURPOSE_REQUIRED')).toBe('purpose')
		expect(usRailErrorKind('INVOICE_HAS_PAN')).toBe('invoice')
		expect(usRailErrorKind('INVOICE_REQUIRED')).toBe('invoice')
		expect(usRailErrorKind('CU_OWN_ACCOUNT_SUSPENDED')).toBe('own')
		expect(usRailErrorKind('KYC_REQUIRED')).toBeNull()
	})

	test('missing solo con strings', () => {
		expect(missingFromError({ missing: ['payee', 3, 'note'] })).toEqual(['payee', 'note'])
		expect(missingFromError(null)).toEqual([])
	})
})

describe('withdrawBody', () => {
	test('sin factura: JSON', () => {
		expect(withdrawBody({ amount: 10 })).toEqual({ kind: 'json', body: { amount: 10 } })
	})

	test('con factura: el JSON va en payload y el PDF en invoice', () => {
		const body = withdrawBody({ amount: 10, us_payment: { payee: 'third_party' } }, { uri: 'file:///f.pdf', name: 'f.pdf', type: 'application/pdf' })
		expect(body.kind).toBe('multipart')
		expect(body.parts[0][0]).toBe('payload')
		expect(JSON.parse(body.parts[0][1])).toEqual({ amount: 10, us_payment: { payee: 'third_party' } })
		expect(body.parts[1]).toEqual(['invoice', { uri: 'file:///f.pdf', name: 'f.pdf', type: 'application/pdf' }])
	})
})
