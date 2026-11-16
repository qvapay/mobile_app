/**
 * Validación y payload de la ficha CIP: espejo del zod de `PUT /user/update` en qpweb.
 * @jest-environment node
 */
import { cipFormFromProfile, validateCip, buildCipPayload, isCipDirty, formatSsnInput, hasIntlAddress, EMPTY_CIP_FORM, US_STATE_CODES } from './cipForm'

const FULL = { usPerson: true, ssn: '123-45-6789', addrLine1: '1 Main St', addrLine2: '', addrCity: 'Miami', addrState: 'FL', addrPostal: '33101', addrCountry: 'US' }
const INTL = { usPerson: false, ssn: '', addrLine1: 'Calle Mayor 1', addrLine2: '2C', addrCity: 'Madrid', addrState: 'Madrid', addrPostal: '28001', addrCountry: 'ES' }

describe('cipFormFromProfile', () => {
	test('vuelca la ficha y deja el SSN en blanco (nunca viaja en claro)', () => {
		const form = cipFormFromProfile({ us_person: true, ssn_itin_last4: '6789', addr_line1: '1 Main St', addr_line2: 'Apt 2', addr_city: 'Miami', addr_state: 'FL', addr_postal: '33101', addr_country: 'US' })
		expect(form).toEqual({ usPerson: true, ssn: '', addrLine1: '1 Main St', addrLine2: 'Apt 2', addrCity: 'Miami', addrState: 'FL', addrPostal: '33101', addrCountry: 'US' })
		expect(cipFormFromProfile({ us_person: false, addr_country: 'es' }).addrCountry).toBe('ES')
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
	test('no US person: sin dirección solo viaja la declaración; con algo escrito, calle, ciudad y país', () => {
		expect(validateCip({ ...EMPTY_CIP_FORM, usPerson: false }, { hasSavedSsn: false })).toBeNull()
		expect(validateCip({ ...EMPTY_CIP_FORM, addrCountry: 'ES' }, { hasSavedSsn: false })).toBeNull()
		expect(validateCip(INTL, { hasSavedSsn: false })).toBeNull()
		expect(validateCip({ ...INTL, addrState: '', addrPostal: '' }, { hasSavedSsn: false })).toBeNull()
		expect(validateCip({ ...INTL, addrLine1: ' ' }, { hasSavedSsn: false })).toEqual({ field: 'addrLine1', key: 'addressRequired' })
		expect(validateCip({ ...INTL, addrCity: '' }, { hasSavedSsn: false })).toEqual({ field: 'addrCity', key: 'addressRequired' })
		expect(validateCip({ ...INTL, addrCountry: '' }, { hasSavedSsn: false })).toEqual({ field: 'addrCountry', key: 'countryRequired' })
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

	test('no US person sin dirección: solo la casilla (el backend borra el SSN)', () => {
		expect(buildCipPayload({ ...EMPTY_CIP_FORM, addrCountry: 'ES' })).toEqual({ us_person: false })
	})

	test('no US person con dirección: viaja entera con su país (sin ella el backend la borraría)', () => {
		expect(buildCipPayload(INTL)).toEqual({ us_person: false, addr_line1: 'Calle Mayor 1', addr_line2: '2C', addr_city: 'Madrid', addr_state: 'Madrid', addr_postal: '28001', addr_country: 'ES' })
		// Desmarcar la casilla conserva la dirección que había
		expect(buildCipPayload({ ...FULL, usPerson: false })).toEqual({ us_person: false, addr_line1: '1 Main St', addr_line2: '', addr_city: 'Miami', addr_state: 'FL', addr_postal: '33101', addr_country: 'US' })
		expect(buildCipPayload({ ...FULL, usPerson: false })).not.toHaveProperty('ssn')
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

	test('el país cuenta solo para quien no es persona de EE. UU. y con dirección', () => {
		expect(isCipDirty(INTL, INTL)).toBe(false)
		expect(isCipDirty({ ...INTL, addrCountry: 'PT' }, INTL)).toBe(true)
		expect(isCipDirty({ ...EMPTY_CIP_FORM, addrCountry: 'ES' }, EMPTY_CIP_FORM)).toBe(false)
		expect(hasIntlAddress({ ...EMPTY_CIP_FORM, addrCountry: 'ES' })).toBe(false)
	})
})
