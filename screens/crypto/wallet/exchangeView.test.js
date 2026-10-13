/**
 * @jest-environment node
 */
const { buildExchangeView, ctaFor } = require('./exchangeView')

// `t` que devuelve la clave y los params: así los tests asertan QUÉ se dice, no la traducción
const t = (key, params) => (params ? `${key}|${JSON.stringify(params)}` : key)

const asset = (over = {}) => ({
	id: 'tron:TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t',
	symbol: 'USDT', chainName: 'TRON', logoTick: 'USDT', networkTick: 'TRX',
	amountLabel: '1,240.5', decimals: 6, ...over,
})
const sol = () => asset({ id: 'solana:native', symbol: 'SOL', chainName: 'Solana', logoTick: 'SOL', networkTick: 'SOL', amountLabel: '0.4', decimals: 9 })

// La forma REAL que sirve qpweb (`normalizeQuote`). El fixture anterior inventaba `rate` y
// `etaMinutes`, campos que el backend no manda nunca — y por eso la línea de tasa llevaba
// vacía desde el primer día sin que ningún test lo notara
const quote = (over = {}) => ({
	provider: 'changenow', amountIn: 100, amountOut: 0.7987,
	depositFee: 5.54, withdrawalFee: 0.0016,
	speedForecast: '10-60', providerWarning: null,
	...over,
})

const base = {
	t, from: asset(), to: sol(), amountText: '100',
	check: { ok: true, amount: 100 },
	quote: quote(), advice: { level: 'ok', bps: 0, suggestedMinimum: null },
	minAmount: 12.6, cheaper: null, showBalance: true,
	quoting: false, busy: false, loading: false,
}

describe('la tasa y lo que dice el proveedor', () => {

	it('la tasa se deriva de los dos importes y se lee con N ≥ 1', () => {
		// 100 USDT → 0.7987 SOL: "1 USDT ≈ 0.007987 SOL" obligaba a dividir de cabeza
		const v = buildExchangeView({ ...base, quote: quote({ amountIn: 100, amountOut: 0.7987 }) })
		expect(v.rate).toBe('1 SOL ≈ 125.2 USDT')
		// En el sentido contrario, el directo ya es ≥ 1
		const back = buildExchangeView({ ...base, from: sol(), to: asset(), quote: quote({ amountIn: 1, amountOut: 123.0912 }) })
		expect(back.rate).toBe('1 SOL ≈ 123.09 USDT')
		// Por debajo de 100, cuatro decimales: entre estables el matiz está ahí
		const stable = buildExchangeView({ ...base, to: asset({ symbol: 'USDC' }), quote: quote({ amountIn: 100, amountOut: 99.87 }) })
		expect(stable.rate).toBe('1 USDC ≈ 1.0013 USDT')
	})

	it('sin importe de entrada no se inventa una tasa', () => {
		expect(buildExchangeView({ ...base, quote: quote({ amountIn: 0 }) }).rate).toBe('')
		expect(buildExchangeView({ ...base, quote: null }).rate).toBe('')
	})

	it('la franja de tiempo va tal cual, que es un rango y no un número', () => {
		const v = buildExchangeView({ ...base, quote: quote({ speedForecast: '10-60' }) })
		expect(v.rows.find(r => r.key === 'eta').value).toBe('~10-60 min')
		expect(buildExchangeView({ ...base, quote: quote({ speedForecast: null }) }).rows.find(r => r.key === 'eta')).toBeUndefined()
	})

	it('el aviso del propio proveedor se enseña, no se tira', () => {
		const v = buildExchangeView({ ...base, quote: quote({ providerWarning: 'La red TRON está congestionada' }) })
		const notice = v.notices.find(n => n.key === 'providerWarning')
		expect(notice.text).toBe('La red TRON está congestionada')
		expect(notice.tone).toBe('warning')
	})

	it('sin aviso del proveedor no se añade una fila vacía', () => {
		expect(buildExchangeView(base).notices.find(n => n.key === 'providerWarning')).toBeUndefined()
	})

	it('cuando no hay cotización, se dice el motivo del servidor y no solo "no disponible"', () => {
		// El botón seguirá diciendo "Swap no disponible" porque no hay nada que revisar, pero
		// el aviso explica si hay que esperar un minuto o si ese par no se puede
		const v = buildExchangeView({ ...base, quote: null, quoteError: 'Demasiadas cotizaciones seguidas' })
		expect(v.notices.find(n => n.key === 'quoteError').text).toBe('Demasiadas cotizaciones seguidas')
		expect(ctaFor({ ...base, quote: null })).toBe('noQuote')
	})

	it('con cotización buena no se cuela ningún aviso de error', () => {
		expect(buildExchangeView(base).notices.find(n => n.key === 'quoteError')).toBeUndefined()
	})
})

describe('estado del botón', () => {

	it('con todo en orden, ofrece revisar', () => {
		expect(ctaFor(base)).toBe('review')
	})

	it('primero lo que el usuario puede arreglar solo', () => {
		expect(ctaFor({ ...base, loading: true })).toBe('loading')
		expect(ctaFor({ ...base, from: null })).toBe('pickAssets')
		expect(ctaFor({ ...base, check: { ok: false, reason: 'empty' } })).toBe('enterAmount')
		expect(ctaFor({ ...base, check: { ok: false, reason: 'insufficient' } })).toBe('insufficient')
		expect(ctaFor({ ...base, check: { ok: false, reason: 'below_minimum', minAmount: 12.6 } })).toBe('belowMin')
	})

	it('el saldo pesa más que la cotización: sin fondos no hay nada que revisar', () => {
		expect(ctaFor({ ...base, check: { ok: false, reason: 'insufficient' }, quote: null })).toBe('insufficient')
	})

	it('un activo no soportado manda elegir otro, no falla en silencio', () => {
		expect(ctaFor({ ...base, unsupportedReason: 'No se lista USDC en TRON' })).toBe('pickAssets')
	})

	it('distingue cotizando de no haber podido cotizar', () => {
		expect(ctaFor({ ...base, quote: null, quoting: true })).toBe('quoting')
		expect(ctaFor({ ...base, quote: null, quoting: false })).toBe('noQuote')
	})

	it('recotizar con una cotización en pantalla no vuelve al estado de carga', () => {
		// Si esto fuera 'quoting', el botón parpadearía en cada refresco automático
		expect(ctaFor({ ...base, quoting: true })).toBe('review')
	})
})

describe('la vista', () => {

	it('pinta los dos lados con su red en el badge del icono', () => {
		// La red ya NO va como texto: la lleva el badge del logo, que es lo que separa el
		// USDT de TRON del de BNB Chain
		const v = buildExchangeView(base)
		expect(v.pay.symbol).toBe('USDT')
		expect(v.pay.icon).toMatchObject({ kind: 'wallet', logoTick: 'USDT', networkTick: 'TRX' })
		expect(v.receive.symbol).toBe('SOL')
		expect(v.receive.icon).toMatchObject({ kind: 'wallet', networkTick: 'SOL' })
	})

	it('respeta el ajuste de ocultar saldo', () => {
		expect(buildExchangeView(base).pay.balance).toBe('1,240.5')
		expect(buildExchangeView({ ...base, showBalance: false }).pay.balance).toBe('••••')
	})

	it('lo que se recibe se etiqueta como estimado: la tasa es flotante', () => {
		const v = buildExchangeView(base)
		expect(v.receiveAmount).toBe('0.7987')
		expect(v.receiveHint).toContain('estimated')
	})

	it('sin cotización no inventa un importe recibido', () => {
		const v = buildExchangeView({ ...base, quote: null })
		expect(v.receiveAmount).toBe('')
		expect(v.receiveHint).toBe('')
		expect(v.rows).toEqual([])
	})

	it('la comisión de red se enseña SIEMPRE, sin el verde de buena noticia', () => {
		// Es un coste: en verde parecía un regalo justo encima del aviso rojo
		const fee = buildExchangeView(base).rows.find(r => r.key === 'fee')
		expect(fee.value).toBe('5.54 USDT')
		expect(fee.highlight).toBeUndefined()
	})

	it('en una estable, la comisión en céntimos', () => {
		const fee = buildExchangeView({ ...base, from: asset({ stable: true }), quote: quote({ depositFee: 5.3517852 }) }).rows.find(r => r.key === 'fee')
		expect(fee.value).toBe('5.35 USDT')
	})

	it('el proveedor no se repite en el detalle: ya lo dice la ruta', () => {
		expect(buildExchangeView(base).rows.find(r => r.key === 'provider')).toBeUndefined()
	})

	it('la red enseña origen y destino cuando difieren', () => {
		expect(buildExchangeView(base).rows.find(r => r.key === 'network').value).toBe('TRON → Solana')
		const same = buildExchangeView({ ...base, to: asset({ symbol: 'TRX', id: 'tron:native' }) })
		expect(same.rows.find(r => r.key === 'network').value).toBe('TRON')
	})

	it('el envío desde la wallet: cubierto o lo que quemaría, con el aviso de rentar energía', () => {
		const covered = buildExchangeView({ ...base, sendCost: { kind: 'covered' } })
		expect(covered.rows.find(r => r.key === 'sendCost').value).toBe('crypto.wallet.exchange.sendCostCovered')
		expect(covered.notices.find(n => n.key === 'energy')).toBeUndefined()

		const burn = buildExchangeView({ ...base, sendCost: { kind: 'burn', trx: 13.45, energyShort: true } })
		expect(burn.rows.find(r => r.key === 'sendCost').value).toBe('~13.45 TRX')
		expect(burn.notices.find(n => n.key === 'energy')).toMatchObject({ tone: 'primary', text: 'crypto.wallet.exchange.energyHint|{"trx":"13.45"}' })

		// Si lo que se quema es solo ancho de banda, rentar energía no lo arregla: sin aviso
		const bandwidth = buildExchangeView({ ...base, sendCost: { kind: 'burn', trx: 0.35, energyShort: false } })
		expect(bandwidth.notices.find(n => n.key === 'energy')).toBeUndefined()

		expect(buildExchangeView(base).rows.find(r => r.key === 'sendCost')).toBeUndefined()
	})

	it('el botón solo se habilita cuando hay algo que revisar', () => {
		expect(buildExchangeView(base).ctaEnabled).toBe(true)
		expect(buildExchangeView({ ...base, busy: true }).ctaEnabled).toBe(false)
		expect(buildExchangeView({ ...base, quote: null }).ctaEnabled).toBe(false)
	})

	it('antes de confirmar dice quién tiene el dinero, con su nombre', () => {
		expect(buildExchangeView(base).reviewNotice).toContain('changenow')
	})
})

describe('avisos', () => {
	const keys = v => v.notices.map(n => n.key)

	it('con comisión razonable no molesta', () => {
		expect(keys(buildExchangeView(base))).toEqual([])
	})

	it('avisa cuando la comisión fija se come un pellizco', () => {
		const v = buildExchangeView({ ...base, advice: { level: 'warn', bps: 554, suggestedMinimum: null } })
		const fee = v.notices.find(n => n.key === 'fee')
		expect(fee.tone).toBe('warning')
		expect(fee.text).toContain('5.5')
	})

	it('cuando es brutal, sube el tono y dice desde cuánto compensa', () => {
		const v = buildExchangeView({ ...base, advice: { level: 'severe', bps: 2770, suggestedMinimum: 277 } })
		const fee = v.notices.find(n => n.key === 'fee')
		expect(fee.tone).toBe('danger')
		expect(fee.text).toContain('277')
	})

	it('ofrece el mismo activo desde una cadena más barata', () => {
		const v = buildExchangeView({ ...base, cheaper: { assetId: 'base:0x833', depositFee: 0.0076, saving: 5.53, savingBps: 553 } })
		expect(keys(v)).toContain('cheaper')
		expect(v.notices.find(n => n.key === 'cheaper').text).toContain('base')
	})

	it('un activo no soportado explica por qué y calla el resto', () => {
		// Hacer desaparecer el activo sin decir nada es peor que no ofrecerlo
		const v = buildExchangeView({ ...base, unsupportedReason: 'No se lista USDC en TRON', advice: { level: 'severe', bps: 3000, suggestedMinimum: 500 } })
		expect(keys(v)).toEqual(['unsupported'])
		expect(v.notices[0].text).toContain('USDC')
	})
})

describe('sugerencia de importe', () => {

	it('por debajo del mínimo ofrece subir justo a él', () => {
		const v = buildExchangeView({ ...base, check: { ok: false, reason: 'below_minimum', minAmount: 12.6 } })
		expect(v.suggestedAmount).toBe(12.6)
	})

	it('con importe válido pero comisión brutal ofrece el importe que compensa', () => {
		const v = buildExchangeView({ ...base, advice: { level: 'severe', bps: 2770, suggestedMinimum: 277 } })
		expect(v.suggestedAmount).toBe(277)
	})

	it('cuando todo está bien no sugiere nada', () => {
		expect(buildExchangeView(base).suggestedAmount).toBeNull()
	})
})
