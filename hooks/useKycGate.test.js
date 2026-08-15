/**
 * Behavior tests del gate de KYC (useKycGate): passthrough con kyc, bloqueo
 * con mensaje cuando falta, bypass con `gated: false` (montos bajo el umbral)
 * y ciclo abrir/cerrar del modal — node environment con AuthContext mockeado.
 * @jest-environment node
 */
jest.mock('../auth/AuthContext', () => ({ useAuth: jest.fn() }))

import React from 'react'
import { act, create } from 'react-test-renderer'
import { useAuth } from '../auth/AuthContext'
import useKycGate, { KYC_TRANSFER_THRESHOLD, KYC_WITHDRAW_THRESHOLD } from './useKycGate'

let hookValue
const Probe = () => {
	hookValue = useKycGate()
	return null
}

const renderHook = () => {
	act(() => { create(<Probe />) })
	return hookValue
}

beforeEach(() => {
	jest.clearAllMocks()
	useAuth.mockReturnValue({ user: { kyc: false } })
})

test('exporta los umbrales espejo del backend', () => {
	expect(KYC_TRANSFER_THRESHOLD).toBe(500)
	expect(KYC_WITHDRAW_THRESHOLD).toBe(1000)
})

test('con kyc la acción pasa sin modal', () => {
	useAuth.mockReturnValue({ user: { kyc: true } })
	const value = renderHook()
	let allowed
	act(() => { allowed = value.requireKyc({ message: 'x' }) })
	expect(allowed).toBe(true)
	expect(hookValue.gateVisible).toBe(false)
})

test('sin kyc bloquea y muestra el modal con el mensaje del caller', () => {
	const value = renderHook()
	let allowed
	act(() => { allowed = value.requireKyc({ message: 'Los envíos de $500 o más requieren KYC' }) })
	expect(allowed).toBe(false)
	expect(hookValue.gateVisible).toBe(true)
	expect(hookValue.gateMessage).toBe('Los envíos de $500 o más requieren KYC')
})

test('gated: false (monto bajo el umbral) pasa aunque no haya kyc', () => {
	const value = renderHook()
	let allowed
	act(() => { allowed = value.requireKyc({ gated: 300 >= KYC_TRANSFER_THRESHOLD, message: 'x' }) })
	expect(allowed).toBe(true)
	expect(hookValue.gateVisible).toBe(false)
})

test('closeGate oculta el modal y limpia el mensaje', () => {
	const value = renderHook()
	act(() => { value.requireKyc({ message: 'x' }) })
	expect(hookValue.gateVisible).toBe(true)
	act(() => { hookValue.closeGate() })
	expect(hookValue.gateVisible).toBe(false)
	expect(hookValue.gateMessage).toBe(null)
})
