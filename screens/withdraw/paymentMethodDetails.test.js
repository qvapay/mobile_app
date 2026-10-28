/**
 * Detalles de un método guardado ↔ formulario de retiro: pares o mapa, alias
 * key/val, casado sin mayúsculas y payload por el nombre original del campo.
 * @jest-environment node
 */
import { normalizeMethodDetails, detailsToForm, formToDetails } from './paymentMethodDetails'

const FIELDS = [{ name: 'Card Number' }, { name: 'Nombre y Apellidos' }]

test('normalizeMethodDetails acepta pares, alias key/val y mapa plano', () => {
	expect(normalizeMethodDetails([{ name: 'Wallet', value: 'T1' }, { key: 'Memo', val: 7 }, null])).toEqual([{ name: 'Wallet', value: 'T1' }, { name: 'Memo', value: '7' }])
	expect(normalizeMethodDetails({ Wallet: 'T1', Memo: null })).toEqual([{ name: 'Wallet', value: 'T1' }, { name: 'Memo', value: '' }])
	expect(normalizeMethodDetails(null)).toEqual([])
	expect(normalizeMethodDetails(undefined)).toEqual([])
})

test('detailsToForm casa por nombre sin distinguir mayúsculas y deja vacío lo que falta', () => {
	expect(detailsToForm({ 'card number': '9224 0699' }, FIELDS)).toEqual({ card_number: '9224 0699', nombre_y_apellidos: '' })
	expect(detailsToForm([{ name: 'NOMBRE Y APELLIDOS', value: 'Ana' }, { name: 'Otro', value: 'x' }], FIELDS)).toEqual({ card_number: '', nombre_y_apellidos: 'Ana' })
	expect(detailsToForm(null, FIELDS)).toEqual({ card_number: '', nombre_y_apellidos: '' })
})

test('formToDetails devuelve el payload por el nombre original, sin bordes', () => {
	expect(formToDetails({ card_number: ' 9224 ', nombre_y_apellidos: 'Ana' }, FIELDS)).toEqual({ 'Card Number': '9224', 'Nombre y Apellidos': 'Ana' })
	expect(formToDetails({}, FIELDS)).toEqual({ 'Card Number': '', 'Nombre y Apellidos': '' })
})

test('ida y vuelta: lo que se guarda se puede volver a cargar', () => {
	const saved = formToDetails({ card_number: '1', nombre_y_apellidos: 'Ana' }, FIELDS)
	expect(detailsToForm(saved, FIELDS)).toEqual({ card_number: '1', nombre_y_apellidos: 'Ana' })
})
