import { useState, useEffect } from "react"

/** Urgencia de la ventana de pago: 'ok' (≥15 min), 'warn' (<15) y 'low' (<5). */
export type PaymentWindowTone = 'ok' | 'warn' | 'low'

export type PaymentWindow = {
	remainingMs: number | null
	/** Formato m:ss, o null si no hay ventana. */
	label: string | null
	expired: boolean
	tone: PaymentWindowTone | null
}

/**
 * Live payment-window countdown for a P2P trade. Ticks once per second while a
 * window exists; pass null to disable (no interval runs).
 *
 * @param expiresAtIso - ISO timestamp of the window end, or null.
 * @returns `label` is m:ss; `tone` maps to urgency — 'ok' (≥15 min), 'warn' (<15) y 'low' (<5).
 */
export default function usePaymentWindow(expiresAtIso: string | null | undefined): PaymentWindow {

	const expiresAt = expiresAtIso ? new Date(expiresAtIso).getTime() : null

	const [nowTs, setNowTs] = useState(() => Date.now())
	useEffect(() => {
		if (!expiresAt) return undefined
		setNowTs(Date.now())
		const id = setInterval(() => setNowTs(Date.now()), 1000)
		return () => clearInterval(id)
	}, [expiresAt])

	if (!expiresAt) return { remainingMs: null, label: null, expired: false, tone: null }

	const remainingMs = Math.max(0, expiresAt - nowTs)
	const label = `${Math.floor(remainingMs / 60000)}:${String(Math.floor((remainingMs % 60000) / 1000)).padStart(2, "0")}`
	const expired = remainingMs === 0
	const tone = remainingMs < 5 * 60000 ? "low" : remainingMs < 15 * 60000 ? "warn" : "ok"

	return { remainingMs, label, expired, tone }
}
