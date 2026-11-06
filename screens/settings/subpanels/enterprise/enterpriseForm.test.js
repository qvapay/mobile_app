/**
 * Unit tests for the enterprise registration form logic — node environment
 * (see keypadAmount.test.js for why).
 * @jest-environment node
 */
import {
	COMPANY_COUNTRIES,
	EMPLOYEE_RANGES,
	US_ENTITY_TYPES,
	US_STATES,
	EMPTY_FORM,
	validateCompanyStep,
	validateFiscalStep,
	validateContactStep,
	buildRegisterFields,
	withOrgKind,
	statutesRowKey,
} from './enterpriseForm'

const VALID_US = {
	...EMPTY_FORM,
	companyName: 'Acme LLC',
	activity: 'Comercio electrónico',
	employeeCount: '1-10',
	country: 'US',
	taxId: '12-3456789',
	entityType: 'LLC',
	incState: 'FL',
	addrLine1: '123 Ocean Drive',
	addrCity: 'Miami',
	addrState: 'FL',
	addrZip: '33101',
	directorName: 'Juan Pérez',
	email: 'juan@acme.com',
}

const VALID_CU = {
	...EMPTY_FORM,
	companyName: 'Mi PYME SRL',
	activity: 'Servicios gastronómicos',
	employeeCount: '11-50',
	country: 'CU',
	taxId: '12345678901',
	reeup: '123.4.56789',
	directorName: 'Ana García',
	email: 'ana@pyme.cu',
}

const VALID_TCP = {
	...EMPTY_FORM,
	orgKind: 'tcp',
	companyName: 'Taller Pérez',
	activity: 'Reparación de equipos',
	employeeCount: '1-10',
	country: 'CU',
	taxId: '12345678901',
	directorName: 'Pedro Pérez',
	email: 'pedro@correo.cu',
}

const PDF = { name: 'estatutos.pdf', size: 1024 * 1024, uri: 'file:///estatutos.pdf' }

describe('COMPANY_COUNTRIES', () => {
	test('excludes sanctioned jurisdictions but keeps Cuba and Venezuela', () => {
		const codes = new Set(COMPANY_COUNTRIES.map(c => c.code))
		for (const sanctioned of ['IR', 'KP', 'SY', 'AF', 'BY', 'MM']) { expect(codes.has(sanctioned)).toBe(false) }
		expect(codes.has('CU')).toBe(true)
		expect(codes.has('VE')).toBe(true)
		expect(codes.has('US')).toBe(true)
	})

	test('has no duplicate codes and is sorted by name', () => {
		const codes = COMPANY_COUNTRIES.map(c => c.code)
		expect(new Set(codes).size).toBe(codes.length)
		const names = COMPANY_COUNTRIES.map(c => c.name)
		expect([...names].sort((a, b) => a.localeCompare(b))).toEqual(names)
	})
})

describe('validateCompanyStep', () => {
	test('accepts a complete company step', () => {
		expect(validateCompanyStep(VALID_US)).toBeNull()
	})

	test('rejects missing name, activity or employee range', () => {
		expect(validateCompanyStep({ ...VALID_US, companyName: 'A' })).toMatch(/nombre/)
		expect(validateCompanyStep({ ...VALID_US, activity: 'ab' })).toMatch(/actividad/)
		expect(validateCompanyStep({ ...VALID_US, employeeCount: '' })).toMatch(/empleados/)
		expect(validateCompanyStep({ ...VALID_US, employeeCount: '9999' })).toMatch(/empleados/)
	})
})

describe('validateCompanyStep (TCP)', () => {
	test('accepts a complete step and speaks of a business, not a company', () => {
		expect(validateCompanyStep(VALID_TCP)).toBeNull()
		expect(validateCompanyStep({ ...VALID_TCP, companyName: 'A' })).toMatch(/negocio/)
		expect(validateCompanyStep({ ...VALID_TCP, activity: 'ab' })).toBe('Describe tu actividad.')
	})
})

describe('validateFiscalStep', () => {
	test('US requires EIN, entity, state and full address', () => {
		expect(validateFiscalStep(VALID_US)).toBeNull()
		expect(validateFiscalStep({ ...VALID_US, taxId: '123' })).toMatch(/EIN/)
		expect(validateFiscalStep({ ...VALID_US, entityType: 'Cooperativa' })).toMatch(/entidad/)
		expect(validateFiscalStep({ ...VALID_US, incState: 'XX' })).toMatch(/constitución/)
		expect(validateFiscalStep({ ...VALID_US, addrZip: 'ABC' })).toMatch(/ZIP/)
	})

	test('EIN accepts the dashless 9-digit form (server normalizes)', () => {
		expect(validateFiscalStep({ ...VALID_US, taxId: '123456789' })).toBeNull()
	})

	test('CU requires NIT (11 digits) and REEUP', () => {
		expect(validateFiscalStep(VALID_CU)).toBeNull()
		expect(validateFiscalStep({ ...VALID_CU, taxId: '123' })).toMatch(/NIT/)
		expect(validateFiscalStep({ ...VALID_CU, reeup: 'x' })).toMatch(/REEUP/)
	})

	test('other countries only need a generic tax id', () => {
		const mx = { ...VALID_CU, country: 'MX', taxId: 'ACM010203AB1', reeup: '' }
		expect(validateFiscalStep(mx)).toBeNull()
		expect(validateFiscalStep({ ...mx, taxId: 'ab' })).toMatch(/fiscal/)
	})

	test('requires a country', () => {
		expect(validateFiscalStep({ ...VALID_US, country: '' })).toMatch(/país/)
	})

	test('TCP passes with a valid NIT and no REEUP', () => {
		expect(validateFiscalStep(VALID_TCP)).toBeNull()
	})

	test('TCP fails without a NIT or with a 10-digit one', () => {
		expect(validateFiscalStep({ ...VALID_TCP, taxId: '' })).toMatch(/NIT/)
		expect(validateFiscalStep({ ...VALID_TCP, taxId: '1234567890' })).toMatch(/NIT/)
	})

	test('a Cuban business still needs its REEUP', () => {
		expect(validateFiscalStep({ ...VALID_TCP, orgKind: 'business' })).toMatch(/REEUP/)
	})
})

describe('validateContactStep', () => {
	test('accepts director, valid email and a PDF within limits', () => {
		expect(validateContactStep(VALID_US, PDF)).toBeNull()
	})

	test('rejects bad email, missing file and oversized file', () => {
		expect(validateContactStep({ ...VALID_US, email: 'nope' }, PDF)).toMatch(/email/)
		expect(validateContactStep(VALID_US, null)).toMatch(/PDF/)
		expect(validateContactStep(VALID_US, { ...PDF, size: 11 * 1024 * 1024 })).toMatch(/10MB/)
	})

	test('TCP passes without a file and with one within limits', () => {
		expect(validateContactStep(VALID_TCP, null)).toBeNull()
		expect(validateContactStep(VALID_TCP, PDF)).toBeNull()
	})

	test('TCP keeps the 10MB cap when a file is attached', () => {
		expect(validateContactStep(VALID_TCP, { ...PDF, size: 11 * 1024 * 1024 })).toMatch(/10MB/)
	})

	test('TCP asks for the holder, not a director', () => {
		expect(validateContactStep({ ...VALID_TCP, directorName: 'Al' }, null)).toBe('Ingresa tu nombre completo.')
	})
})

describe('buildRegisterFields', () => {
	test('US payload carries the full fiscal block', () => {
		const fields = buildRegisterFields(VALID_US)
		expect(fields).toMatchObject({
			companyName: 'Acme LLC', country: 'US', taxId: '12-3456789',
			entityType: 'LLC', incState: 'FL', addrLine1: '123 Ocean Drive',
			addrCity: 'Miami', addrState: 'FL', addrZip: '33101',
		})
		expect(fields.reeup).toBeUndefined()
	})

	test('CU payload carries reeup but no US fields', () => {
		const fields = buildRegisterFields(VALID_CU)
		expect(fields.reeup).toBe('123.4.56789')
		expect(fields.entityType).toBeUndefined()
		expect(fields.addrLine1).toBeUndefined()
	})

	test('generic-country payload carries only the tax id', () => {
		const fields = buildRegisterFields({ ...VALID_CU, country: 'MX', taxId: ' ACM010203AB1 ', reeup: '' })
		expect(fields.taxId).toBe('ACM010203AB1')
		expect(fields.reeup).toBeUndefined()
	})

	test('TCP payload carries orgKind and Cuba, without reeup', () => {
		const fields = buildRegisterFields({ ...VALID_TCP, country: 'US', reeup: '123.4.56789', addrLine1: '123 Ocean Drive' })
		expect(fields).toMatchObject({ orgKind: 'tcp', country: 'CU', taxId: '12345678901', directorName: 'Pedro Pérez' })
		expect(fields.reeup).toBeUndefined()
		expect(fields.addrLine1).toBeUndefined()
		expect(fields.owners).toBeUndefined()
	})

	test('business payloads stay exactly as before, with no orgKind', () => {
		expect(buildRegisterFields(VALID_CU).orgKind).toBeUndefined()
		expect(buildRegisterFields(VALID_US).orgKind).toBeUndefined()
	})

	test('exposes the option catalogs the wizard renders', () => {
		expect(EMPLOYEE_RANGES.map(r => r.value)).toEqual(['1-10', '11-50', '51-200', '201-500', '500+'])
		expect(US_ENTITY_TYPES).toContain('LLC')
		expect(US_STATES).toHaveLength(51)
	})
})

describe('withOrgKind', () => {
	test('leaving TCP drops the forced country and the NIT, but keeps shared fields', () => {
		const next = withOrgKind(VALID_TCP, 'business')
		expect(next).toMatchObject({ orgKind: 'business', country: '', taxId: '' })
		expect(next).toMatchObject({ companyName: 'Taller Pérez', activity: 'Reparación de equipos', directorName: 'Pedro Pérez', email: 'pedro@correo.cu', employeeCount: '1-10' })
	})

	test('choosing TCP fixes Cuba and clears every fiscal field of the other branch', () => {
		expect(withOrgKind(VALID_US, 'tcp')).toMatchObject({
			orgKind: 'tcp', country: 'CU', taxId: '', entityType: '', incState: '',
			addrLine1: '', addrCity: '', addrState: '', addrZip: '',
		})
	})

	test('a Cuban business loses its REEUP and NIT even though the country matches', () => {
		expect(withOrgKind(VALID_CU, 'tcp')).toMatchObject({ orgKind: 'tcp', country: 'CU', taxId: '', reeup: '' })
	})

	test('going there and back leaves nothing behind', () => {
		const roundTrip = withOrgKind(withOrgKind(VALID_CU, 'tcp'), 'business')
		expect(roundTrip).toMatchObject({ orgKind: 'business', country: '', taxId: '', reeup: '' })
	})

	test('the same branch returns the same form untouched', () => {
		expect(withOrgKind(VALID_TCP, 'tcp')).toBe(VALID_TCP)
		expect(withOrgKind(VALID_US, 'business')).toBe(VALID_US)
	})

	test('the default branch is a business', () => {
		expect(EMPTY_FORM.orgKind).toBe('business')
	})
})

describe('statutesRowKey', () => {
	test('a sent document wins, also on a TCP', () => {
		expect(statutesRowKey({ statutes_sent: true })).toBe('settings.enterprise.details.statutesSent')
		expect(statutesRowKey({ statutes_sent: true, entity_type: 'TCP' })).toBe('settings.enterprise.details.statutesSent')
	})

	test('a TCP without a document does not need one', () => {
		expect(statutesRowKey({ statutes_sent: false, entity_type: 'TCP' })).toBe('settings.enterprise.details.statutesNotRequired')
	})

	test('without entity_type it stays "not sent" (the backend does not return it yet)', () => {
		expect(statutesRowKey({ statutes_sent: false })).toBe('settings.enterprise.details.statutesNotSent')
		expect(statutesRowKey({ statutes_sent: false, entity_type: 'LLC' })).toBe('settings.enterprise.details.statutesNotSent')
	})
})
