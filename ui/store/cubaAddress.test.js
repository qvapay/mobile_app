/**
 * @jest-environment node
 */
import { CU_PROVINCES, CUBA_MUNICIPALITIES } from './cubaGeo'
import {
	canonicalMunicipality,
	cubaAddressNeedsCompletion,
	identificationMessage,
	identificationProblem,
	isCubanIdentification,
	mergeDeliveryMunicipalities,
	municipalitiesOf,
	municipalityCovered,
	normalizeIdentification,
	provinceName,
	supplierAddressIssue,
	supplierNeedsIdentification,
} from './cubaAddress'
import {
	buildAddressBody,
	EMPTY_ADDRESS_FORM,
	formatAddress,
	formFromSavedAddress,
	validateAddress,
	validateCubaAddress,
} from './shippingAddress'

const cubaForm = (overrides = {}) => ({
	...EMPTY_ADDRESS_FORM,
	recipient_name: 'María Pérez',
	phone: '5 512 3456',
	state: 'LHA',
	city: 'Plaza de la Revolución',
	line1: 'Calle 23 #456',
	identification: '87021332646',
	...overrides,
})

describe('datos portados de qpweb', () => {
	test('16 provincias y 168 municipios, con las mismas claves', () => {
		expect(CU_PROVINCES).toHaveLength(16)
		expect(Object.keys(CUBA_MUNICIPALITIES).sort()).toEqual(CU_PROVINCES.map(p => p.code).sort())
		const total = Object.values(CUBA_MUNICIPALITIES).reduce((n, list) => n + list.length, 0)
		expect(total).toBe(168)
		for (const list of Object.values(CUBA_MUNICIPALITIES)) {
			expect(list.length).toBeGreaterThan(0)
			expect(new Set(list).size).toBe(list.length)
		}
	})

	test('los códigos de provincia son los de ship_to.CU', () => {
		expect(CU_PROVINCES.map(p => p.code)).toEqual(['PRI', 'ART', 'LHA', 'MAY', 'MTZ', 'CFG', 'VCL', 'SSP', 'CAV', 'CMG', 'LTU', 'HOL', 'GRA', 'SCU', 'GTM', 'IJV'])
		expect(provinceName('lha')).toBe('La Habana')
		expect(provinceName('XX')).toBe('XX')
		expect(municipalitiesOf('XX')).toEqual([])
	})
})

describe('carnet de identidad', () => {
	test('87021332646 es válido', () => {
		expect(isCubanIdentification('87021332646')).toBe(true)
		expect(identificationProblem('87021332646')).toBeNull()
		expect(identificationMessage('87021332646')).toBeNull()
	})

	test('con 10 dígitos falta uno', () => {
		expect(identificationProblem('8702133264')).toBe('short')
		expect(identificationMessage('8702133264')).toBe('Falta 1 dígito (son 11)')
		expect(identificationMessage('870213')).toBe('Faltan 5 dígitos (son 11)')
		expect(identificationProblem('')).toBe('short')
	})

	test('el mes 13 y el día 32 fallan por la fecha', () => {
		expect(identificationProblem('87131332646')).toBe('date')
		expect(identificationProblem('87023232646')).toBe('date')
		expect(identificationProblem('87001332646')).toBe('date')
		expect(identificationProblem('87020032646')).toBe('date')
		expect(identificationMessage('87131332646')).toMatch(/AAMMDD/)
	})

	test('un pegado con texto queda en 11 dígitos y vale', () => {
		expect(normalizeIdentification('CI: 870213 32646')).toBe('87021332646')
		expect(isCubanIdentification(normalizeIdentification('CI: 870213 32646'))).toBe(true)
		expect(normalizeIdentification('870213326461234')).toBe('87021332646')
		expect(normalizeIdentification(null)).toBe('')
	})
})

describe('municipios', () => {
	test('el canónico se recupera sin acentos ni mayúsculas', () => {
		expect(canonicalMunicipality('CMG', 'camaguey')).toBe('Camagüey')
		expect(canonicalMunicipality('lha', '  plaza   de la revolucion ')).toBe('Plaza de la Revolución')
		expect(canonicalMunicipality('LHA', 'Camagüey')).toBeNull()
		expect(canonicalMunicipality('LHA', '')).toBeNull()
	})

	test('municipalityCovered compara sin acentos', () => {
		const map = { CMG: ['Camagüey', 'Florida'] }
		expect(municipalityCovered(map, { country: 'CU', state: 'CMG', city: 'CAMAGUEY' })).toBe(true)
		expect(municipalityCovered(map, { country: 'CU', state: 'CMG', city: 'Nuevitas' })).toBe(false)
		expect(municipalityCovered(map, { country: 'US', state: 'FL', city: 'Florida' })).toBe(false)
		expect(municipalityCovered(null, { country: 'US' })).toBe(true)
	})

	test('mergeDeliveryMunicipalities cruza dos productos por provincia', () => {
		const a = { LHA: ['Playa', 'Plaza de la Revolución', 'Cerro'], MTZ: ['Cárdenas'] }
		const b = { LHA: ['Plaza de la Revolucion', 'Playa'], CMG: ['Camagüey'] }
		expect(mergeDeliveryMunicipalities([a, null, b])).toEqual({ LHA: ['Playa', 'Plaza de la Revolución'] })
		expect(mergeDeliveryMunicipalities([null, undefined])).toBeNull()
		expect(mergeDeliveryMunicipalities([a])).toEqual(a)
	})
})

describe('supplierAddressIssue', () => {
	const cuba = { balance_only: true, ship_country: 'CU', delivery_municipalities: { LHA: ['Playa'] } }
	const addr = { country: 'CU', state: 'LHA', city: 'Playa', identification: '87021332646' }

	test('una dirección cubana cubierta y con carnet sirve', () => {
		expect(supplierAddressIssue(cuba, addr)).toBeNull()
		expect(supplierAddressIssue(null, addr)).toBeNull()
		expect(supplierAddressIssue(cuba, null)).toBeNull()
	})

	test('municipio no cubierto, con su nombre', () => {
		expect(supplierAddressIssue(cuba, { ...addr, city: 'Cerro' })).toBe('Esta tienda no entrega en Cerro.')
	})

	test('sin carnet válido', () => {
		expect(supplierAddressIssue(cuba, { ...addr, identification: null })).toBe('La dirección necesita el carnet de identidad del destinatario.')
		expect(supplierAddressIssue(cuba, { ...addr, identification: '87131332646' })).toBe('La dirección necesita el carnet de identidad del destinatario.')
	})

	test('la tienda espejo de EE. UU. solo pide una dirección de allí, sin carnet', () => {
		const us = { balance_only: true, ship_country: 'US', delivery_municipalities: null }
		expect(supplierAddressIssue(us, { country: 'US', state: 'FL', city: 'Miami' })).toBeNull()
		expect(supplierAddressIssue(us, addr)).toBe('Esta tienda solo envía a direcciones en Estados Unidos.')
		expect(supplierNeedsIdentification(us)).toBe(false)
		expect(supplierNeedsIdentification(cuba)).toBe(true)
		expect(supplierNeedsIdentification(null)).toBe(false)
	})

	test('una cubana sin carnet o con municipio a mano necesita completarse', () => {
		expect(cubaAddressNeedsCompletion(addr)).toBe(false)
		expect(cubaAddressNeedsCompletion({ ...addr, identification: '' })).toBe(true)
		expect(cubaAddressNeedsCompletion({ ...addr, city: 'Miramar' })).toBe(true)
		expect(cubaAddressNeedsCompletion({ country: 'US', state: 'FL', city: 'Miami' })).toBe(false)
	})
})

describe('formatAddress', () => {
	test('una cubana sin código postal nunca imprime null', () => {
		const text = formatAddress({ recipient_name: 'María', line1: 'Calle 23 #456', line2: null, city: 'Playa', state: 'LHA', postal_code: null, country: 'CU' })
		expect(text).toBe('María — Calle 23 #456, Playa, La Habana')
		expect(text).not.toMatch(/null|undefined/)
	})

	test('la de EE. UU. sigue igual', () => {
		expect(formatAddress({ recipient_name: 'John', line1: '123 Main St', line2: 'Apt 4B', city: 'Miami', state: 'FL', postal_code: '33033' }))
			.toBe('John — 123 Main St, Apt 4B, Miami, FL 33033')
	})
})

describe('formulario de Cuba', () => {
	test('valida con las reglas del servidor, en el orden de los campos', () => {
		expect(validateCubaAddress(cubaForm())).toBeNull()
		expect(validateAddress(cubaForm(), 'CU')).toBeNull()
		expect(validateCubaAddress(cubaForm({ recipient_name: 'M' }))).toMatch(/nombre/)
		expect(validateCubaAddress(cubaForm({ phone: '5512' }))).toMatch(/8 dígitos/)
		expect(validateCubaAddress(cubaForm({ state: 'FL' }))).toBe('Selecciona la provincia')
		expect(validateCubaAddress(cubaForm({ city: 'Miramar' }))).toBe('Elige el municipio de la lista')
		expect(validateCubaAddress(cubaForm({ line1: 'C' }))).toBe('Escribe la calle y el número')
		expect(validateCubaAddress(cubaForm({ identification: '8702133' }))).toBe('Faltan 4 dígitos (son 11)')
		// Sin ZIP: la validación de EE. UU. no aplica
		expect(validateAddress(cubaForm(), 'US')).not.toBeNull()
	})

	test('el cuerpo lleva el municipio canónico, la provincia y solo los dígitos del carnet', () => {
		const body = buildAddressBody(cubaForm({ city: 'plaza de la revolucion', identification: '87021332646', line2: '' }), 'CU')
		expect(body).toEqual({
			recipient_name: 'María Pérez',
			phone: '5 512 3456',
			line1: 'Calle 23 #456',
			line2: null,
			city: 'Plaza de la Revolución',
			state: 'LHA',
			country: 'CU',
			identification: '87021332646',
		})
		expect(body).not.toHaveProperty('postal_code')
	})

	test('el de EE. UU. no manda carnet', () => {
		const body = buildAddressBody({ ...EMPTY_ADDRESS_FORM, recipient_name: 'John', line1: '123 Main St', city: 'Miami', state: 'FL', postal_code: '33033', identification: '87021332646' })
		expect(body.country).toBe('US')
		expect(body.postal_code).toBe('33033')
		expect(body).not.toHaveProperty('identification')
	})

	test('completar una dirección vieja obliga a elegir el municipio si no es de la lista', () => {
		const saved = { uuid: 'a1', recipient_name: 'María', phone: null, identification: null, line1: 'Calle 23', line2: null, city: 'Miramar', state: 'LHA', postal_code: null, country: 'CU' }
		const form = formFromSavedAddress(saved)
		expect(form.city).toBe('')
		expect(form.state).toBe('LHA')
		expect(form.identification).toBe('')
		expect(formFromSavedAddress({ ...saved, city: 'playa' }).city).toBe('Playa')
		expect(formFromSavedAddress({ ...saved, state: 'Habana' }).state).toBe('')
	})
})
