import { useMemo, useState } from 'react'
import { useAuth } from '../../auth/AuthContext'

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
 * @param {number} totalUsd - Total price of the purchase in USD.
 * @returns {{ available: boolean, enabled: boolean, setEnabled: Function,
 *   sats: number, satsUsd: number, discountUsd: number, cashDue: number,
 *   applyPurchaseResult: (data: object, fallbackTotal: number) => void }}
 */
export default function useSatsDiscount(totalUsd) {

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

	const applyPurchaseResult = (data, fallbackTotal) => {
		const cashPaid = typeof data?.cash_paid === 'number' ? data.cash_paid : fallbackTotal
		const patch = { balance: Number(user?.balance || 0) - cashPaid }
		if (typeof data?.satoshis === 'number') {
			patch.satoshis = data.satoshis
			const btcPrice = Number(user?.btc_price) || 0
			if (btcPrice > 0) { patch.satoshis_usd = Number(((data.satoshis / 1e8) * btcPrice).toFixed(2)) }
		}
		updateUser(patch)
	}

	return { available, enabled, setEnabled, sats, satsUsd, discountUsd, cashDue, applyPurchaseResult }
}
