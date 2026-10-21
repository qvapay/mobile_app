import { useRef, useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'

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
 * trigger reconciliation on every tick. Only the `mm:ss` text is state; the idle
 * label is derived (translated) on render.
 * See https://react.dev/reference/react/useRef
 *
 * @returns `label` (either the localized "Solicitar PIN" or the remaining
 *   time), `isDisabled`, and `start` (defaults to 60s).
 */
export default function usePinCountdown(): { label: string, isDisabled: boolean, start: (seconds?: number) => void } {

	// La etiqueta en reposo se traduce en CADA render (no al montar): una pantalla
	// montada antes de que LanguageSync aplique el idioma real, o que sigue abierta
	// cuando el usuario lo cambia, se quedaba con «Solicitar PIN» en el de antes
	const { t } = useTranslation()
	const [countdown, setCountdown] = useState<string | null>(null)
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
		setCountdown(format(seconds))
		intervalRef.current = setInterval(() => {
			remainingRef.current -= 1
			if (remainingRef.current <= 0) {
				stop()
				setCountdown(null)
			} else { setCountdown(format(remainingRef.current)) }
		}, 1000)
	}

	// Clear any running interval on unmount
	useEffect(() => stop, [])

	return { label: countdown ?? t('hooks.pinCountdown.requestPin'), isDisabled: countdown !== null, start }
}
