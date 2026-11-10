/**
 * Reglas del CPF: los dígitos verificadores evitan gastar un intento en una errata, y el estado
 * de la pantalla sale de lo que dice el servidor.
 * @jest-environment node
 */
import { applyCpfVerified, classifyCpfVerifyError, cpfBlockAction, deriveCpfView, formatCpf, isValidCpf, maskCpf, normalizeCpf } from './cpfRules'

const CPF = (over) => ({ status: 'none', verified_at: null, cpf_last2: null, attempts_left: 3, attempts_max: 3, can_start: true, block_reason: null, message: null, ...over })

describe('formato', () => {
	test.each([
		['529', '529'],
		['5299', '529.9'],
		['529982', '529.982'],
		['5299822', '529.982.2'],
		['529982247', '529.982.247'],
		['5299822472', '529.982.247-2'],
		['52998224725', '529.982.247-25'],
	])('%s → %s mientras se teclea', (typed, shown) => {
		expect(formatCpf(typed)).toBe(shown)
	})

	test('corta en 11 dígitos e ignora lo que no sea un dígito', () => {
		expect(formatCpf('529.982.247-25999')).toBe('529.982.247-25')
		expect(normalizeCpf('529.982.247-25')).toBe('52998224725')
		expect(normalizeCpf(null)).toBe('')
	})

	test('solo enseña los dos últimos dígitos', () => {
		expect(maskCpf('25')).toBe('***.***.***-25')
		expect(maskCpf(null)).toBe('***.***.***-**')
	})
})

describe('isValidCpf', () => {
	test('acepta un CPF con los dígitos verificadores correctos, con o sin máscara', () => {
		expect(isValidCpf('529.982.247-25')).toBe(true)
		expect(isValidCpf('52998224725')).toBe(true)
		// Primer dígito con resto < 2: el verificador es 0
		expect(isValidCpf('111.444.777-35')).toBe(true)
	})

	test('rechaza una errata en cualquiera de los dos verificadores', () => {
		expect(isValidCpf('529.982.247-24')).toBe(false)
		expect(isValidCpf('529.982.247-15')).toBe(false)
	})

	test('rechaza la serie de dígitos repetidos, aunque cuadre el módulo 11', () => {
		expect(isValidCpf('111.111.111-11')).toBe(false)
		expect(isValidCpf('000.000.000-00')).toBe(false)
	})

	test('rechaza lo incompleto', () => {
		expect(isValidCpf('529.982.247')).toBe(false)
		expect(isValidCpf('')).toBe(false)
	})
})

describe('deriveCpfView', () => {
	test('listo, con los intentos que quedan', () => {
		expect(deriveCpfView(CPF())).toMatchObject({ phase: 'ready', attemptsLeft: 3 })
	})

	test('verificado, con sus dos últimos dígitos', () => {
		expect(deriveCpfView(CPF({ status: 'verified', cpf_last2: '25', can_start: false }))).toMatchObject({ phase: 'verified', last2: '25' })
	})

	test.each(['no_match', 'partial', 'conflict'])('%s se puede reintentar si el servidor deja', (status) => {
		expect(deriveCpfView(CPF({ status, attempts_left: 2 }))).toMatchObject({ phase: 'retry', attemptsLeft: 2 })
	})

	test('sin poder empezar manda el motivo del servidor', () => {
		expect(deriveCpfView(CPF({ can_start: false, block_reason: 'MINOR', message: 'Debes ser mayor' })))
			.toMatchObject({ phase: 'blocked', blockReason: 'MINOR', message: 'Debes ser mayor' })
	})

	test('un qpweb sin PIX no manda cpf_verification: no disponible', () => {
		expect(deriveCpfView(undefined)).toMatchObject({ phase: 'blocked', blockReason: 'UNAVAILABLE' })
	})
})

describe('cpfBlockAction', () => {
	test('el KYC se rehace, los intentos los resuelve soporte, GOLD se compra y el resto no tiene salida', () => {
		expect(cpfBlockAction('GOLD_REQUIRED')).toBe('gold')
		expect(cpfBlockAction('KYC_REQUIRED')).toBe('kyc')
		expect(cpfBlockAction('DOCUMENT_REQUIRED')).toBe('kyc')
		expect(cpfBlockAction('ATTEMPTS_EXHAUSTED')).toBe('support')
		expect(['MINOR', 'UNAVAILABLE', 'GEO_BR_REQUIRED', 'SDN_BLOCKED', 'STAFF_ACCOUNT', null].map(cpfBlockAction)).toEqual(Array(6).fill('none'))
	})
})

describe('classifyCpfVerifyError', () => {
	test.each([
		['CPF_INVALID', 'invalid'],
		['CPF_NO_MATCH', 'no_match'],
		['CPF_PARTIAL_MATCH', 'partial'],
		['CPF_IN_USE', 'in_use'],
		['RATE_LIMITED', 'rate_limited'],
		['CPF_VERIFY_UNAVAILABLE', 'unavailable'],
	])('%s → %s', (code, kind) => {
		expect(classifyCpfVerifyError(400, { code }).kind).toBe(kind)
	})

	test('un no-match trae los intentos que quedan', () => {
		expect(classifyCpfVerifyError(409, { code: 'CPF_NO_MATCH', attempts_left: 1 }).attemptsLeft).toBe(1)
	})

	test('sin GOLD el servidor lo dice como motivo', () => {
		expect(classifyCpfVerifyError(403, { code: 'GOLD_REQUIRED' })).toMatchObject({ kind: 'blocked', blockReason: 'GOLD_REQUIRED' })
	})

	test('un 403 trae el motivo como código', () => {
		expect(classifyCpfVerifyError(403, { code: 'GEO_BR_REQUIRED' })).toMatchObject({ kind: 'blocked', blockReason: 'GEO_BR_REQUIRED' })
	})

	test('sin código decide el HTTP', () => {
		expect(classifyCpfVerifyError(429, {}).kind).toBe('rate_limited')
		expect(classifyCpfVerifyError(503, {}).kind).toBe('unavailable')
		expect(classifyCpfVerifyError(403, {}).kind).toBe('blocked')
		expect(classifyCpfVerifyError(undefined, undefined).kind).toBe('unknown')
	})
})

test('applyCpfVerified vuelca el 200 en la ficha sin esperar al refetch', () => {
	const cip = { us_person: false, cpf_verification: CPF() }
	const next = applyCpfVerified(cip, { status: 'verified', verified_at: '2026-11-06T15:04:05.000Z', cpf_last2: '25', attempts_left: 2 })
	expect(next.us_person).toBe(false)
	expect(next.cpf_verification).toMatchObject({ status: 'verified', cpf_last2: '25', attempts_left: 2, attempts_max: 3, can_start: false })
	expect(deriveCpfView(next.cpf_verification).phase).toBe('verified')
})
