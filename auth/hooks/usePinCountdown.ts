import { useRef, useState, useEffect } from 'react'
import i18n from '../../i18n'

// mm:ss formatter — pure, so it lives at module scope instead of being rebuilt each render
const format = (s: number): string => `${Math.floor(s / 60).toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`

/**
 * Drives the "Solicitar PIN" cooldown timer: `start(seconds)` disables the
 * button and counts down a `mm:ss` label once per second, restoring the
 * default label when it hits zero. The interval is cleared on unmount and
 * restarted (not stacked) if `start` is called again mid-countdown.
 *
 * The remaining-seconds counter lives in a ref, not state: it ticks every second
 * but the component only needs to re-render when the *visible label* changes. The
 * raw counter is an instance value (like a debounce accumulator) and must not
 * trigger reconciliation on every tick.
 * See https://react.dev/reference/react/useRef
 *
 * @returns `label` (either the localized "Solicitar PIN" or the remaining
 *   time), `isDisabled`, and `start` (defaults to 60s).
 */
export default function usePinCountdown(): { label: string, isDisabled: boolean, start: (seconds?: number) => void } {

	// Initializer runs at mount, so the label resolves in the active language
	const [label, setLabel] = useState(() => i18n.t('hooks.pinCountdown.requestPin'))
	const [isDisabled, setIsDisabled] = useState(false)
	const remainingRef = useRef(0)
	const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

	const stop = () => {
		if (intervalRef.current) {
			clearInterval(intervalRef.current)
			intervalRef.current = null
		}
	}

	const start = (seconds: number = 60) => {
		stop()
		remainingRef.current = seconds
		setIsDisabled(true)
		setLabel(format(seconds))
		intervalRef.current = setInterval(() => {
			remainingRef.current -= 1
			if (remainingRef.current <= 0) {
				stop()
				setIsDisabled(false)
				setLabel(i18n.t('hooks.pinCountdown.requestPin'))
			} else { setLabel(format(remainingRef.current)) }
		}, 1000)
	}

	// Clear any running interval on unmount
	useEffect(() => stop, [])

	return { label, isDisabled, start }
}
