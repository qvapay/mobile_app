import { useEffect, useRef } from 'react'

// Contexts
import { useAuth } from '../auth/AuthContext'
import { useSettings } from '../settings/SettingsContext'

// Helpers
import playSound from '../helpers/playSound'

import type { Transaction } from '../types/domain'

/** Estados en los que el dinero YA está en la cuenta (un depósito pendiente no suena). */
const SETTLED_STATUSES = ['paid', 'received', 'completed']

/** Techo del baúl de uuids ya sonados: al llenarse se vacía (solo sirve para no repetir). */
const PLAYED_LIMIT = 200

/**
 * uuids que ya hicieron sonar la moneda en esta sesión. Vive a nivel de módulo
 * a propósito: la notificación push en primer plano y el refresco de la lista
 * son DOS avisos de la misma transacción, y sin este baúl compartido la moneda
 * sonaría dos veces por el mismo cobro.
 */
const played = new Set<string>()

/** Marca un uuid como ya sonado (lo llama también el listener de push). */
export const markIncomingSoundPlayed = (uuid?: string | null): void => {
	if (!uuid) return
	if (played.size >= PLAYED_LIMIT) played.clear()
	played.add(uuid)
}

/** ¿Ya sonó esta transacción en esta sesión? */
export const hasIncomingSoundPlayed = (uuid?: string | null): boolean => !!uuid && played.has(uuid)

/**
 * Dirección de la transacción con la MISMA regla que pinta el signo en
 * `QPTransaction`: si el pagador no soy yo, el dinero entra (una recarga
 * confirmada tampoco tiene pagador, y también entra).
 */
export const isIncomingTransaction = (transaction: Transaction, myUuid: string): boolean => {
	if (!myUuid || !transaction) return false
	const paidByUuid = (transaction.PaidBy || transaction.paid_by)?.uuid || ''
	return paidByUuid !== myUuid
}

/** ¿El dinero ya está en la cuenta? (un depósito pendiente aún no lo está). */
const isSettled = (transaction: Transaction): boolean => SETTLED_STATUSES.includes(transaction?.status)

/**
 * uuids que la lista da por vistos. Una entrante todavía PENDIENTE se queda
 * fuera a propósito: es un cobro que aún no ha llegado, y darlo por visto ahora
 * lo dejaría mudo justo cuando se asiente (el caso del depósito que confirma
 * con la app abierta).
 */
export const seenUuids = (list: Transaction[], myUuid: string): string[] => list
	.filter(transaction => !!transaction?.uuid && (isSettled(transaction) || !isIncomingTransaction(transaction, myUuid)))
	.map(transaction => transaction.uuid)

/**
 * Transacciones de la lista que son dinero recién entrado: no vistas antes,
 * entrantes y ya asentadas.
 */
export const findIncomingArrivals = (
	list: Transaction[],
	myUuid: string,
	seen: Set<string>,
): Transaction[] => list.filter(transaction => (
	!!transaction?.uuid
	&& !seen.has(transaction.uuid)
	&& isSettled(transaction)
	&& isIncomingTransaction(transaction, myUuid)
))

/**
 * Hace sonar la moneda (`money_in`) cuando aparece una transacción entrante
 * nueva en la lista que se le pase — el espejo del `money_out` de SendSuccess,
 * pero para el dinero que llega.
 *
 * La PRIMERA lista que ve es la línea base y nunca suena: en arranque en frío
 * la caché persistida pinta el histórico entero de golpe, y sonar ahí sería
 * celebrar cobros de la semana pasada. A partir de ahí, cada uuid nuevo que
 * cumpla "entrante + asentada" dispara UN sonido por refresco (dos cobros a la
 * vez no encadenan dos monedas). Una entrante que se ve primero PENDIENTE suena
 * al asentarse, no antes. Cambiar de cuenta rehace la línea base.
 *
 * Respeta los ajustes de sonido (`sounds.enabled` + `sounds.transactionSound`)
 * y comparte baúl de uuids con el listener de push de `useAppNavigation`, para
 * que la notificación en primer plano y el refresco no suenen las dos.
 *
 * @param transactions - Últimas transacciones de la cuenta (las del feed de Home).
 */
const useIncomingMoneySound = (transactions?: Transaction[] | null): void => {

	const { user } = useAuth()
	const { sounds } = useSettings()

	// `null` = aún sin línea base. Se rehace al cambiar de cuenta
	const seenRef = useRef<Set<string> | null>(null)
	const ownerRef = useRef<string | null>(null)

	// Los ajustes se leen por ref: cambiar el interruptor de sonido no debe
	// reejecutar el efecto y colar un sonido con la lista de siempre
	const soundsRef = useRef(sounds)
	useEffect(() => { soundsRef.current = sounds }, [sounds])

	useEffect(() => {

		const myUuid = user?.uuid || ''
		const list = transactions

		if (!myUuid) { seenRef.current = null; ownerRef.current = null; return }
		if (ownerRef.current !== myUuid) { seenRef.current = null; ownerRef.current = myUuid }
		if (!list?.length) return

		const uuids = seenUuids(list, myUuid)

		// Primera lista de esta cuenta: solo línea base
		if (!seenRef.current) { seenRef.current = new Set(uuids); return }

		const arrivals = findIncomingArrivals(list, myUuid, seenRef.current)

		// El baúl solo evita repetir: al desbordarse se rehace con la lista actual
		if (seenRef.current.size >= PLAYED_LIMIT) seenRef.current = new Set(uuids)
		else uuids.forEach(uuid => seenRef.current!.add(uuid))

		// Ya sonadas por la notificación push que anunció el mismo cobro
		const fresh = arrivals.filter(transaction => !played.has(transaction.uuid))
		if (!fresh.length) return
		fresh.forEach(transaction => markIncomingSoundPlayed(transaction.uuid))

		if (soundsRef.current?.enabled && soundsRef.current?.transactionSound) { playSound('money_in') }

	}, [transactions, user?.uuid])
}

export default useIncomingMoneySound
