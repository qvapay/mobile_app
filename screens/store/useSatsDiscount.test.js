/**
 * Behavior tests for the useSatsDiscount hook — estimate math for the store
 * satoshi discount and the post-purchase local user patch. Node environment
 * with AuthContext mocked (see settings/useSettingsState.test.js for the
 * hook-testing pattern).
 * @jest-environment node
 */
jest.mock('../../auth/AuthContext', () => ({ useAuth: jest.fn() }))

import React from 'react'
import { act, create } from 'react-test-renderer'
import { useAuth } from '../../auth/AuthContext'
import useSatsDiscount from './useSatsDiscount'

// Probe component: exposes the latest hook result to the test
let hookResult
const Probe = ({ totalUsd }) => {
	hookResult = useSatsDiscount(totalUsd)
	return null
}

const renderHook = async (totalUsd) => {
	let tree
	await act(async () => { tree = create(<Probe totalUsd={totalUsd} />) })
	return tree
}

const updateUser = jest.fn()

beforeEach(() => {
	jest.clearAllMocks()
	useAuth.mockReturnValue({ user: { balance: 50, satoshis: 10000, satoshis_usd: 6, btc_price: 60000 }, updateUser })
})

test('unavailable without sats or without satoshis_usd (backend not deployed yet)', async () => {
	useAuth.mockReturnValue({ user: { balance: 50, satoshis: 0, satoshis_usd: 0 }, updateUser })
	await renderHook(25)
	expect(hookResult.available).toBe(false)
	expect(hookResult.cashDue).toBe(25)

	useAuth.mockReturnValue({ user: { balance: 50, satoshis: 10000 }, updateUser })
	await renderHook(25)
	expect(hookResult.available).toBe(false)
})

test('disabled by default: no discount, cashDue equals the total', async () => {
	await renderHook(25)
	expect(hookResult.available).toBe(true)
	expect(hookResult.enabled).toBe(false)
	expect(hookResult.discountUsd).toBe(0)
	expect(hookResult.cashDue).toBe(25)
})

test('enabled with partial coverage: discount = sats value, cashDue = the rest', async () => {
	await renderHook(25)
	await act(async () => { hookResult.setEnabled(true) })
	expect(hookResult.discountUsd).toBe(6)
	expect(hookResult.cashDue).toBe(19)
})

test('enabled with full coverage: discount capped at the total, cashDue 0', async () => {
	await renderHook(4)
	await act(async () => { hookResult.setEnabled(true) })
	expect(hookResult.discountUsd).toBe(4)
	expect(hookResult.cashDue).toBe(0)
})

test('applyPurchaseResult patches balance by cash_paid and refreshes sats + satoshis_usd', async () => {
	await renderHook(25)
	hookResult.applyPurchaseResult({ cash_paid: 19, sats_applied: 10000, satoshis: 0 }, 25)
	expect(updateUser).toHaveBeenCalledWith({ balance: 31, satoshis: 0, satoshis_usd: 0 })
})

test('applyPurchaseResult without sats fields falls back to the full total', async () => {
	await renderHook(25)
	hookResult.applyPurchaseResult({ message: 'ok' }, 25)
	expect(updateUser).toHaveBeenCalledWith({ balance: 25 })
})
