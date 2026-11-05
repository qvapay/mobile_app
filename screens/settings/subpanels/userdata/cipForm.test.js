/**
 * Validación y payload de la ficha CIP: espejo del zod de `PUT /user/update` en qpweb.
 * @jest-environment node
 */
import { cipFormFromProfile, validateCip, buildCipPayload, isCipDirty, formatSsnInput, EMPTY_CIP_FORM, US_STATE_CODES } from './cipForm'

const FULL = { usPerson: true, ssn: '123-45-6789', addrLine1: '1 Main St', addrLine2: '', addrCity: 'Miami', addrState: 'FL', addrPostal: '33101' }

describe('cipFormFromProfile', () => {
	test('vuelca la ficha y deja el SSN en blanco (nunca viaja en claro)', () => {
		const form = cipFormFromProfile({ us_person: true, ssn_itin_last4: '6789', addr_line1: '1 Main St', addr_line2: 'Apt 2', addr_city: 'Miami', addr_state: 'FL', addr_postal: '33101', addr_country: 'US' })
		expect(form).toEqual({ usPerson: true, ssn: '', addrLine1: '1 Main St', addrLine2: 'Apt 2', addrCity: 'Miami', addrState: 'FL', addrPostal: '33101' })
		expect(cipFormFromProfile(null)).toBe(EMPTY_CIP_FORM)
	})
})

describe('formatSsnInput', () => {
	test('pone los guiones y corta a 9 dígitos', () => {
		expect(formatSsnInput('1')).toBe('1')
		expect(formatSsnInput('1234')).toBe('123-4')
		expect(formatSsnInput('123456789')).toBe('123-45-6789')
		expect(formatSsnInput('123-45-67890 extra')).toBe('123-45-6789')
	})
})

describe('validateCip', () => {
	test('quien no es persona de EE. UU. no tiene nada que validar', () => {
		expect(validateCip({ ...EMPTY_CIP_FORM, usPerson: false }, { hasSavedSsn: false })).toBeNull()
	})

	test('SSN: obligatorio sin uno guardado; en blanco con uno guardado = conservar', () => {
		expect(validateCip({ ...FULL, ssn: '' }, { hasSavedSsn: false })).toEqual({ field: 'ssn', key: 'ssnInvalid' })
		expect(validateCip({ ...FULL, ssn: '' }, { hasSavedSsn: true })).toBeNull()
		expect(validateCip({ ...FULL, ssn: '12345' }, { hasSavedSsn: true })).toEqual({ field: 'ssn', key: 'ssnInvalid' })
		expect(validateCip(FULL, { hasSavedSsn: false })).toBeNull()
	})

	test('dirección: calle, ciudad, estado válido (52 códigos) y ZIP', () => {
		expect(validateCip({ ...FULL, addrLine1: ' ' }, { hasSavedSsn: false })).toEqual({ field: 'addrLine1', key: 'addressRequired' })
		expect(validateCip({ ...FULL, addrCity: '' }, { hasSavedSsn: false })).toEqual({ field: 'addrCity', key: 'addressRequired' })
		expect(validateCip({ ...FULL, addrState: 'XX' }, { hasSavedSsn: false })).toEqual({ field: 'addrState', key: 'stateRequired' })
		expect(validateCip({ ...FULL, addrState: 'PR' }, { hasSavedSsn: false })).toBeNull()
		expect(validateCip({ ...FULL, addrPostal: '3310' }, { hasSavedSsn: false })).toEqual({ field: 'addrPostal', key: 'zipInvalid' })
		expect(validateCip({ ...FULL, addrPostal: '33101-1234' }, { hasSavedSsn: false })).toBeNull()
		expect(US_STATE_CODES.size).toBe(52)
	})
})

describe('buildCipPayload', () => {
	test('persona de EE. UU.: dirección entera, país US y el SSN solo si se tecleó', () => {
		expect(buildCipPayload(FULL)).toEqual({ us_person: true, ssn: '123456789', addr_line1: '1 Main St', addr_line2: '', addr_city: 'Miami', addr_state: 'FL', addr_postal: '33101', addr_country: 'US' })
		expect(buildCipPayload({ ...FULL, ssn: '' })).not.toHaveProperty('ssn')
	})

	test('no US person: solo la casilla (el backend borra el SSN)', () => {
		expect(buildCipPayload({ ...FULL, usPerson: false })).toEqual({ us_person: false })
	})
})

describe('isCipDirty', () => {
	test('sin cambios no se manda nada; un SSN tecleado siempre cuenta', () => {
		expect(isCipDirty(FULL, FULL)).toBe(true) // ssn tecleado
		const saved = { ...FULL, ssn: '' }
		expect(isCipDirty(saved, saved)).toBe(false)
		expect(isCipDirty({ ...saved, addrCity: 'Tampa' }, saved)).toBe(true)
		expect(isCipDirty({ ...saved, usPerson: false }, saved)).toBe(true)
		expect(isCipDirty({ ...saved, addrLine1: '1 Main St ' }, saved)).toBe(false)
	})
})
