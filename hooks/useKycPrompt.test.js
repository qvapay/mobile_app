/**
 * Behavior tests del nudge de KYC (useKycPrompt): visibilidad del banner según
 * el estado del usuario (sin kyc / declined / verificado), descartes con
 * cooldown, gracia de 48h tras abrir una sesión de Didit, y el flag
 * módulo-level markKycSessionStarted — node environment con AsyncStorage y
 * AuthContext mockeados (ver useSettingsState.test.js para el harness).
 * @jest-environment node
 */
const storage = {}
jest.mock('@react-native-async-storage/async-storage', () => ({
	__esModule: true,
	default: {
		getMany: jest.fn(async (keys) => Object.fromEntries(keys.map((k) => [k, storage[k] ?? null]))),
		setMany: jest.fn(async (pairs) => { Object.assign(storage, pairs) }),
		setItem: jest.fn(async (k, v) => { storage[k] = v }),
	},
}))
jest.mock('../auth/AuthContext', () => ({ useAuth: jest.fn() }))

import React from 'react'
import { act, create } from 'react-test-renderer'
import { useAuth } from '../auth/AuthContext'
import useKycPrompt, { markKycSessionStarted } from './useKycPrompt'

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

	test('una verificación rechazada es caso de soporte, no de nag', async () => {
		useAuth.mockReturnValue({ user: { kyc: false, kyc_status: 'declined' } })
		const value = await renderHook()
		expect(value.shouldShowBanner).toBe(false)
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
