/**
 * ¿Se puede firmar el depósito de este intercambio? Se pregunta justo antes de pedir el PIN.
 *
 * El proveedor espera UN envío de un importe exacto; un segundo no se cambia, se queda a la
 * espera de una devolución manual. Y había tres caminos para mandarlo dos veces: volver atrás
 * a un seguimiento viejo que seguía ofreciendo «Enviar ahora», una nota que caducaba antes
 * que la orden, y una difusión sin respuesta que no dejaba nota. Taparlos uno a uno en cada
 * pantalla es volver a dejarse alguno: la comprobación vive aquí, en el único sitio por el
 * que pasa todo depósito antes de firmarse.
 *
 * Solo se firma si consta que no salió ninguno (ni «quizá») Y la orden sigue esperándolo.
 * Si algo no se puede comprobar, no se firma: reintentar es gratis, un doble depósito no.
 */
import { exchangeApi } from '../../../api/exchangeApi'
import type { ExchangeStatus } from '../../../types/domain'
import { readDepositSent } from './exchangeDeposit'
import type { SentDeposit } from './exchangeDeposit'

export type DepositCheck =
	| { allowed: true }
	/** Ya salió (o pudo salir) un depósito para esta orden. */
	| { allowed: false, reason: 'sent', txid: string | null }
	/** La orden ya no espera depósito (avanzó, caducó, se canceló). */
	| { allowed: false, reason: 'closed', status: ExchangeStatus }
	/** No se pudo comprobar la nota o la orden. */
	| { allowed: false, reason: 'unknown' }

type Deps = {
	/** Tiene que LANZAR si el disco no se deja leer. */
	readNote: (uuid: string) => Promise<SentDeposit | null>
	fetchStatus: (uuid: string) => Promise<ExchangeStatus | null>
}

const DEFAULT_DEPS: Deps = {
	readNote: uuid => readDepositSent(uuid, { strict: true }),
	fetchStatus: async uuid => {
		const result = await exchangeApi.get(uuid)
		return result.success && result.data ? result.data.status : null
	},
}

export const checkDeposit = async (uuid: string, deps: Deps = DEFAULT_DEPS): Promise<DepositCheck> => {
	let note: SentDeposit | null
	try { note = await deps.readNote(uuid) } catch { return { allowed: false, reason: 'unknown' } }
	if (note) return { allowed: false, reason: 'sent', txid: note.txid }

	let status: ExchangeStatus | null
	try { status = await deps.fetchStatus(uuid) } catch { return { allowed: false, reason: 'unknown' } }
	if (!status) return { allowed: false, reason: 'unknown' }
	if (status !== 'awaiting_deposit') return { allowed: false, reason: 'closed', status }
	return { allowed: true }
}
