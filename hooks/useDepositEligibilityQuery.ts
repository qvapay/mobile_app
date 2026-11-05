import { useQuery } from '@tanstack/react-query'

// API
import { userApi } from '../api/userApi'
import { unwrap } from '../api/unwrap'

/**
 * Qué rieles gateados del depósito (tarjeta, PayPal, banco) aceptará `POST /topup`
 * a esta cuenta desde esta app, y el cupo del nivel `ssn` (`GET /user/deposit-eligibility`).
 *
 * Es la ÚNICA fuente para pintar CARD/PAYPAL en Depositar: `GET /coins/v2` los lista
 * para todos y el espejo cliente que había antes no conocía ni la geolocalización ni
 * el canal. Se persiste (no es PII) para que el arranque en frío pinte al instante, y
 * `staleTime` corto porque el cupo baja con cada cobro; `placeholderData` evita que un
 * refetch vacíe el selector.
 */
export const DEPOSIT_ELIGIBILITY_KEY = ['user', 'deposit-eligibility'] as const

export const DEPOSIT_ELIGIBILITY_QUERY = {
	queryKey: DEPOSIT_ELIGIBILITY_KEY,
	queryFn: async () => unwrap(await userApi.getDepositEligibility()),
	staleTime: 30 * 1000,
}

export default function useDepositEligibilityQuery() {
	return useQuery({
		...DEPOSIT_ELIGIBILITY_QUERY,
		placeholderData: previous => previous,
	})
}
