/**
 * Unit tests for the biometry-support detection hook, rendered with
 * react-test-renderer in the node environment with the Keychain-backed
 * client helpers mocked (see keypadAmount.test.js for why node).
 * @jest-environment node
 */
jest.mock('../../api/client', () => ({
	getSupportedBiometryType: jest.fn(),
	hasBiometricCredentials: jest.fn(),
}))

import React from 'react'
import { act, create } from 'react-test-renderer'
import { getSupportedBiometryType, hasBiometricCredentials } from '../../api/client'
import useBiometricSupport from './useBiometricSupport'

// Minimal hook harness: renders the hook inside a throwaway component and
// exposes its latest return value through `result.current`. Async because
// the detection effect resolves promises on mount.
const renderHook = async () => {
	const result = { current: null }
	const Harness = () => {
		result.current = useBiometricSupport()
		return null
	}
	let root
	await act(async () => { root = create(React.createElement(Harness)) })
	return { result, root }
}

beforeEach(() => {
	jest.clearAllMocks()
	getSupportedBiometryType.mockResolvedValue(null)
	hasBiometricCredentials.mockResolvedValue(false)
})

describe('detection on mount', () => {
	test('exposes the biometry type and stored-credentials flag', async () => {
		getSupportedBiometryType.mockResolvedValue('FaceID')
		hasBiometricCredentials.mockResolvedValue(true)
		const { result } = await renderHook()
		expect(result.current.biometryType).toBe('FaceID')
		expect(result.current.hasBiometrics).toBe(true)
		expect(getSupportedBiometryType).toHaveBeenCalledTimes(1)
		expect(hasBiometricCredentials).toHaveBeenCalledTimes(1)
	})

	test('supported biometry without enrolled credentials', async () => {
		getSupportedBiometryType.mockResolvedValue('TouchID')
		hasBiometricCredentials.mockResolvedValue(false)
		const { result } = await renderHook()
		expect(result.current.biometryType).toBe('TouchID')
		expect(result.current.hasBiometrics).toBe(false)
	})

	test('an unsupported device stays at the null/false defaults', async () => {
		const { result } = await renderHook()
		expect(result.current.biometryType).toBeNull()
		expect(result.current.hasBiometrics).toBe(false)
	})

	test('a failing biometry check is swallowed silently', async () => {
		getSupportedBiometryType.mockRejectedValue(new Error('keychain dead'))
		const { result } = await renderHook()
		expect(result.current.biometryType).toBeNull()
		expect(result.current.hasBiometrics).toBe(false)
	})

	test('a failing credentials check discards the biometry type too (both set together)', async () => {
		getSupportedBiometryType.mockResolvedValue('Fingerprint')
		hasBiometricCredentials.mockRejectedValue(new Error('keychain dead'))
		const { result } = await renderHook()
		expect(result.current.biometryType).toBeNull()
		expect(result.current.hasBiometrics).toBe(false)
	})
})

describe('setHasBiometrics', () => {
	test('lets a screen flip the flag after enrolling without re-mounting', async () => {
		getSupportedBiometryType.mockResolvedValue('FaceID')
		hasBiometricCredentials.mockResolvedValue(false)
		const { result } = await renderHook()
		expect(result.current.hasBiometrics).toBe(false)
		act(() => { result.current.setHasBiometrics(true) })
		expect(result.current.hasBiometrics).toBe(true)
		expect(result.current.biometryType).toBe('FaceID')
	})
})

describe('unmount guard', () => {
	test('a check resolving after unmount does not update state or throw', async () => {
		let resolveType
		getSupportedBiometryType.mockReturnValue(new Promise((resolve) => { resolveType = resolve }))
		hasBiometricCredentials.mockResolvedValue(true)

		const result = { current: null }
		const Harness = () => {
			result.current = useBiometricSupport()
			return null
		}
		let root
		act(() => { root = create(React.createElement(Harness)) })
		act(() => { root.unmount() })

		await expect(act(async () => { resolveType('FaceID') })).resolves.toBeUndefined()
		// the `active` guard means the last observed state is still the defaults
		expect(result.current.biometryType).toBeNull()
		expect(result.current.hasBiometrics).toBe(false)
	})
})
