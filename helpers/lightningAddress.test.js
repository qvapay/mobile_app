/**
 * Reglas puras de la Lightning Address, con los vectores de `tests/lightning-address.test.mjs`
 * de qpweb: lo que la app adelanta tiene que coincidir con lo que el servidor rechaza.
 * @jest-environment node
 */
import {
	LN_STATE_CHANGED_CODES,
	classifyLightningInput,
	isLnAddressTransaction,
	isOwnLnAddress,
	isOwnLnurlHost,
	isSatsCreditDescription,
	lnAddressHost,
	lnErrorKey,
	lnFailureHint,
	lnNameProblem,
	lnReasonKey,
	normalizeLnName,
	skeletonOf,
	stripLightningScheme,
} from './lightningAddress'

describe('lnNameProblem', () => {

	test('nombres válidos', () => {
		for (const n of ['a.b', 'ana-maria', 'juan_23', 'erich', 'abc', 'a'.repeat(32)]) {
			expect(lnNameProblem(n)).toBeNull()
		}
	})

	test('longitud fuera de 3–32', () => {
		expect(lnNameProblem('ab')).toBe('length')
		expect(lnNameProblem('a'.repeat(33))).toBe('length')
		expect(lnNameProblem('')).toBe('length')
	})

	test('formato: separadores al borde o seguidos, mayúsculas, acentos, +', () => {
		for (const n of ['.erich', 'erich.', 'er..ich', 'er._ich', 'Erich', 'eñe', 'erich+x', 'er ich']) {
			expect(lnNameProblem(n)).toBe('format')
		}
	})

	test('reservados, también por esqueleto', () => {
		expect(lnNameProblem('admin')).toBe('reserved')
		expect(lnNameProblem('q.v.a.p.a.y')).toBe('reserved')
		expect(lnNameProblem('so-porte')).toBe('reserved')
	})

	test('normalizeLnName recorta y baja a minúsculas; skeletonOf quita separadores', () => {
		expect(normalizeLnName('  Erich ')).toBe('erich')
		expect(lnNameProblem(normalizeLnName('  Erich '))).toBeNull()
		expect(skeletonOf('a.l-i_ce')).toBe('alice')
	})
})

describe('dominios propios', () => {

	test('isOwnLnurlHost reconoce qvpay.me y qvapay.com con subdominios, puerto y punto final', () => {
		expect(isOwnLnurlHost('qvpay.me')).toBe(true)
		expect(isOwnLnurlHost('WWW.qvapay.com:443')).toBe(true)
		expect(isOwnLnurlHost('api.qvapay.com.')).toBe(true)
		expect(isOwnLnurlHost('evil-qvpay.me')).toBe(false)
		expect(isOwnLnurlHost('getalby.com')).toBe(false)
		expect(isOwnLnurlHost('')).toBe(false)
	})

	test('isOwnLnAddress solo con direcciones completas', () => {
		expect(isOwnLnAddress('erich@qvpay.me')).toBe(true)
		expect(isOwnLnAddress('lightning:erich@QVPAY.me')).toBe(true)
		expect(isOwnLnAddress('erich@getalby.com')).toBe(false)
		expect(isOwnLnAddress('erich@')).toBe(false)
		expect(lnAddressHost('erich@walletofsatoshi.com')).toBe('walletofsatoshi.com')
		expect(lnAddressHost('lnbc1...')).toBeNull()
	})
})

describe('classifyLightningInput', () => {

	test('solo clasifica destinos completos', () => {
		expect(classifyLightningInput('erich@qvpay.me')).toBe('lnaddress')
		expect(classifyLightningInput('erich+tip@qvpay.me')).toBe('lnaddress')
		expect(classifyLightningInput('lightning:erich@qvpay.me')).toBe('lnaddress')
		expect(classifyLightningInput('erich@qvpay')).toBeNull()
		expect(classifyLightningInput('erich@')).toBeNull()
		expect(classifyLightningInput('erich')).toBeNull()
	})

	test('facturas y LNURL', () => {
		expect(classifyLightningInput('lnbc210u1p3xyzabc')).toBe('bolt11')
		expect(classifyLightningInput('LIGHTNING:LNBC210U1P3XYZABC')).toBe('bolt11')
		expect(classifyLightningInput('lnurl1dp68gurn8ghj7')).toBe('lnurl')
		expect(classifyLightningInput('')).toBeNull()
		expect(classifyLightningInput('TXabc123')).toBeNull()
	})

	test('stripLightningScheme', () => {
		expect(stripLightningScheme(' lightning://erich@qvpay.me ')).toBe('erich@qvpay.me')
		expect(stripLightningScheme('lnurlp:x')).toBe('x')
	})
})

describe('marcas del historial', () => {

	test('cobros por Lightning Address, por remote_id o por descripción', () => {
		expect(isLnAddressTransaction({ remote_id: 'LNADDR_abc' })).toBe(true)
		expect(isLnAddressTransaction({ description: 'Lightning Address erich@qvpay.me: 21.000 sats' })).toBe(true)
		expect(isLnAddressTransaction({ description: 'Pago a erich' })).toBe(false)
		expect(isLnAddressTransaction(null)).toBe(false)
	})

	test('entrada en sats por el sufijo de la descripción', () => {
		expect(isSatsCreditDescription('Lightning Address erich@qvpay.me: 1250 sats (saldo en sats)')).toBe(true)
		expect(isSatsCreditDescription('Lightning Address erich@qvpay.me: 1250 sats')).toBe(false)
		expect(isSatsCreditDescription(undefined)).toBe(false)
	})
})

describe('claves i18n', () => {

	test('lnReasonKey funde NOT_BETA y OPERATIONAL y devuelve null para lo desconocido', () => {
		expect(lnReasonKey('KYC')).toBe('settings.lightningAddress.reasons.KYC')
		expect(lnReasonKey('NOT_BETA')).toBe('settings.lightningAddress.reasons.MODE_OFF')
		expect(lnReasonKey('OPERATIONAL')).toBe('settings.lightningAddress.reasons.ROLE')
		expect(lnReasonKey('PAUSED')).toBe('settings.lightningAddress.reasons.PAUSED')
		expect(lnReasonKey('SANCTIONS')).toBeNull()
		expect(lnReasonKey(null)).toBeNull()
	})

	test('lnErrorKey traduce LN_NAME_INVALID por su problem', () => {
		expect(lnErrorKey('LN_NAME_INVALID', 'reserved')).toBe('settings.lightningAddress.nameProblems.reserved')
		expect(lnErrorKey('LN_NAME_INVALID', undefined)).toBe('settings.lightningAddress.nameProblems.format')
		expect(lnErrorKey('LN_NAME_TAKEN')).toBe('settings.lightningAddress.nameProblems.taken')
		expect(lnErrorKey('LN_RENAME_LIMIT')).toBe('settings.lightningAddress.errors.renameLimit')
		expect(lnErrorKey('LN_ADDRESS_UNAVAILABLE')).toBeNull()
		expect(lnErrorKey(undefined)).toBeNull()
	})

	test('los códigos de estado cambiado obligan a refrescar', () => {
		expect(LN_STATE_CHANGED_CODES.has('LN_ADDRESS_EXISTS')).toBe(true)
		expect(LN_STATE_CHANGED_CODES.has('LN_NAME_TAKEN')).toBe(false)
	})
})

describe('lnFailureHint', () => {

	test('KYC lleva a verificar, venga como 403 KYC_REQUIRED o como motivo de cuenta', () => {
		expect(lnFailureHint({ code: 'KYC_REQUIRED', kyc_url: '/onboarding' }, 403)).toEqual({ key: 'settings.lightningAddress.reasons.KYC', text: null, kyc: true })
		expect(lnFailureHint({ code: 'LN_ADDRESS_UNAVAILABLE', reason_code: 'KYC', message: 'x' }, 403).kyc).toBe(true)
	})

	test('motivo desconocido → texto del servidor; 429 → tooMany; nombre inválido → su problem', () => {
		expect(lnFailureHint({ code: 'LN_ADDRESS_UNAVAILABLE', reason_code: 'SANCTIONS', message: 'Contacta a soporte' }, 403))
			.toEqual({ key: null, text: 'Contacta a soporte', kyc: false })
		expect(lnFailureHint({ error: 'Demasiadas solicitudes' }, 429).key).toBe('settings.lightningAddress.errors.tooMany')
		expect(lnFailureHint({ code: 'LN_NAME_INVALID', problem: 'length' }, 400).key).toBe('settings.lightningAddress.nameProblems.length')
		expect(lnFailureHint(undefined, undefined, 'Sin red')).toEqual({ key: null, text: 'Sin red', kyc: false })
	})
})
