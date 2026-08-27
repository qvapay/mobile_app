/**
 * Behavior tests del flujo de verificación de identidad nativo
 * (useKycVerification): mapeo del resultado del SDK a los outcomes
 * discriminados, sincronización optimista del user local, fallback a
 * navegador cuando el backend no manda session_token o el SDK falla, y
 * propagación de los códigos HTTP del POST /user/kyc — node environment
 * con SDK/API/AuthContext/Linking mockeados.
 * @jest-environment node
 */
jest.mock('react-native', () => ({ Linking: { openURL: jest.fn(async () => true) } }))
jest.mock('../api/userApi', () => ({ userApi: { requestKYCSession: jest.fn() } }))
jest.mock('../auth/AuthContext', () => ({ useAuth: jest.fn() }))
jest.mock('./useKycPrompt', () => ({ markKycSessionStarted: jest.fn() }))

import React from 'react'
import { act, create } from 'react-test-renderer'
import { Linking } from 'react-native'
import { startVerification } from '@didit-protocol/sdk-react-native'
import { userApi } from '../api/userApi'
import { useAuth } from '../auth/AuthContext'
import { markKycSessionStarted } from './useKycPrompt'
import useKycVerification from './useKycVerification'

const SESSION_URL = 'https://verify.didit.me/session/tok.en.jwt'

let hookValue
const Probe = () => {
	hookValue = useKycVerification()
	return null
}

const renderHook = async () => {
	await act(async () => { create(<Probe />) })
	return hookValue
}

const updateUser = jest.fn()

beforeEach(() => {
	jest.clearAllMocks()
	useAuth.mockReturnValue({ updateUser })
	userApi.requestKYCSession.mockResolvedValue({ success: true, data: SESSION_URL, sessionToken: 'tok.en.jwt', status: 200 })
})

const launch = async (options) => {
	const value = await renderHook()
	let result
	await act(async () => { result = await value.launchKyc(options) })
	return result
}

describe('flujo nativo', () => {
	test('aprobada: sincroniza el user local y devuelve approved', async () => {
		startVerification.mockResolvedValue({ type: 'completed', session: { sessionId: 's1', status: 'Approved' } })
		const result = await launch()
		expect(result).toEqual({ kind: 'native', outcome: 'approved' })
		expect(updateUser).toHaveBeenCalledWith({ kyc: true, kyc_status: 'approved' })
		expect(markKycSessionStarted).toHaveBeenCalled()
		expect(Linking.openURL).not.toHaveBeenCalled()
	})

	test('en revisión: marca pending sin tocar el flag kyc', async () => {
		startVerification.mockResolvedValue({ type: 'completed', session: { sessionId: 's1', status: 'Pending' } })
		const result = await launch()
		expect(result).toEqual({ kind: 'native', outcome: 'pending' })
		expect(updateUser).toHaveBeenCalledWith({ kyc_status: 'pending' })
	})

	test('rechazada: marca declined', async () => {
		startVerification.mockResolvedValue({ type: 'completed', session: { sessionId: 's1', status: 'Declined' } })
		const result = await launch()
		expect(result).toEqual({ kind: 'native', outcome: 'declined' })
		expect(updateUser).toHaveBeenCalledWith({ kyc_status: 'declined' })
	})

	test('cancelada por el usuario: sin efectos secundarios', async () => {
		startVerification.mockResolvedValue({ type: 'cancelled' })
		const result = await launch()
		expect(result).toEqual({ kind: 'native', outcome: 'cancelled' })
		expect(updateUser).not.toHaveBeenCalled()
		// Cancelar en el primer segundo no puede silenciar el nudge del Home 48h
		expect(markKycSessionStarted).not.toHaveBeenCalled()
	})

	test('estado ilegible: NO se inventa un pending local', async () => {
		// El atajo de antes (cualquier completed no-Approved/Declined => pending) era lo
		// que dejaba a un usuario mirando "en revisión" sin nada en revisión.
		startVerification.mockResolvedValue({ type: 'completed', session: { sessionId: 's1', status: 'Whatever' } })
		const result = await launch()
		expect(result).toEqual({ kind: 'native', outcome: 'unknown' })
		expect(updateUser).not.toHaveBeenCalled()
	})

	test('completed sin sesión: también es unknown, no pending', async () => {
		startVerification.mockResolvedValue({ type: 'completed' })
		const result = await launch()
		expect(result).toEqual({ kind: 'native', outcome: 'unknown' })
		expect(updateUser).not.toHaveBeenCalled()
	})
})

describe('fallback a navegador', () => {
	test('backend sin session_token (despliegue anterior): abre la URL hospedada', async () => {
		userApi.requestKYCSession.mockResolvedValue({ success: true, data: SESSION_URL, sessionToken: null, status: 200 })
		const result = await launch()
		expect(result).toEqual({ kind: 'browser' })
		expect(Linking.openURL).toHaveBeenCalledWith(SESSION_URL)
		expect(startVerification).not.toHaveBeenCalled()
		expect(markKycSessionStarted).toHaveBeenCalled()
	})

	test('el SDK falla por red: rescata por navegador en vez de dejar al usuario tirado', async () => {
		startVerification.mockResolvedValue({ type: 'failed', error: { type: 'networkError', message: 'offline' } })
		const result = await launch()
		expect(result).toEqual({ kind: 'browser' })
		expect(Linking.openURL).toHaveBeenCalledWith(SESSION_URL)
	})

	test('permiso de cámara negado: NO rescata por navegador (mensaje accionable)', async () => {
		startVerification.mockResolvedValue({ type: 'failed', error: { type: 'cameraAccessDenied', message: 'denied' } })
		const result = await launch()
		expect(result).toEqual({ kind: 'sdk-error', errorType: 'cameraAccessDenied', message: 'denied' })
		expect(Linking.openURL).not.toHaveBeenCalled()
	})
})

describe('sesión nueva forzada', () => {
	test('refresh viaja al backend para saltar su caché de sesiones', async () => {
		// La salida de quien aterriza en el "esta sesión no existe" del proveedor.
		await launch({ refresh: true })
		expect(userApi.requestKYCSession).toHaveBeenCalledWith({ refresh: true })
	})

	test('sin argumentos no se fuerza nada', async () => {
		await launch()
		expect(userApi.requestKYCSession).toHaveBeenCalledWith({ refresh: false })
	})
})

describe('errores del POST /user/kyc', () => {
	test('propaga status y mensaje sin lanzar el SDK', async () => {
		userApi.requestKYCSession.mockResolvedValue({ success: false, status: 409, error: 'En revisión' })
		const result = await launch()
		expect(result).toEqual({ kind: 'request-error', status: 409, reason: undefined, message: 'En revisión' })
		expect(startVerification).not.toHaveBeenCalled()
		expect(markKycSessionStarted).not.toHaveBeenCalled()
	})

	test('propaga el reason que separa el 403 retenido del que no lo es', async () => {
		userApi.requestKYCSession.mockResolvedValue({ success: false, status: 403, reason: 'limit', error: 'Revisión manual' })
		const result = await launch()
		expect(result).toEqual({ kind: 'request-error', status: 403, reason: 'limit', message: 'Revisión manual' })
	})

	test('una excepción del SDK degrada a sdk-error, nunca revienta la pantalla', async () => {
		startVerification.mockRejectedValue(new Error('native crash'))
		const result = await launch()
		expect(result).toEqual({ kind: 'sdk-error', message: 'native crash' })
	})
})
