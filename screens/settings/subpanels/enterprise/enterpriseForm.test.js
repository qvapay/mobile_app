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

	test('exposes the option catalogs the wizard renders', () => {
		expect(EMPLOYEE_RANGES.map(r => r.value)).toEqual(['1-10', '11-50', '51-200', '201-500', '500+'])
		expect(US_ENTITY_TYPES).toContain('LLC')
		expect(US_STATES).toHaveLength(51)
	})
})
