/**
 * Unit tests for the incoming-money sound — node environment con los contexts
 * y el reproductor mockeados (ver keypadAmount.test.js para el porqué del env).
 * @jest-environment node
 */
jest.mock('../helpers/playSound', () => jest.fn())
jest.mock('../auth/AuthContext', () => ({ useAuth: jest.fn() }))
jest.mock('../settings/SettingsContext', () => ({ useSettings: jest.fn() }))

import React from 'react'
import { act, create } from 'react-test-renderer'

import playSound from '../helpers/playSound'
import { useAuth } from '../auth/AuthContext'
import { useSettings } from '../settings/SettingsContext'
import useIncomingMoneySound, {
	markIncomingSoundPlayed,
	hasIncomingSoundPlayed,
	isIncomingTransaction,
	findIncomingArrivals,
} from './useIncomingMoneySound'

const ME = 'me-uuid'
const OTHER = 'other-uuid'

// El baúl de uuids ya sonados vive a nivel de módulo (dedupe con la push), así
// que cada test usa uuids propios — igual que en producción, donde no se repiten
let seq = 0
const id = (name) => `${name}-${seq}`

const incoming = (uuid, status = 'paid') => ({ uuid, status, amount: '10.00', PaidBy: { uuid: OTHER } })
const outgoing = (uuid, status = 'paid') => ({ uuid, status, amount: '10.00', PaidBy: { uuid: ME } })

const renderSound = (list) => {
	const Harness = ({ transactions }) => { useIncomingMoneySound(transactions); return null }
	let tree
	act(() => { tree = create(<Harness transactions={list} />) })
	return {
		tree,
		update: (next) => act(() => { tree.update(<Harness transactions={next} />) }),
	}
}

beforeEach(() => {
	jest.clearAllMocks()
	seq += 1
	useAuth.mockReturnValue({ user: { uuid: ME } })
	useSettings.mockReturnValue({ sounds: { enabled: true, transactionSound: true } })
})

describe('isIncomingTransaction', () => {

	test('el dinero entra cuando el pagador no soy yo', () => {
		expect(isIncomingTransaction(incoming('a'), ME)).toBe(true)
		expect(isIncomingTransaction(outgoing('a'), ME)).toBe(false)
	})

	test('un depósito sin pagador también entra', () => {
		expect(isIncomingTransaction({ uuid: 'a', status: 'paid' }, ME)).toBe(true)
	})

	test('sin usuario no hay dirección que decidir', () => {
		expect(isIncomingTransaction(incoming('a'), '')).toBe(false)
	})
})

describe('findIncomingArrivals', () => {

	test('solo lo no visto, entrante y asentado', () => {
		const list = [incoming('nueva'), incoming('vista'), outgoing('salida'), incoming('pendiente', 'pending')]
		const arrivals = findIncomingArrivals(list, ME, new Set(['vista']))
		expect(arrivals.map(t => t.uuid)).toEqual(['nueva'])
	})
})

describe('useIncomingMoneySound', () => {

	test('la primera lista es línea base y no suena', () => {
		renderSound([incoming('a'), incoming('b')])
		expect(playSound).not.toHaveBeenCalled()
	})

	test('una transacción entrante nueva hace sonar la moneda', () => {
		const { update } = renderSound([incoming(id('a'))])
		update([incoming(id('b')), incoming(id('a'))])
		expect(playSound).toHaveBeenCalledTimes(1)
		expect(playSound).toHaveBeenCalledWith('money_in')
	})

	test('dos cobros a la vez suenan una sola vez', () => {
		const { update } = renderSound([incoming(id('a'))])
		update([incoming(id('c')), incoming(id('b')), incoming(id('a'))])
		expect(playSound).toHaveBeenCalledTimes(1)
	})

	test('una transacción propia (saliente) no suena', () => {
		const { update } = renderSound([incoming(id('a'))])
		update([outgoing(id('b')), incoming(id('a'))])
		expect(playSound).not.toHaveBeenCalled()
	})

	test('una entrante aún pendiente no suena hasta asentarse', () => {
		const { update } = renderSound([incoming(id('a'))])
		update([incoming(id('b'), 'pending'), incoming(id('a'))])
		expect(playSound).not.toHaveBeenCalled()
		update([incoming(id('b'), 'paid'), incoming(id('a'))])
		expect(playSound).toHaveBeenCalledTimes(1)
	})

	test('la misma lista repetida no vuelve a sonar', () => {
		const { update } = renderSound([incoming(id('a'))])
		update([incoming(id('b')), incoming(id('a'))])
		update([incoming(id('b')), incoming(id('a'))])
		expect(playSound).toHaveBeenCalledTimes(1)
	})

	test('con el sonido apagado en ajustes no suena', () => {
		useSettings.mockReturnValue({ sounds: { enabled: false, transactionSound: true } })
		const { update } = renderSound([incoming(id('a'))])
		update([incoming(id('b')), incoming(id('a'))])
		expect(playSound).not.toHaveBeenCalled()
	})

	test('con transactionSound apagado tampoco', () => {
		useSettings.mockReturnValue({ sounds: { enabled: true, transactionSound: false } })
		const { update } = renderSound([incoming(id('a'))])
		update([incoming(id('b')), incoming(id('a'))])
		expect(playSound).not.toHaveBeenCalled()
	})

	test('lo ya sonado por la push no vuelve a sonar en el refresco', () => {
		const { update } = renderSound([incoming(id('a'))])
		markIncomingSoundPlayed(id('push'))
		expect(hasIncomingSoundPlayed(id('push'))).toBe(true)
		update([incoming(id('push')), incoming(id('a'))])
		expect(playSound).not.toHaveBeenCalled()
	})

	test('sin sesión no se establece línea base: al entrar la cuenta no suena', () => {
		useAuth.mockReturnValue({ user: null })
		const { update } = renderSound([incoming(id('sin-sesion'))])
		useAuth.mockReturnValue({ user: { uuid: ME } })
		update([incoming(id('sin-sesion'))])
		expect(playSound).not.toHaveBeenCalled()
	})
})
