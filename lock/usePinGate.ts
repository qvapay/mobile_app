import { useEffect, useState } from 'react'

import { useAppLock } from './AppLockContext'
import { pinGate } from './pinAttempts'
import type { PinGate } from './pinAttempts'

/**
 * Límite de intentos del PIN, vivo: mientras hay espera el reloj avanza cada segundo y, al
 * cumplirse, la puerta se abre sola. Lo comparten LockScreen y WalletAuthModal para pintar
 * lo mismo; quien DECIDE es `verifyAppLockPin` del contexto, que vuelve a mirar el reloj.
 */
export const usePinGate = (): PinGate => {

	const { pinAttempts, ownerProofAvailable } = useAppLock()
	const [now, setNow] = useState(() => Date.now())

	// El contador cambió (otro fallo, o el contexto lo corrigió porque el reloj se atrasó):
	// se vuelve a mirar la hora, que fuera de una espera no avanza sola
	useEffect(() => { setNow(Date.now()) }, [pinAttempts])

	// Hasta que ese efecto corra, un fallo recién anotado puede ir por delante de `now`
	const at = Math.max(now, pinAttempts?.lastFailureAt ?? 0)
	const gate = pinGate(pinAttempts, at, { ownerProofAvailable: ownerProofAvailable !== false })

	const waiting = gate.kind === 'wait'
	useEffect(() => {
		if (!waiting) return
		const timer = setInterval(() => setNow(Date.now()), 1000)
		return () => clearInterval(timer)
	}, [waiting])

	return gate
}
