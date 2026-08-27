/**
 * Behavior tests del nudge de KYC (useKycPrompt): visibilidad del banner según
 * el estado del usuario (sin kyc / retenido / verificado), descartes con
 * cooldown, gracia de 48h tras abrir una sesión de Didit, y los flags
 * módulo-level markKycSessionStarted / markKycOnHold — node environment con
 * AsyncStorage y AuthContext mockeados (ver useSettingsState.test.js para el harness).
 * @jest-environment node
 */
const storage = {}
jest.mock('@react-native-async-storage/async-storage', () => ({
	__esModule: true,
	default: {
		getMany: jest.fn(async (keys) => Object.fromEntries(keys.map((k) => [k, storage[k] ?? null]))),
		setMany: jest.fn(async (pairs) => { Object.assign(storage, pairs) }),
		setItem: jest.fn(async (k, v) => { storage[k] = v }),
		removeItem: jest.fn(async (k) => { delete storage[k] }),
	},
}))
jest.mock('../auth/AuthContext', () => ({ useAuth: jest.fn() }))

import React from 'react'
import { act, create } from 'react-test-renderer'
import { useAuth } from '../auth/AuthContext'
import useKycPrompt, { markKycSessionStarted, markKycOnHold } from './useKycPrompt'

const DAY_MS = 24 * 60 * 60 * 1000

let hookValue
const Probe = () => {
	hookValue = useKycPrompt()
	return null
}

const renderHook = async () => {
	await act(async () => { create(<Probe />) })
	return hookValue
}

beforeEach(() => {
	jest.clearAllMocks()
	for (const key of Object.keys(storage)) delete storage[key]
	useAuth.mockReturnValue({ user: { kyc: false, kyc_status: 'none' } })
})

describe('visibilidad del banner', () => {
	test('se muestra para un usuario sin kyc y sin historial de descartes', async () => {
		const value = await renderHook()
		expect(value.shouldShowBanner).toBe(true)
		expect(value.isPending).toBe(false)
	})

	test('no se muestra si el usuario ya tiene kyc', async () => {
		useAuth.mockReturnValue({ user: { kyc: true, kyc_status: 'approved' } })
		const value = await renderHook()
		expect(value.shouldShowBanner).toBe(false)
	})

	test('un rechazo ordinario SÍ se sigue empujando: el backend deja reintentar', async () => {
		// Antes bastaba kyc_status='declined' para callar el banner, y esa columna la
		// comparten el retén de compliance y un "la foto salió borrosa". Al segundo hay
		// que seguir empujándolo o se pierde la verificación por nada.
		useAuth.mockReturnValue({ user: { kyc: false, kyc_status: 'declined' } })
		const value = await renderHook()
		expect(value.shouldShowBanner).toBe(true)
	})

	test('un caso RETENIDO por el equipo no se nagea', async () => {
		await markKycOnHold(true)
		useAuth.mockReturnValue({ user: { kyc: false, kyc_status: 'declined' } })
		const value = await renderHook()
		expect(value.shouldShowBanner).toBe(false)
	})

	test('levantar el retén vuelve a habilitar el banner', async () => {
		await markKycOnHold(true)
		await markKycOnHold(false)
		const value = await renderHook()
		expect(value.shouldShowBanner).toBe(true)
	})

	test('kyc_status pending expone isPending y sigue sin kyc', async () => {
		useAuth.mockReturnValue({ user: { kyc: false, kyc_status: 'pending' } })
		const value = await renderHook()
		expect(value.isPending).toBe(true)
	})
})

describe('descartes y cooldown', () => {
	test('descartar oculta el banner y persiste conteo + timestamp', async () => {
		const value = await renderHook()
		await act(async () => { await value.dismissBanner() })
		expect(hookValue.shouldShowBanner).toBe(false)
		expect(storage.kyc_banner_dismiss_count).toBe('1')
		expect(Number(storage.kyc_banner_last_dismiss)).toBeGreaterThan(0)
	})

	test('reaparece pasado el cooldown de 5 días', async () => {
		storage.kyc_banner_dismiss_count = '2'
		storage.kyc_banner_last_dismiss = String(Date.now() - 6 * DAY_MS)
		const value = await renderHook()
		expect(value.shouldShowBanner).toBe(true)
	})

	test('dentro del cooldown permanece oculto', async () => {
		storage.kyc_banner_dismiss_count = '2'
		storage.kyc_banner_last_dismiss = String(Date.now() - 1 * DAY_MS)
		const value = await renderHook()
		expect(value.shouldShowBanner).toBe(false)
	})

	test('tras agotar los 5 descartes no vuelve aunque pase el cooldown', async () => {
		storage.kyc_banner_dismiss_count = '5'
		storage.kyc_banner_last_dismiss = String(Date.now() - 30 * DAY_MS)
		const value = await renderHook()
		expect(value.shouldShowBanner).toBe(false)
	})
})

describe('gracia post-sesión de Didit', () => {
	test('markKycSessionStarted persiste el timestamp y silencia el banner 48h', async () => {
		await markKycSessionStarted()
		expect(Number(storage.kyc_session_started_at)).toBeGreaterThan(0)
		const value = await renderHook()
		expect(value.shouldShowBanner).toBe(false)
	})

	test('pasada la gracia sin kyc, el banner vuelve a empujar', async () => {
		storage.kyc_session_started_at = String(Date.now() - 3 * DAY_MS)
		const value = await renderHook()
		expect(value.shouldShowBanner).toBe(true)
	})
})
