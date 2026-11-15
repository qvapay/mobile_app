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
 *
 * Y la orden tiene que ser de ESTA wallet (X-06): lo que se va a enviar va a su dirección de
 * depósito, y tanto lo que paga como lo que devuelve vuelven a direcciones propias. Las
 * órdenes cuelgan del ID de wallet; con ese ID en otras manos, una orden que cobrara un
 * tercero aparecería en el seguimiento con su «Enviar ahora» como cualquier otra.
 *
 * Un «quizá» (la difusión no contestó) no se queda así para siempre: la nota guarda con
 * qué preguntar a la cadena por ese envío, y `settleDepositNote` lo aclara. Si entró,
 * consta como enviado; si la cadena confirma que ya no entrará, la nota se borra y la
 * orden se puede fondear. Mientras la cadena no lo sepa, sigue siendo «no».
 */
import { exchangeApi } from '../../../api/exchangeApi'
import type { ExchangeOrder, ExchangeStatus } from '../../../types/domain'
import { isSameAddress } from '../../../wallet/assets'
import type { TxLookup } from '../../../wallet/chains/txLookup'
import { orderAddressesCheck } from './exchangeModel'
import type { OwnAddress } from './exchangeModel'
import { clearDepositSent, markDepositSent, readDepositSent } from './exchangeDeposit'
import type { SentDeposit } from './exchangeDeposit'
import { parseSentRef } from './sentRef'
import { lookupSentRef } from './walletSendActions'

export type DepositCheck =
	| { allowed: true }
	/** Ya salió (o pudo salir) un depósito para esta orden. */
	| { allowed: false, reason: 'sent', txid: string | null }
	/** La orden ya no espera depósito (avanzó, caducó, se canceló). */
	| { allowed: false, reason: 'closed', status: ExchangeStatus }
	/** No se pudo comprobar la nota o la orden. */
	| { allowed: false, reason: 'unknown' }
	/** La orden no es de esta wallet: paga o devuelve a otra dirección, o el envío no va a su depósito. */
	| { allowed: false, reason: 'foreign' }

/** Con qué se contrasta la orden: adónde se va a enviar y cuáles son las direcciones propias. */
export type DepositExpectation = { to: string, own: OwnAddress }

type Deps = {
	/** Tiene que LANZAR si el disco no se deja leer. */
	readNote: (uuid: string) => Promise<SentDeposit | null>
	fetchOrder: (uuid: string) => Promise<ExchangeOrder | null>
	/** Pregunta a la cadena por el envío de una nota pendiente (`ref` tal como salió del disco). */
	lookupNote: (ref: unknown) => Promise<TxLookup>
	markSent: (uuid: string, txid: string) => Promise<void>
	clearNote: (uuid: string) => Promise<void>
}

const DEFAULT_DEPS: Deps = {
	readNote: uuid => readDepositSent(uuid, { strict: true }),
	fetchOrder: async uuid => {
		const result = await exchangeApi.get(uuid)
		return result.success && result.data ? result.data : null
	},
	lookupNote: async raw => {
		const ref = parseSentRef(raw)
		return ref ? lookupSentRef(ref) : { status: 'unknown' }
	},
	markSent: markDepositSent,
	clearNote: clearDepositSent,
}

/**
 * Aclara una nota PENDIENTE preguntando a la cadena por su envío.
 *
 * @returns La nota como queda: ya enviada si entró, null si la cadena confirma que no
 *   entró ni entrará (la nota se borra), o la misma si aún no se sabe. Una nota sin
 *   referencia, o ya enviada, vuelve tal cual.
 */
export const settleDepositNote = async (note: SentDeposit, deps: Pick<Deps, 'lookupNote' | 'markSent' | 'clearNote'> = DEFAULT_DEPS): Promise<SentDeposit | null> => {
	if (!note.pending || !note.ref) return note
	let outcome: TxLookup
	try { outcome = await deps.lookupNote(note.ref) } catch { return note }
	if (outcome.status === 'landed') {
		await deps.markSent(note.uuid, outcome.txid)
		return { ...note, txid: outcome.txid, pending: false, ref: null }
	}
	if (outcome.status === 'dropped') {
		await deps.clearNote(note.uuid)
		return null
	}
	return note
}

/** `expected`: con ello se comprueba además que la orden es de esta wallet. Lo pasa siempre quien firma. */
export const checkDeposit = async (uuid: string, expected?: DepositExpectation, deps: Deps = DEFAULT_DEPS): Promise<DepositCheck> => {
	let note: SentDeposit | null
	try { note = await deps.readNote(uuid) } catch { return { allowed: false, reason: 'unknown' } }
	// Un «quizá salió» se aclara con la cadena antes de dar el depósito por hecho
	if (note?.pending) {
		try { note = await settleDepositNote(note, deps) } catch { return { allowed: false, reason: 'unknown' } }
	}
	if (note) return { allowed: false, reason: 'sent', txid: note.txid }

	let order: ExchangeOrder | null
	try { order = await deps.fetchOrder(uuid) } catch { return { allowed: false, reason: 'unknown' } }
	if (!order?.status) return { allowed: false, reason: 'unknown' }
	if (order.status !== 'awaiting_deposit') return { allowed: false, reason: 'closed', status: order.status }
	if (!expected) return { allowed: true }

	// La orden tal como la da el servidor AHORA, contra lo que esta wallet sabe de sí misma
	const addresses = orderAddressesCheck(order, expected.own)
	if (addresses === 'unknown') return { allowed: false, reason: 'unknown' }
	const source = expected.own(order.from_asset)
	const toDeposit = !!source && typeof order.deposit_address === 'string' && isSameAddress(source.kind, order.deposit_address, expected.to)
	return addresses === 'own' && toDeposit ? { allowed: true } : { allowed: false, reason: 'foreign' }
}
