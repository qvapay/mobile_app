/**
 * Recorrido del wizard de registro con la pantalla real: qué pinta cada rama y qué
 * llega a `userApi.registerCompany`. La lógica de cada campo está en
 * enterpriseForm.test.js; aquí se cubre lo que solo se ve montando la pantalla: la
 * rama TCP no enseña país ni REEUP, el documento es opcional y se puede quitar, y
 * cambiar de rama no deja datos fiscales ni el PDF de la otra.
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

const type = async (placeholder, value) => {
	const input = tree.root.findAll((n) => n.type === 'QPInput' && n.props.placeholder === placeholder)[0]
	await act(async () => { input.props.onChangeText(value) })
}

const inputValue = (placeholder) => tree.root.findAll((n) => n.type === 'QPInput' && n.props.placeholder === placeholder)[0].props.value

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

	test('el paso fiscal enseña Cuba fija y el NIT, sin selector de país ni REEUP', async () => {
		await press('Cuenta propia')
		await fillTcpStepOne()
		await next()

		expect(screenText()).toContain('Tu NIT')
		expect(screenText()).toContain('Cuba')
		expect(screenText()).toContain('El NIT que te asignó la ONAT.')
		expect(screenText()).not.toContain('REEUP')
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
		await type('Juan Pérez García', 'Juan Pérez')
		await type('director@empresa.com', 'juan@empresa.com')

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
	})

	test('una empresa cubana sigue viendo el REEUP', async () => {
		await fillBusinessStepOne()
		await next()
		await selectCountry('CU')
		expect(screenText()).toContain('Código REEUP')
	})
})

describe('cambiar de rama', () => {
	test('de empresa cubana a TCP y vuelta no deja NIT, REEUP ni país', async () => {
		await fillBusinessStepOne()
		await next()
		await selectCountry('CU')
		await type('11 dígitos', NIT)
		await type('123.4.56789', '123.4.56789')
		await back()

		await press('Cuenta propia')
		await type('Taller Pérez', 'Taller Pérez')
		await next()
		expect(inputValue('11 dígitos')).toBe('')
		await back()

		await press('Empresa')
		await next()
		expect(screenText()).toContain('Selecciona el país…')
		expect(screenText()).not.toContain('Código REEUP')
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
