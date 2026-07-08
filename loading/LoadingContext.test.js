/**
 * Unit tests for the reference-counted loading state behind GlobalLoadingBar —
 * node environment with react-test-renderer (see keypadAmount.test.js for why).
 * @jest-environment node
 */
import React from 'react'
import { act, create } from 'react-test-renderer'
import { LoadingProvider, useLoading } from './LoadingContext'

const renderLoading = async () => {
	const result = { current: null }
	const Harness = () => {
		result.current = useLoading()
		return null
	}
	await act(async () => {
		create(
			<LoadingProvider>
				<Harness />
			</LoadingProvider>
		)
	})
	return result
}

beforeEach(() => { jest.useFakeTimers() })
afterEach(() => { jest.useRealTimers() })

test('useLoading throws outside a LoadingProvider', () => {
	const Naked = () => {
		useLoading()
		return null
	}
	expect(() => { act(() => { create(<Naked />) }) }).toThrow('useLoading must be used within a LoadingProvider')
})

test('starts hidden and shows while at least one request is in flight', async () => {
	const loading = await renderLoading()
	expect(loading.current.isLoading).toBe(false)
	await act(async () => { loading.current.startLoading() })
	expect(loading.current.isLoading).toBe(true)
})

test('overlapping requests produce one continuous bar (reference counting)', async () => {
	const loading = await renderLoading()
	await act(async () => {
		loading.current.startLoading()
		loading.current.startLoading()
	})
	// First request finishes long after the floor; second still in flight
	await act(async () => { jest.advanceTimersByTime(500) })
	await act(async () => { loading.current.stopLoading() })
	expect(loading.current.isLoading).toBe(true)
	await act(async () => { loading.current.stopLoading() })
	expect(loading.current.isLoading).toBe(false)
})

test('a quick request keeps the bar visible for the 300ms anti-flicker floor', async () => {
	const loading = await renderLoading()
	await act(async () => { loading.current.startLoading() })
	await act(async () => { jest.advanceTimersByTime(100) })
	await act(async () => { loading.current.stopLoading() })
	expect(loading.current.isLoading).toBe(true) // floor not reached yet
	await act(async () => { jest.advanceTimersByTime(199) })
	expect(loading.current.isLoading).toBe(true)
	await act(async () => { jest.advanceTimersByTime(1) })
	expect(loading.current.isLoading).toBe(false)
})

test('a slow request hides immediately once the floor already elapsed', async () => {
	const loading = await renderLoading()
	await act(async () => { loading.current.startLoading() })
	await act(async () => { jest.advanceTimersByTime(400) })
	await act(async () => { loading.current.stopLoading() })
	expect(loading.current.isLoading).toBe(false)
})

test('a new request during the delayed hide cancels it', async () => {
	const loading = await renderLoading()
	await act(async () => { loading.current.startLoading() })
	await act(async () => { jest.advanceTimersByTime(100) })
	await act(async () => { loading.current.stopLoading() })
	// hide is scheduled in 200ms — a new request must keep the bar on
	await act(async () => { loading.current.startLoading() })
	await act(async () => { jest.advanceTimersByTime(1000) })
	expect(loading.current.isLoading).toBe(true)
})

test('extra stopLoading calls do not underflow the counter', async () => {
	const loading = await renderLoading()
	await act(async () => { loading.current.stopLoading() })
	await act(async () => { loading.current.startLoading() })
	expect(loading.current.isLoading).toBe(true)
})

test('resetLoading zeroes the counter and hides immediately (stuck-bar escape hatch)', async () => {
	const loading = await renderLoading()
	await act(async () => {
		loading.current.startLoading()
		loading.current.startLoading()
	})
	await act(async () => { loading.current.resetLoading() })
	expect(loading.current.isLoading).toBe(false)
	// lost stopLoading calls after the reset must not break the next cycle
	await act(async () => { loading.current.startLoading() })
	expect(loading.current.isLoading).toBe(true)
})
