/**
 * Qué fue de una tx firmada cuya difusión no dio respuesta clara. PURO.
 *
 * `landed` se ejecutó · `dropped` ya nunca se ejecutará (la cadena pasó su vigencia sin ella,
 * o entró fallida y no movió fondos) · `unknown` aún no se sabe. Solo `dropped` permite
 * construir y firmar otra: con cualquier otra respuesta, otra tx sería un segundo pago.
 */
export type TxLookup = { status: 'landed', txid: string } | { status: 'dropped' } | { status: 'unknown' }
