import { createContext, use, useState, useRef, useCallback } from 'react'

const LoadingContext = createContext()

// Anti-flicker floor: once shown, the bar stays visible at least this long
const MIN_DISPLAY_MS = 300

/**
 * Reference-counted loading state that drives `GlobalLoadingBar`.
 *
 * `startLoading`/`stopLoading` increment/decrement a counter held in a ref, so
 * overlapping requests produce one continuous bar (visible while count > 0).
 * Hiding is delayed to honor a 300ms minimum display time — a burst of quick
 * requests doesn't flicker. All callbacks are stable (`useCallback` with no deps).
 *
 * Wiring: App.tsx's `LoadingBridge` passes `startLoading`/`stopLoading` to the
 * axios client via `registerLoadingCallbacks`, so every request drives the bar
 * automatically unless it opts out with `{ silent: true }` in its config.
 *
 * @param {{ children: React.ReactNode }} props
 */
export const LoadingProvider = ({ children }) => {
	const countRef = useRef(0)
	const showTimeRef = useRef(null)
	const hideTimerRef = useRef(null)
	const [isLoading, setIsLoading] = useState(false)

	const startLoading = useCallback(() => {
		countRef.current += 1
		if (countRef.current === 1) {
			if (hideTimerRef.current) {
				clearTimeout(hideTimerRef.current)
				hideTimerRef.current = null
			}
			showTimeRef.current = Date.now()
			setIsLoading(true)
		}
	}, [])

	const stopLoading = useCallback(() => {
		countRef.current = Math.max(0, countRef.current - 1)
		if (countRef.current === 0) {
			const elapsed = Date.now() - (showTimeRef.current || 0)
			const remaining = MIN_DISPLAY_MS - elapsed
			if (remaining > 0) {
				hideTimerRef.current = setTimeout(() => {
					hideTimerRef.current = null
					if (countRef.current === 0) {
						setIsLoading(false)
					}
				}, remaining)
			} else {
				setIsLoading(false)
			}
		}
	}, [])

	// Escape hatch for a stuck bar: zero the counter and hide immediately
	// (e.g. after a hard navigation reset where stopLoading calls were lost)
	const resetLoading = useCallback(() => {
		countRef.current = 0
		if (hideTimerRef.current) {
			clearTimeout(hideTimerRef.current)
			hideTimerRef.current = null
		}
		setIsLoading(false)
	}, [])

	const value = { isLoading, startLoading, stopLoading, resetLoading }

	return (
		<LoadingContext.Provider value={value}>
			{children}
		</LoadingContext.Provider>
	)
}

/**
 * Consumes the loading context. Throws if used outside a `LoadingProvider`.
 *
 * @returns {{ isLoading: boolean, startLoading: () => void, stopLoading: () => void, resetLoading: () => void }}
 */
export const useLoading = () => {
	const context = use(LoadingContext)
	if (!context) { throw new Error('useLoading must be used within a LoadingProvider') }
	return context
}
