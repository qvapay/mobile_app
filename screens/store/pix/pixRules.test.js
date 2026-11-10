/**
 * Reglas del pago con PIX: el precio tiene que dar lo mismo que el servidor, solo CPF_REQUIRED se
 * le enseña al usuario y el seguimiento se para solo.
 * @jest-environment node
 */
import { classifyPixCheckoutError, formatBrl, formatPixClock, isPixPaid, PIX_EXPIRED_GRACE_MS, PIX_POLL_MS, PIX_VERIFYING_WATCH_MS, pixPollDelay, pixQuote, pixSecondsLeft, resolvePixOffer } from './pixRules'
import { PIX_IOF_NOTICE } from './pixLegal'

const RATE = { usd_per_brl: 0.18, surcharge_pct: 3, provider_pct: 4.5 }
const ELIGIBLE = { eligible: true, reason: null, surfaces: ['topup', 'esim'], quote: RATE, cap: { cap: 400, used: 0, remaining: 400, resets_at: null, window_days: 30 }, hold_hours: 72, instant_max_usd: 25 }

describe('pixQuote', () => {
	test('el recargo va sobre la comisión del procesador: $10 → $10,79, como el PR #129 de qpweb', () => {
		expect(pixQuote(10, RATE)).toEqual({ totalUsd: 10.79, totalBrl: 59.95 })
	})

	test('el procesador retiene del total: tras su parte queda la base más el recargo', () => {
		const { totalUsd } = pixQuote(100, RATE)
		expect(totalUsd).toBe(107.85)
		expect(totalUsd * (1 - 0.045)).toBeCloseTo(103, 1)
	})

	test('un qpweb sin provider_pct cotiza solo con el recargo', () => {
		expect(pixQuote(10, { usd_per_brl: 0.18, surcharge_pct: 4 })).toEqual({ totalUsd: 10.4, totalBrl: 57.78 })
	})

	test('una comisión imposible no da precio', () => {
		expect(pixQuote(10, { ...RATE, provider_pct: 100 })).toBeNull()
	})

	test('redondea el real hacia arriba: nunca cobra de menos', () => {
		expect(pixQuote(1, { usd_per_brl: 0.19, surcharge_pct: 0 }).totalBrl).toBe(5.27)
	})

	test('sin tasa o fuera de los límites por pago no hay precio', () => {
		expect(pixQuote(10, null)).toBeNull()
		expect(pixQuote(10, { ...RATE, usd_per_brl: 0 })).toBeNull()
		expect(pixQuote(0, RATE)).toBeNull()
		expect(pixQuote(2900, RATE)).toBeNull()
		expect(pixQuote(0.01, { usd_per_brl: 1, surcharge_pct: 0 })).toBeNull()
	})
})

describe('resolvePixOffer', () => {
	test('elegible y con la compra abierta: precio en reales', () => {
		expect(resolvePixOffer(ELIGIBLE, 'topup', 10)).toEqual({ kind: 'ready', quote: { totalUsd: 10.79, totalBrl: 59.95 } })
	})

	test('CPF_REQUIRED lleva a verificarlo, aunque no haya cotización', () => {
		expect(resolvePixOffer({ ...ELIGIBLE, eligible: false, reason: 'CPF_REQUIRED', quote: null }, 'topup', 10)).toEqual({ kind: 'cpf' })
	})

	test('sin CPF y sin GOLD lleva a hacerse GOLD: todavía no puede verificarlo', () => {
		expect(resolvePixOffer({ ...ELIGIBLE, eligible: false, reason: 'CPF_REQUIRED', gold_required: true, quote: null }, 'topup', 10)).toEqual({ kind: 'gold' })
	})

	test('gold_required no pinta nada si la compra no está abierta', () => {
		expect(resolvePixOffer({ ...ELIGIBLE, eligible: false, reason: 'CPF_REQUIRED', gold_required: true, quote: null }, 'market', 10)).toEqual({ kind: 'hidden' })
	})

	test.each(['DISABLED', 'GEO', 'KYC_REQUIRED', 'RATE_UNAVAILABLE'])('%s oculta la opción sin explicarla', (reason) => {
		expect(resolvePixOffer({ ...ELIGIBLE, eligible: false, reason, quote: null }, 'topup', 10)).toEqual({ kind: 'hidden' })
	})

	test('una compra fuera de surfaces no se ofrece, ni siquiera para pedir el CPF', () => {
		expect(resolvePixOffer(ELIGIBLE, 'voucher', 10)).toEqual({ kind: 'hidden' })
		expect(resolvePixOffer({ ...ELIGIBLE, eligible: false, reason: 'CPF_REQUIRED' }, 'market', 10)).toEqual({ kind: 'hidden' })
	})

	test('sin respuesta (error o qpweb sin la ruta) no pinta nada', () => {
		expect(resolvePixOffer(null, 'topup', 10)).toEqual({ kind: 'hidden' })
		expect(resolvePixOffer(undefined, 'topup', 10)).toEqual({ kind: 'hidden' })
	})

	test('sin importe válido tampoco', () => {
		expect(resolvePixOffer(ELIGIBLE, 'topup', 0)).toEqual({ kind: 'hidden' })
	})
})

describe('classifyPixCheckoutError', () => {
	const charge = { uuid: 'c1', stage: 'awaiting_payment' }

	test('PIX_QR_OPEN trae el QR abierto', () => {
		expect(classifyPixCheckoutError(409, { code: 'PIX_QR_OPEN', charge })).toEqual({ kind: 'open', charge })
	})

	test('PIX_CAP_EXCEEDED trae lo que queda y cuándo se renueva', () => {
		expect(classifyPixCheckoutError(409, { code: 'PIX_CAP_EXCEEDED', cap: 400, used: 390, remaining: 10, resets_at: '2026-12-01T10:00:00.000Z' }))
			.toEqual({ kind: 'cap', remaining: 10, resetsAt: '2026-12-01T10:00:00.000Z' })
	})

	test('CPF y destinatario tienen su propia salida', () => {
		expect(classifyPixCheckoutError(403, { code: 'CPF_REQUIRED' })).toEqual({ kind: 'cpf' })
		expect(classifyPixCheckoutError(400, { code: 'RECIPIENT_NAME_REQUIRED' })).toEqual({ kind: 'recipient' })
	})

	test.each(['PIX_NOT_ELIGIBLE', 'PIX_SURFACE_OFF', 'PIX_P2P_PACKAGE', 'PIX_BRAND_BLOCKED', 'PIX_SELLER_LINKED', 'GIFTCARD_CARD_BLOCKED', 'SUPPLIER_CARD_BLOCKED'])('%s retira la opción', (code) => {
		expect(classifyPixCheckoutError(403, { code })).toEqual({ kind: 'vetoed', code })
	})

	test('el límite responde sin código y el procesador con 503: se reintenta', () => {
		expect(classifyPixCheckoutError(429, { error: 'Too many requests, please wait' })).toEqual({ kind: 'retry', code: 'RATE_LIMITED' })
		expect(classifyPixCheckoutError(503, { code: 'PIX_UNAVAILABLE' })).toEqual({ kind: 'retry', code: 'PIX_UNAVAILABLE' })
		expect(classifyPixCheckoutError(409, { code: 'PIX_BUSY' })).toEqual({ kind: 'retry', code: 'PIX_BUSY' })
	})

	test('sin respuesta del servidor no se inventa nada', () => {
		expect(classifyPixCheckoutError(undefined, undefined)).toEqual({ kind: 'retry', code: null })
	})
})

describe('pixPollDelay', () => {
	const base = { expiresAt: '2026-11-06T15:30:00.000Z', verifyingSince: null, now: Date.parse('2026-11-06T15:00:00.000Z') }

	test('cada 4 s con el QR abierto', () => {
		expect(pixPollDelay({ ...base, stage: 'awaiting_payment' })).toBe(PIX_POLL_MS)
	})

	test('un cobro recién reservado aún no tiene expires_at y se sigue consultando', () => {
		expect(pixPollDelay({ ...base, stage: 'awaiting_payment', expiresAt: null })).toBe(PIX_POLL_MS)
	})

	test('tras caducar sigue durante la gracia, porque el pago aún puede entrar', () => {
		const expires = Date.parse(base.expiresAt)
		expect(pixPollDelay({ ...base, stage: 'awaiting_payment', now: expires + 60_000 })).toBe(PIX_POLL_MS)
		expect(pixPollDelay({ ...base, stage: 'awaiting_payment', now: expires + PIX_EXPIRED_GRACE_MS + 1 })).toBe(false)
	})

	test('unos 30 s en verifying y luego se queda quieto', () => {
		expect(pixPollDelay({ ...base, stage: 'verifying' })).toBe(PIX_POLL_MS)
		expect(pixPollDelay({ ...base, stage: 'verifying', verifyingSince: base.now - 10_000 })).toBe(PIX_POLL_MS)
		expect(pixPollDelay({ ...base, stage: 'verifying', verifyingSince: base.now - PIX_VERIFYING_WATCH_MS - 1 })).toBe(false)
	})

	test.each(['delivered', 'refunded', 'expired', 'cancelled', 'failed', undefined])('%s no se consulta más', (stage) => {
		expect(pixPollDelay({ ...base, stage })).toBe(false)
	})
})

describe('cuenta atrás e importes', () => {
	test('segundos que quedan, sin bajar de cero', () => {
		const now = Date.parse('2026-11-06T15:00:00.000Z')
		expect(pixSecondsLeft('2026-11-06T15:01:30.000Z', now)).toBe(90)
		expect(pixSecondsLeft('2026-11-06T14:00:00.000Z', now)).toBe(0)
	})

	test('sin fecha no hay cuenta atrás (no es lo mismo que caducado)', () => {
		expect(pixSecondsLeft(null, 0)).toBeNull()
		expect(pixSecondsLeft('no es una fecha', 0)).toBeNull()
	})

	test('reloj mm:ss', () => {
		expect(formatPixClock(1799)).toBe('29:59')
		expect(formatPixClock(5)).toBe('00:05')
	})

	test('reales al estilo brasileño', () => {
		expect(formatBrl(57.78)).toBe('R$ 57,78')
		expect(formatBrl(1234.5)).toBe('R$ 1.234,50')
		expect(formatBrl(2200000)).toBe('R$ 2.200.000,00')
		expect(formatBrl(null)).toBe('R$ 0,00')
	})

	test('solo se considera cobrado lo que llegó a pagarse', () => {
		expect(['verifying', 'delivered', 'refunded'].every(isPixPaid)).toBe(true)
		expect(['awaiting_payment', 'expired', 'cancelled', 'failed'].some(isPixPaid)).toBe(false)
	})
})

describe('aviso legal', () => {
	test('es el literal de content/docs/store/pix.mdx, palabra por palabra', () => {
		expect(`${PIX_IOF_NOTICE.text}${PIX_IOF_NOTICE.linkLabel}${PIX_IOF_NOTICE.end}`)
			.toBe('Esta é uma compra internacional e não inclui a tarifa de 3.5% de IOF. Ao prosseguir, você reconhece e aceita os termos e condições do Ebanx.')
		expect(PIX_IOF_NOTICE.url).toBe('https://www.ebanx.com/pt-br/legal/consumidores/brasil/termos-para-processar-pagamentos/')
	})
})
