/**
 * Formulario de una cuenta de Cuba por un método de EE. UU.: pinta las opciones y los textos que
 * manda el servidor, enseña solo lo que pide el propósito y nunca deja elegir la cuenta propia suspendida.
 * @jest-environment node
 */
jest.mock('@react-native-vector-icons/fontawesome6', () => 'FontAwesome6')
jest.mock('../../ui/particles/QPPressable', () => 'QPPressable')
jest.mock('../../ui/particles/QPInput', () => 'QPInput')
jest.mock('../../ui/particles/QPCheckbox', () => 'QPCheckbox')
jest.mock('../../ui/CountryPickerModal', () => 'CountryPickerModal')
jest.mock('./WithdrawInvoiceField', () => 'WithdrawInvoiceField')

import React from 'react'
import { Text } from 'react-native'
import { act, create } from 'react-test-renderer'
import { createTheme } from '../../theme/themeTokens'
import UsRailPurposeCard from './UsRailPurposeCard'
import { emptyUsRailValue } from './usRail'

const theme = createTheme(true)
const KEYS = ['notProhibitedOfficial', 'notProhibitedPartyMember', 'notRestrictedList', 'lawfulPurpose']
const REQ = {
	applies: true, enforced: true, ticks: ['PAYPAL'], own_account_suspended: true, text_version: 'v',
	payees: [{ code: 'third_party', label: 'Un vendedor o servicio' }, { code: 'own', label: 'Una cuenta mía', suspended: true }],
	purposes: [
		{ code: 'E-1', label: 'Mercancía', summary: 'resumen E-1', needs: [] },
		{ code: 'S-1', label: 'Servicio', summary: 'resumen S-1', needs: [] },
		{ code: 'OTHER', label: 'Otro', summary: 'resumen otro', needs: [] },
	],
	service_kinds: [{ code: 'internet', label: 'Internet' }, { code: 'software', label: 'Software' }],
	declarations: KEYS.map(key => ({ key, es: `ES ${key}`, en: `EN ${key}` })),
	goods_attestation: { text_version: 'v', es: 'Declaro en nombre de {entity} que pago USD {amount} a {payee}.', en: 'I declare on behalf of {entity}.' },
	note_min_length: 10,
	invoice: { field: 'invoice', max_bytes: 10485760 },
	messages: { required: 'r', own_suspended: 'Suspendido por la junta', invoice: 'i' },
}

let tree
const render = async (props = {}) => {
	const onChange = jest.fn()
	await act(async () => {
		tree = create(<UsRailPurposeCard req={REQ} value={emptyUsRailValue(KEYS)} onChange={onChange} language="es" onChangeLanguage={jest.fn()}
			amount="250" invoice={null} invoiceRequired={false} onChangeInvoice={jest.fn()} theme={theme} textStyles={{}} {...props} />)
	})
	return onChange
}
const texts = () => tree.root.findAllByType(Text).map(n => [].concat(n.props.children).join(''))
// El testID pasa del componente de la sección a su pulsable: vale el primero que lo lleve
const byTestID = (id) => tree.root.findAll(n => n.props.testID === id)[0]

test('pinta las opciones del servidor y las declaraciones en el idioma elegido', async () => {
	await render()
	const all = texts()
	expect(all).toEqual(expect.arrayContaining(['Un vendedor o servicio', 'Una cuenta mía', 'Mercancía', 'Servicio', 'Otro', `ES ${KEYS[0]}`]))
	await render({ language: 'en' })
	expect(texts()).toContain(`EN ${KEYS[0]}`)
})

test('elegir a un tercero y marcar una declaración actualiza el valor', async () => {
	const onChange = await render()
	await act(async () => { byTestID('us-rail-payee-third_party').props.onPress() })
	expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ payee: 'third_party' }))
	await act(async () => { byTestID(`us-rail-declaration-${KEYS[1]}`).props.onPress() })
	expect(onChange.mock.lastCall[0].attestations[KEYS[1]]).toBe(true)
})

test('la cuenta propia suspendida enseña el aviso del servidor y oculta el resto', async () => {
	await render({ value: { ...emptyUsRailValue(KEYS), payee: 'own' } })
	expect(byTestID('us-rail-own-blocked')).toBeTruthy()
	expect(texts()).toContain('Suspendido por la junta')
	expect(byTestID('us-rail-purpose-S-1')).toBeUndefined()
})

test('E-1 rellena la Atestación A con los datos del retiro', async () => {
	await render({ value: { ...emptyUsRailValue(KEYS), payee: 'third_party', purpose: 'E-1', recipient: { name: 'Vendor Inc', country: 'US' }, goodsA: { entity: 'Mi Mipyme', invoice: '', endUser: '', accepted: false } } })
	expect(texts()).toContain('Declaro en nombre de Mi Mipyme que pago USD 250.00 a Vendor Inc.')
	expect(byTestID('us-rail-goods-accept')).toBeTruthy()
})

test('con factura obligatoria monta el campo de la factura', async () => {
	await render({ value: { ...emptyUsRailValue(KEYS), payee: 'third_party' }, invoiceRequired: true })
	expect(tree.root.findByType('WithdrawInvoiceField').props.reason).toBe('third_party')
})
