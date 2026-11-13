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
	MAX_COMPANY_OWNERS,
	validateCompanyStep,
	validateFiscalStep,
	validateContactStep,
	buildRegisterFields,
	withOrgKind,
	withOwnerAdded,
	withOwnerField,
	withOwnerRemoved,
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
	phone: '+1 305 555 0100',
}

const owner = (fields) => ({ ...EMPTY_FORM.owners[0], ...fields })

const VALID_CU = {
	...EMPTY_FORM,
	companyName: 'Mi PYME SRL',
	activity: 'Servicios gastronómicos',
	employeeCount: '11-50',
	country: 'CU',
	taxId: '12345678901',
	owners: [owner({ id: 0, name: 'Ana García', pct: '60' }), owner({ id: 1, name: 'Luis Soto', pct: '40' })],
	directorName: 'Ana García',
	email: 'ana@pyme.cu',
	phone: '+53 5 1234567',
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
	phone: '51234567',
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

	test('CU requires a NIT of 11 digits', () => {
		expect(validateFiscalStep(VALID_CU)).toBeNull()
		expect(validateFiscalStep({ ...VALID_CU, taxId: '123' })).toMatch(/NIT/)
	})

	test('other countries only need a generic tax id', () => {
		const mx = { ...VALID_CU, country: 'MX', taxId: 'ACM010203AB1' }
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

	test('TCP never looks at the owners, not even a leftover invalid row', () => {
		expect(validateFiscalStep({ ...VALID_TCP, owners: [owner({ name: 'A', pct: '500' })] })).toBeNull()
	})

	test('a Cuban business needs its partners, a TCP with the same data does not', () => {
		expect(validateFiscalStep({ ...VALID_TCP, orgKind: 'business' })).toMatch(/escritura/)
	})
})

describe('validateFiscalStep (owners)', () => {
	const MX = { ...VALID_CU, country: 'MX', taxId: 'ACM010203AB1' }
	const onlyOwner = (fields) => [owner(fields)]

	test('Cuba needs at least one partner, and an empty row does not count', () => {
		expect(validateFiscalStep({ ...VALID_CU, owners: [] })).toMatch(/escritura/)
		expect(validateFiscalStep({ ...VALID_CU, owners: EMPTY_FORM.owners })).toMatch(/escritura/)
		expect(validateFiscalStep({ ...VALID_CU, owners: onlyOwner({ name: '   ' }) })).toMatch(/escritura/)
	})

	test('Cuba takes any percentage, and none at all', () => {
		expect(validateFiscalStep({ ...VALID_CU, owners: onlyOwner({ name: 'Ana García' }) })).toBeNull()
		expect(validateFiscalStep({ ...VALID_CU, owners: onlyOwner({ name: 'Ana García', pct: '0.5' }) })).toBeNull()
	})

	test('outside Cuba the list can be empty', () => {
		expect(validateFiscalStep({ ...MX, owners: EMPTY_FORM.owners })).toBeNull()
		expect(validateFiscalStep({ ...VALID_US, owners: EMPTY_FORM.owners })).toBeNull()
	})

	test('outside Cuba a partner needs a percentage of 25 or more', () => {
		expect(validateFiscalStep({ ...MX, owners: onlyOwner({ name: 'Ana García' }) })).toBe('Indica el porcentaje de participación de Ana García.')
		expect(validateFiscalStep({ ...MX, owners: onlyOwner({ name: 'Ana García', pct: '24.99' }) })).toBe('Fuera de Cuba solo se declaran socios con 25% o más de participación (Ana García no llega).')
		expect(validateFiscalStep({ ...MX, owners: onlyOwner({ name: 'Ana García', pct: '25' }) })).toBeNull()
	})

	test('the US rule is the same as the rest of the world', () => {
		expect(validateFiscalStep({ ...VALID_US, owners: onlyOwner({ name: 'Ana García', pct: '10' }) })).toMatch(/no llega/)
	})

	test('a row with any data needs a full name', () => {
		expect(validateFiscalStep({ ...VALID_CU, owners: onlyOwner({ pct: '100' }) })).toBe('Ingresa el nombre completo de cada socio.')
		expect(validateFiscalStep({ ...VALID_CU, owners: onlyOwner({ name: 'Al' }) })).toBe('Ingresa el nombre completo de cada socio.')
	})

	test.each(['0', '-5', '100.5', 'abc', '50%'])('rejects the percentage %s', (pct) => {
		expect(validateFiscalStep({ ...VALID_CU, owners: onlyOwner({ name: 'Ana García', pct }) })).toBe('El porcentaje de participación de Ana García debe estar entre 0 y 100.')
	})

	test('a decimal comma is a valid percentage', () => {
		expect(validateFiscalStep({ ...VALID_CU, owners: onlyOwner({ name: 'Ana García', pct: '12,5' }) })).toBeNull()
		expect(validateFiscalStep({ ...MX, owners: onlyOwner({ name: 'Ana García', pct: '24,9' }) })).toMatch(/no llega/)
	})

	test('rejects an invalid email but not a missing one', () => {
		expect(validateFiscalStep({ ...VALID_CU, owners: onlyOwner({ name: 'Ana García', email: 'ana@' }) })).toBe('El email del socio Ana García no es válido.')
		expect(validateFiscalStep({ ...VALID_CU, owners: onlyOwner({ name: 'Ana García', email: 'ana@pyme.cu' }) })).toBeNull()
	})

	test('the total cannot pass 100, with the server tolerance', () => {
		const shares = (...pcts) => pcts.map((pct, id) => owner({ id, name: `Socio ${id}`, pct }))
		expect(validateFiscalStep({ ...VALID_CU, owners: shares('60', '50') })).toBe('La suma de los porcentajes de participación no puede superar el 100%.')
		expect(validateFiscalStep({ ...VALID_CU, owners: shares('33.34', '33.33', '33.33') })).toBeNull()
		expect(validateFiscalStep({ ...VALID_CU, owners: shares('33.34', '33.34', '33.34') })).toMatch(/100%/)
	})

	test('fiscal errors come first: the owners sit below them on screen', () => {
		expect(validateFiscalStep({ ...VALID_CU, taxId: '123', owners: [] })).toMatch(/NIT/)
		expect(validateFiscalStep({ ...VALID_US, addrZip: 'ABC', owners: onlyOwner({ name: 'Al' }) })).toMatch(/ZIP/)
	})
})

describe('validateContactStep', () => {
	test('accepts director, valid email and a PDF within limits', () => {
		expect(validateContactStep(VALID_US, PDF)).toBeNull()
	})

	test('requires a contact phone that can be a phone number', () => {
		const message = 'Escribe un teléfono de contacto válido, con el prefijo del país.'
		expect(validateContactStep({ ...VALID_US, phone: '' }, PDF)).toBe(message)
		expect(validateContactStep({ ...VALID_US, phone: '   ' }, PDF)).toBe(message)
		expect(validateContactStep({ ...VALID_US, phone: '12345' }, PDF)).toBe(message)
		expect(validateContactStep({ ...VALID_US, phone: 'llamar al 5 1234567' }, PDF)).toBe(message)
		expect(validateContactStep({ ...VALID_US, phone: '+1234567890123456' }, PDF)).toBe(message)
		expect(validateContactStep({ ...VALID_TCP, phone: '' }, null)).toBe(message)
		expect(validateContactStep({ ...VALID_US, phone: '(305) 555-0100' }, PDF)).toBeNull()
		expect(validateContactStep(VALID_TCP, null)).toBeNull()
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

	test('every payload carries the trimmed contact phone', () => {
		expect(buildRegisterFields({ ...VALID_US, phone: '  +1 305 555 0100 ' }).phone).toBe('+1 305 555 0100')
		expect(buildRegisterFields(VALID_TCP).phone).toBe('51234567')
	})

	test('CU payload carries the NIT and the owners, but no US fields and no REEUP', () => {
		const fields = buildRegisterFields(VALID_CU)
		expect(fields.taxId).toBe('12345678901')
		expect(JSON.parse(fields.owners)).toHaveLength(2)
		expect(fields.reeup).toBeUndefined()
		expect(fields.entityType).toBeUndefined()
		expect(fields.addrLine1).toBeUndefined()
	})

	test('generic-country payload carries the tax id and an empty owners list', () => {
		const fields = buildRegisterFields({ ...VALID_CU, country: 'MX', taxId: ' ACM010203AB1 ', owners: EMPTY_FORM.owners })
		expect(fields.taxId).toBe('ACM010203AB1')
		expect(fields.owners).toBe('[]')
	})

	test('owners travel normalized as the server stores them, without the row id', () => {
		const fields = buildRegisterFields({
			...VALID_CU,
			owners: [
				owner({ id: 3, name: '  Ana García ', pct: ' 12,5 ', email: ' Ana@Pyme.CU ', username: ' @ana ' }),
				owner({ id: 4 }),
				owner({ id: 5, name: 'Luis Soto', pct: '33.333' }),
				owner({ id: 6, name: 'Eva Díaz' }),
			],
		})
		expect(JSON.parse(fields.owners)).toEqual([
			{ name: 'Ana García', pct: 12.5, email: 'ana@pyme.cu', username: 'ana' },
			{ name: 'Luis Soto', pct: 33.33, email: null, username: null },
			{ name: 'Eva Díaz', pct: null, email: null, username: null },
		])
	})

	test('TCP payload carries orgKind and Cuba, without owners', () => {
		const fields = buildRegisterFields({ ...VALID_TCP, country: 'US', addrLine1: '123 Ocean Drive', owners: [owner({ name: 'Ana García' })] })
		expect(fields).toMatchObject({ orgKind: 'tcp', country: 'CU', taxId: '12345678901', directorName: 'Pedro Pérez' })
		expect(fields.addrLine1).toBeUndefined()
		expect(fields.owners).toBeUndefined()
	})

	test('business payloads carry no orgKind', () => {
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

	test('a Cuban business loses its NIT and partners even though the country matches', () => {
		const next = withOrgKind(VALID_CU, 'tcp')
		expect(next).toMatchObject({ orgKind: 'tcp', country: 'CU', taxId: '' })
		expect(next.owners).toEqual(EMPTY_FORM.owners)
	})

	test('going there and back leaves nothing behind', () => {
		const roundTrip = withOrgKind(withOrgKind(VALID_CU, 'tcp'), 'business')
		expect(roundTrip).toMatchObject({ orgKind: 'business', country: '', taxId: '' })
		expect(roundTrip.owners).toEqual(EMPTY_FORM.owners)
	})

	test('the same branch returns the same form untouched', () => {
		expect(withOrgKind(VALID_TCP, 'tcp')).toBe(VALID_TCP)
		expect(withOrgKind(VALID_US, 'business')).toBe(VALID_US)
	})

	test('the default branch is a business', () => {
		expect(EMPTY_FORM.orgKind).toBe('business')
	})
})

describe('owner rows', () => {
	test('a field change touches only that row', () => {
		const next = withOwnerField(VALID_CU, 1, 'pct', '35')
		expect(next.owners.map(o => o.pct)).toEqual(['60', '35'])
		expect(next.owners[0]).toBe(VALID_CU.owners[0])
	})

	test('a new row is empty and gets an id of its own', () => {
		const next = withOwnerAdded(VALID_CU)
		expect(next.owners).toHaveLength(3)
		expect(next.owners[2]).toEqual(owner({ id: 2 }))
	})

	test('ids stay unique after removing a row in the middle', () => {
		const three = withOwnerAdded(VALID_CU)
		const next = withOwnerAdded(withOwnerRemoved(three, 1))
		const ids = next.owners.map(o => o.id)
		expect(new Set(ids).size).toBe(ids.length)
	})

	test('stops at the server limit', () => {
		let form = EMPTY_FORM
		for (let i = 0; i < MAX_COMPANY_OWNERS + 5; i += 1) { form = withOwnerAdded(form) }
		expect(form.owners).toHaveLength(20)
		expect(withOwnerAdded(form)).toBe(form)
	})

	test('removes a row, but the list never ends up empty', () => {
		expect(withOwnerRemoved(VALID_CU, 0).owners.map(o => o.name)).toEqual(['Luis Soto'])
		const single = { ...VALID_CU, owners: [VALID_CU.owners[0]] }
		expect(withOwnerRemoved(single, 0)).toBe(single)
	})

	test('the shared empty list is never mutated', () => {
		const before = JSON.stringify(EMPTY_FORM.owners)
		withOwnerField(withOwnerAdded(EMPTY_FORM), 0, 'name', 'Ana García')
		expect(JSON.stringify(EMPTY_FORM.owners)).toBe(before)
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

	test('without entity_type it stays "not sent" (a backend older than 4.4.14 does not return it)', () => {
		expect(statutesRowKey({ statutes_sent: false })).toBe('settings.enterprise.details.statutesNotSent')
		expect(statutesRowKey({ statutes_sent: false, entity_type: 'LLC' })).toBe('settings.enterprise.details.statutesNotSent')
	})
})
