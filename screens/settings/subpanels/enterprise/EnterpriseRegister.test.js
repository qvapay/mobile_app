/**
 * Recorrido del wizard de registro con la pantalla real: qué pinta cada rama y qué
 * llega a `userApi.registerCompany`. La lógica de cada campo está en
 * enterpriseForm.test.js; aquí se cubre lo que solo se ve montando la pantalla: la
 * rama TCP no enseña país ni socios, el documento es opcional y se puede quitar, una
 * empresa declara a sus socios (el REEUP ya no se pide), y cambiar de rama no deja
 * datos fiscales, socios ni el PDF de la otra.
 * @jest-environment node
 */
jest.mock('../../../../theme/ThemeContext', () => {
	const { createTheme } = jest.requireActual('../../../../theme/themeTokens')
	return { useTheme: () => ({ theme: createTheme(true) }) }
})
jest.mock('react-native-reanimated', () => ({ __esModule: true, default: { View: 'AnimatedView' } }))
jest.mock('@react-native-vector-icons/fontawesome6', () => 'FontAwesome6')
jest.mock('../../../../ui/particles/QPInput', () => 'QPInput')
jest.mock('../../../../ui/particles/QPPressable', () => 'QPPressable')
jest.mock('../../../../ui/particles/QPStepDots', () => 'QPStepDots')
jest.mock('../../../../ui/particles/QPSplitButton', () => 'QPSplitButton')
jest.mock('../../../../ui/QPKeyboardAvoidingView', () => 'QPKeyboardAvoidingView')
jest.mock('../../../../ui/OptionPickerModal', () => 'OptionPickerModal')
jest.mock('../../../../hooks/useStepTransitions', () => () => ({ direction: { value: 1 }, makeStepEnter: () => ({}), stepExit: {} }))
jest.mock('@react-native-documents/picker', () => ({
	pick: jest.fn(),
	types: { pdf: 'application/pdf' },
	errorCodes: { OPERATION_CANCELED: 'OPERATION_CANCELED' },
	isErrorWithCode: () => false,
}))
jest.mock('../../../../api/userApi', () => ({ userApi: { registerCompany: jest.fn() } }))
jest.mock('sonner-native', () => ({ toast: { success: jest.fn(), error: jest.fn(), info: jest.fn() } }))

import React from 'react'
import { act, create } from 'react-test-renderer'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { pick } from '@react-native-documents/picker'
import { userApi } from '../../../../api/userApi'
import { toast } from 'sonner-native'
import EnterpriseRegister from './EnterpriseRegister'

const NIT = '12345678901'
const PDF = { uri: 'file:///proyecto.pdf', name: 'proyecto.pdf', size: 1024 * 1024, type: 'application/pdf' }

let client
let tree
const navigation = { setOptions: jest.fn(), goBack: jest.fn() }

const textOf = (node) => (typeof node === 'string' ? node : (node.children || []).map(textOf).join(''))

// Solo lo que se lee en pantalla: los modales ocultos del selector de país no cuentan
const screenText = () => tree.root.findAll((n) => n.type === 'Text').map(textOf).join('\n')

/** Pulsa el QPPressable cuyo texto (o etiqueta de accesibilidad) contiene `label`. */
const press = async (label) => {
	const match = tree.root.findAll((n) => n.type === 'QPPressable' && (textOf(n).includes(label) || n.props.accessibilityLabel === label))
	expect(match.length).toBeGreaterThan(0)
	await act(async () => { await match[0].props.onPress() })
}

const inputs = (placeholder) => tree.root.findAll((n) => n.type === 'QPInput' && n.props.placeholder === placeholder)

/** Escribe en el campo con ese placeholder; `index` elige la fila de socio. */
const type = async (placeholder, value, index = 0) => {
	await act(async () => { inputs(placeholder)[index].props.onChangeText(value) })
}

const inputValue = (placeholder, index = 0) => inputs(placeholder)[index].props.value

const footer = () => tree.root.findAll((n) => n.type === 'QPSplitButton')[0]
const next = async () => { await act(async () => { await footer().props.onPress() }) }
const back = async () => { await act(async () => { footer().props.onBack() }) }

const fillTcpStepOne = async () => {
	await type('Taller Pérez', 'Taller Pérez')
	await type('Comercio electrónico, servicios, etc.', 'Reparación de equipos')
	await press('1–10')
}

const fillTcpContact = async () => {
	await type('Juan Pérez García', 'Pedro Pérez')
	await type('tu@correo.com', 'pedro@correo.cu')
}

const fillBusinessStepOne = async () => {
	await type('Mi Empresa S.L.', 'Mi Empresa')
	await type('Comercio electrónico, servicios, etc.', 'Servicios')
	await press('1–10')
}

const fillBusinessContact = async () => {
	await type('Juan Pérez García', 'Juan Pérez')
	await type('director@empresa.com', 'juan@empresa.com')
}

const selectCountry = async (code) => {
	const modal = tree.root.findAll((n) => n.type === 'OptionPickerModal' && n.props.title === 'País de constitución')[0]
	await act(async () => { modal.props.onSelect(code) })
}

beforeEach(async () => {
	jest.clearAllMocks()
	userApi.registerCompany.mockResolvedValue({ success: true, data: { uuid: 'u' }, status: 200 })
	pick.mockResolvedValue([PDF])
	client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
	await act(async () => {
		tree = create(<QueryClientProvider client={client}><EnterpriseRegister navigation={navigation} /></QueryClientProvider>)
	})
})

afterEach(async () => {
	await act(async () => { tree.unmount() })
	client.clear()
})

describe('rama cuenta propia', () => {
	test('la nota solo sale al elegirla, y el paso habla de negocio', async () => {
		expect(screenText()).toContain('¿Qué vas a registrar?')
		expect(screenText()).toContain('Tu empresa')
		expect(screenText()).not.toContain('sin socios ni estatutos')

		await press('Cuenta propia')

		expect(screenText()).toContain('Tu negocio')
		expect(screenText()).toContain('sin socios ni estatutos')
		expect(screenText()).toContain('Nombre del negocio')
		expect(screenText()).not.toContain('Nombre de la PYME')
	})

	test('el paso fiscal enseña Cuba fija y el NIT, sin selector de país ni socios', async () => {
		await press('Cuenta propia')
		await fillTcpStepOne()
		await next()

		expect(screenText()).toContain('Tu NIT')
		expect(screenText()).toContain('Cuba')
		expect(screenText()).toContain('El NIT que te asignó la ONAT.')
		expect(screenText()).not.toContain('Socios de la empresa')
		expect(screenText()).not.toContain('País de constitución')
		expect(screenText()).not.toContain('Selecciona el país')

		await next()
		expect(toast.info).toHaveBeenCalledWith('Ingresa un NIT válido (11 dígitos).')
		expect(screenText()).toContain('Tu NIT')
	})

	test('sin PDF se envía sin archivo y con la carga de un TCP', async () => {
		await press('Cuenta propia')
		await fillTcpStepOne()
		await next()
		await type('11 dígitos', NIT)
		await next()
		expect(screenText()).toContain('Contacto y documento')
		expect(screenText()).toContain('opcional')
		await fillTcpContact()
		await next()

		expect(userApi.registerCompany).toHaveBeenCalledTimes(1)
		const { fields, file } = userApi.registerCompany.mock.calls[0][0]
		expect(file).toBeNull()
		expect(fields).toEqual({
			orgKind: 'tcp',
			country: 'CU',
			taxId: NIT,
			companyName: 'Taller Pérez',
			activity: 'Reparación de equipos',
			employeeCount: '1-10',
			directorName: 'Pedro Pérez',
			email: 'pedro@correo.cu',
		})
		expect(toast.success).toHaveBeenCalled()
		expect(navigation.goBack).toHaveBeenCalled()
	})

	test('con PDF el archivo viaja', async () => {
		await press('Cuenta propia')
		await fillTcpStepOne()
		await next()
		await type('11 dígitos', NIT)
		await next()
		await fillTcpContact()
		await press('Elegir archivo PDF')
		expect(screenText()).toContain('proyecto.pdf')
		await next()

		expect(userApi.registerCompany.mock.calls[0][0].file).toBe(PDF)
	})

	test('un PDF de más de 10 MB se puede quitar y enviar sin él', async () => {
		pick.mockResolvedValue([{ ...PDF, size: 11 * 1024 * 1024 }])
		await press('Cuenta propia')
		await fillTcpStepOne()
		await next()
		await type('11 dígitos', NIT)
		await next()
		await fillTcpContact()
		await press('Elegir archivo PDF')

		await next()
		expect(toast.info).toHaveBeenCalledWith('El archivo no debe superar los 10MB.')
		expect(userApi.registerCompany).not.toHaveBeenCalled()

		await press('Quitar archivo')
		expect(screenText()).not.toContain('proyecto.pdf')
		await next()
		expect(userApi.registerCompany.mock.calls[0][0].file).toBeNull()
	})
})

describe('rama empresa', () => {
	test('sigue pidiendo país y estatutos, sin botón de quitar, y no envía orgKind', async () => {
		await fillBusinessStepOne()
		await next()
		expect(screenText()).toContain('Datos fiscales')
		expect(screenText()).toContain('País de constitución')

		await next()
		expect(toast.info).toHaveBeenCalledWith('Selecciona el país de constitución de la empresa.')

		await selectCountry('MX')
		await type('RFC, RUC, NIT, CIF…', 'ACM010203AB1')
		await next()
		expect(screenText()).toContain('Contacto y estatutos')
		await fillBusinessContact()

		await next()
		expect(toast.info).toHaveBeenCalledWith('Adjunta los estatutos de la empresa en PDF.')
		expect(userApi.registerCompany).not.toHaveBeenCalled()

		await press('Elegir archivo PDF')
		const remove = tree.root.findAll((n) => n.props.accessibilityLabel === 'Quitar archivo')
		expect(remove).toHaveLength(0)

		await next()
		const { fields, file } = userApi.registerCompany.mock.calls[0][0]
		expect(file).toBe(PDF)
		expect(fields.orgKind).toBeUndefined()
		expect(fields.country).toBe('MX')
		expect(fields.owners).toBe('[]')
	})
})

describe('socios', () => {
	const toFiscalStep = async (country) => {
		await fillBusinessStepOne()
		await next()
		await selectCountry(country)
	}

	test('salen al elegir el país, y sin REEUP', async () => {
		await fillBusinessStepOne()
		await next()
		expect(screenText()).not.toContain('Socios de la empresa')

		await selectCountry('CU')
		expect(screenText()).toContain('Socios de la empresa')
		expect(screenText()).toContain('todos los socios que aparecen en la escritura')
		expect(screenText()).not.toContain('REEUP')
	})

	test('la regla que se explica cambia con el país, y los socios escritos se quedan', async () => {
		await toFiscalStep('CU')
		await type('Nombre completo', 'Ana García')

		await selectCountry('MX')
		expect(screenText()).toContain('Solo personas con 25% o más de participación')
		expect(screenText()).not.toContain('aparecen en la escritura')
		expect(inputValue('Nombre completo')).toBe('Ana García')
	})

	test('una empresa cubana no pasa sin socios', async () => {
		await toFiscalStep('CU')
		await type('11 dígitos', NIT)
		await next()
		expect(toast.info).toHaveBeenCalledWith('Agrega a todos los socios que aparecen en la escritura de la empresa.')
		expect(screenText()).toContain('Datos fiscales')
	})

	test('una empresa cubana se envía con todos sus socios y sin REEUP', async () => {
		await toFiscalStep('CU')
		await type('11 dígitos', NIT)
		await type('Nombre completo', 'Ana García')
		await type('%', '60,5')
		await type('Email (opcional)', 'Ana@Pyme.cu')
		await press('Otro socio')
		await type('Nombre completo', 'Luis Soto', 1)
		await type('%', '39.5', 1)
		await type('Usuario QvaPay', '@luis', 1)
		await next()
		await fillBusinessContact()
		await press('Elegir archivo PDF')
		await next()

		expect(userApi.registerCompany).toHaveBeenCalledTimes(1)
		const { fields } = userApi.registerCompany.mock.calls[0][0]
		expect(fields).toEqual({
			country: 'CU',
			taxId: NIT,
			companyName: 'Mi Empresa',
			activity: 'Servicios',
			employeeCount: '1-10',
			directorName: 'Juan Pérez',
			email: 'juan@empresa.com',
			owners: JSON.stringify([
				{ name: 'Ana García', pct: 60.5, email: 'ana@pyme.cu', username: null },
				{ name: 'Luis Soto', pct: 39.5, email: null, username: 'luis' },
			]),
		})
	})

	test('fuera de Cuba un socio de menos del 25 % no pasa, y dejar la fila vacía sí', async () => {
		await toFiscalStep('MX')
		await type('RFC, RUC, NIT, CIF…', 'ACM010203AB1')
		await type('Nombre completo', 'Ana García')
		await type('%', '10')
		await next()
		expect(toast.info).toHaveBeenCalledWith('Fuera de Cuba solo se declaran socios con 25% o más de participación (Ana García no llega).')
		expect(screenText()).toContain('Datos fiscales')

		await type('Nombre completo', '')
		await type('%', '')
		await next()
		expect(screenText()).toContain('Contacto y estatutos')
	})

	test('quitar un socio se lleva su fila, no la de al lado', async () => {
		await toFiscalStep('CU')
		expect(tree.root.findAll((n) => n.props.accessibilityLabel === 'Quitar socio 1')).toHaveLength(0)

		await type('Nombre completo', 'Ana García')
		await press('Otro socio')
		await type('Nombre completo', 'Luis Soto', 1)
		await press('Quitar socio 1')

		expect(inputs('Nombre completo')).toHaveLength(1)
		expect(inputValue('Nombre completo')).toBe('Luis Soto')
		expect(tree.root.findAll((n) => n.props.accessibilityLabel === 'Quitar socio 1')).toHaveLength(0)
	})

	test('el botón de añadir desaparece en el tope de 20', async () => {
		await toFiscalStep('CU')
		for (let i = 1; i < 20; i += 1) { await press('Otro socio') }
		expect(inputs('Nombre completo')).toHaveLength(20)
		expect(screenText()).not.toContain('Otro socio')

		await press('Quitar socio 20')
		expect(screenText()).toContain('Otro socio')
	})
})

describe('cambiar de rama', () => {
	test('de empresa cubana a TCP y vuelta no deja NIT, socios ni país', async () => {
		await fillBusinessStepOne()
		await next()
		await selectCountry('CU')
		await type('11 dígitos', NIT)
		await type('Nombre completo', 'Ana García')
		await press('Otro socio')
		await back()

		await press('Cuenta propia')
		await type('Taller Pérez', 'Taller Pérez')
		await next()
		expect(inputValue('11 dígitos')).toBe('')
		await back()

		await press('Empresa')
		await next()
		expect(screenText()).toContain('Selecciona el país…')

		await selectCountry('CU')
		expect(inputs('Nombre completo')).toHaveLength(1)
		expect(inputValue('Nombre completo')).toBe('')
		expect(inputValue('11 dígitos')).toBe('')
	})

	test('el PDF no pasa de una rama a la otra', async () => {
		await press('Cuenta propia')
		await fillTcpStepOne()
		await next()
		await type('11 dígitos', NIT)
		await next()
		await press('Elegir archivo PDF')
		expect(screenText()).toContain('proyecto.pdf')
		await back()
		await back()

		await press('Empresa')
		await type('Mi Empresa S.L.', 'Mi Empresa')
		await next()
		await selectCountry('MX')
		await type('RFC, RUC, NIT, CIF…', 'ACM010203AB1')
		await next()
		expect(screenText()).not.toContain('proyecto.pdf')
		expect(screenText()).toContain('Elegir archivo PDF')
	})

	test('volver a pulsar la rama activa no borra nada', async () => {
		await press('Cuenta propia')
		await fillTcpStepOne()
		await next()
		await type('11 dígitos', NIT)
		await back()
		await press('Cuenta propia')
		await next()
		expect(inputValue('11 dígitos')).toBe(NIT)
	})
})
