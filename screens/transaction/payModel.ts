/**
 * Reglas PURAS de la hoja de pago de facturas (sin react-native): quién puede pagar una
 * factura y qué muestra la pantalla sobre ella.
 *
 * Están fuera del componente porque son la parte con consecuencias —una factura propia o
 * ya pagada NO debe poder pagarse— y así se leen y se prueban de un vistazo, sin JSX
 * alrededor.
 */
import type { Transaction as TransactionModel, User } from '../../types/domain'

export type PayInvoiceState = {
	/** Importe de la factura con 2 decimales, listo para pintar. */
	amountFixed: string
	/** Saldo del usuario con 2 decimales. */
	balanceFixed: string
	hasEnough: boolean
	/** La factura la emitió el propio usuario: puede verla, no pagarla. */
	isOwn: boolean
	/** Ya no está `pending`: pagada, cancelada o en proceso. */
	alreadyPaid: boolean
	/** Las cuatro condiciones a la vez; es lo único que habilita el botón de pagar. */
	canPay: boolean
}

/**
 * Los decimales del backend viajan como string o como number (alias `Decimal`); el `|| 0`
 * cubre además la factura que todavía no ha cargado.
 */
export const payInvoiceState = (transaction: TransactionModel | null, user: User | null | undefined): PayInvoiceState => {
	const amount = parseFloat((transaction?.amount || 0) as string)
	const balance = parseFloat((user?.balance || 0) as string)
	const hasEnough = balance >= amount
	const isOwn = !!transaction?.user?.uuid && !!user?.uuid && transaction.user.uuid === user.uuid
	const alreadyPaid = !!transaction?.status && transaction.status !== 'pending'

	return {
		amountFixed: amount.toFixed(2),
		balanceFixed: balance.toFixed(2),
		hasEnough,
		isOwn,
		alreadyPaid,
		canPay: !!transaction && !alreadyPaid && !isOwn && hasEnough,
	}
}
