import { useMemo, useState } from 'react'
import { useAuth } from '../../auth/AuthContext'
import type { User } from '../../types/domain'

/**
 * Lo autoritativo que devuelve una compra de la tienda: cuánto saldo se gastó
 * de verdad y cuántos satoshis quedan. `res.data` de storeApi viaja como
 * `unknown`, así que los call sites lo castean a esta forma.
 */
export type StorePurchaseResult = { cash_paid?: number, satoshis?: number }

/** Lo que expone el hook a los resúmenes de compra de la tienda. */
export type SatsDiscount = {
	available: boolean
	enabled: boolean
	setEnabled: (value: boolean) => void
	sats: number
	satsUsd: number
	discountUsd: number
	cashDue: number
	applyPurchaseResult: (data: StorePurchaseResult | null | undefined, fallbackTotal: number) => void
}

/**
 * Client-side estimate of the satoshi discount for a store purchase.
 * Reads `user.satoshis` / `user.satoshis_usd` (market value computed by the
 * backend on /user/extended) and derives how much of `totalUsd` the sats would
 * cover if the "Usar mis satoshis" toggle is on. Estimates only — the server
 * recomputes the discount at live BTC price inside the purchase transaction;
 * these numbers just drive the summary UI (rendered with "≈").
 * `applyPurchaseResult` folds the authoritative response (`cash_paid`,
 * `satoshis` remaining) back into the local user so balances refresh
 * without a refetch.
 *
 * @param totalUsd - Total price of the purchase in USD.
 * @returns Estado del toggle, cifras estimadas y el volcado del resultado real.
 */
export default function useSatsDiscount(totalUsd: number): SatsDiscount {

	const { user, updateUser } = useAuth()
	const [enabled, setEnabled] = useState(false)

	const sats = Number(user?.satoshis) || 0
	const satsUsd = Number(user?.satoshis_usd) || 0
	// Sin sats, o con un backend que aún no expone satoshis_usd, el toggle no aparece
	const available = sats > 0 && satsUsd > 0

	const { discountUsd, cashDue } = useMemo(() => {
		const total = Number(totalUsd) || 0
		if (!enabled || !available || total <= 0) { return { discountUsd: 0, cashDue: total } }
		const discount = Math.min(satsUsd, total)
		return { discountUsd: discount, cashDue: Math.max(0, Number((total - discount).toFixed(2))) }
	}, [enabled, available, satsUsd, totalUsd])

	const applyPurchaseResult = (data: StorePurchaseResult | null | undefined, fallbackTotal: number) => {
		const cashPaid = typeof data?.cash_paid === 'number' ? data.cash_paid : fallbackTotal
		const patch: Partial<User> = { balance: Number(user?.balance || 0) - cashPaid }
		if (typeof data?.satoshis === 'number') {
			patch.satoshis = data.satoshis
			const btcPrice = Number(user?.btc_price) || 0
			if (btcPrice > 0) { patch.satoshis_usd = Number(((data.satoshis / 1e8) * btcPrice).toFixed(2)) }
		}
		updateUser(patch)
	}

	return { available, enabled, setEnabled, sats, satsUsd, discountUsd, cashDue, applyPurchaseResult }
}
