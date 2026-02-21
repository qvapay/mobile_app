import { createContext, useContext, useState, useRef, useCallback } from 'react'

const LoadingContext = createContext()

const MIN_DISPLAY_MS = 300

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

export const useLoading = () => {
	const context = useContext(LoadingContext)
	if (!context) { throw new Error('useLoading must be used within a LoadingProvider') }
	return context
}
