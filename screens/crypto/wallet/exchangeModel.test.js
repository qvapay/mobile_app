/**
 * @jest-environment node
 */
const {
	ALLOWS_SEND_MAX,
	checkAmount,
	depositAmountLabel,
	depositAmountRaw,
	deviationBps,
	isDeviationNotable,
	isLive,
	phaseOf,
	stepsFor,
} = require('./exchangeModel')

const order = (over = {}) => ({ status: 'awaiting_deposit', payin_hash: null, payout_hash: null, ...over })

describe('validación del importe', () => {
	const base = { balance: 100_000000n, decimals: 6, minAmount: 12.6 }

	it('acepta un importe con saldo y por encima del mínimo', () => {
		expect(checkAmount({ ...base, input: '50' })).toEqual({ ok: true, amount: 50 })
	})

	it('el campo vacío no es un error que enseñar', () => {
		expect(checkAmount({ ...base, input: '' }).reason).toBe('empty')
		expect(checkAmount({ ...base, input: '   ' }).reason).toBe('empty')
	})

	it('rechaza lo que no es un número positivo', () => {
		for (const input of ['abc', '-5', '0']) {
			expect(checkAmount({ ...base, input }).reason).toBe('invalid')
		}
	})

	it('el mínimo del proveedor se valida ANTES de cotizar', () => {
		// Por debajo, el proveedor no opera y los fondos esperarían una devolución manual
		const r = checkAmount({ ...base, input: '5' })
		expect(r.reason).toBe('below_minimum')
		expect(r.minAmount).toBe(12.6)
	})

	it('sin mínimo conocido no inventa uno', () => {
		expect(checkAmount({ ...base, minAmount: null, input: '0.5' }).ok).toBe(true)
	})

	it('el saldo se compara en unidades mínimas, no en float', () => {
		// 0.1 + 0.2 en coma flotante bastaría para equivocar un "tengo justo"
		expect(checkAmount({ balance: 300000n, decimals: 6, input: '0.3' }).ok).toBe(true)
		expect(checkAmount({ balance: 299999n, decimals: 6, input: '0.3' }).reason).toBe('insufficient')
	})

	it('el saldo manda sobre el mínimo: primero hay que tenerlo', () => {
		expect(checkAmount({ balance: 1n, decimals: 6, minAmount: 12.6, input: '50' }).reason).toBe('insufficient')
	})

	it('un decimal a medio teclear no revienta', () => {
		expect(() => checkAmount({ ...base, input: '1.' })).not.toThrow()
		expect(() => checkAmount({ ...base, input: '.' })).not.toThrow()
	})

	it('en este flujo NO hay enviar todo', () => {
		// El proveedor espera EXACTAMENTE lo cotizado; de más o de menos dispara devolución
		expect(ALLOWS_SEND_MAX).toBe(false)
	})
})

describe('fases del seguimiento', () => {

	it('los nueve estados del backend caben en cinco fases', () => {
		expect(phaseOf('awaiting_deposit')).toBe('deposit')
		for (const s of ['confirming', 'exchanging', 'sending']) { expect(phaseOf(s)).toBe('working') }
		expect(phaseOf('completed')).toBe('done')
		expect(phaseOf('refunded')).toBe('returned')
		for (const s of ['failed', 'expired', 'needs_review']) { expect(phaseOf(s)).toBe('problem') }
	})

	it('devuelto NO es lo mismo que fallido', () => {
		// El dinero volvió: enseñarlo como fallo dejaría al usuario buscándolo
		expect(phaseOf('refunded')).not.toBe(phaseOf('failed'))
	})

	it('solo se sigue consultando lo que está vivo', () => {
		for (const s of ['awaiting_deposit', 'confirming', 'exchanging', 'sending']) { expect(isLive(s)).toBe(true) }
		for (const s of ['completed', 'refunded', 'failed', 'expired', 'needs_review']) { expect(isLive(s)).toBe(false) }
	})

	it('un estado que no conoce se trata como problema, no como éxito', () => {
		expect(phaseOf('inventado')).toBe('problem')
	})
})

describe('timeline', () => {
	const keys = steps => steps.filter(s => s.done).map(s => s.key)

	it('recién abierta no hay ningún paso hecho', () => {
		expect(keys(stepsFor(order()))).toEqual([])
	})

	it('el hash de depósito marca el primer paso aunque el estado no haya avanzado', () => {
		expect(keys(stepsFor(order({ payin_hash: 'h' })))).toEqual(['sent'])
	})

	it('avanza con el estado', () => {
		expect(keys(stepsFor(order({ status: 'confirming' })))).toEqual(['sent'])
		expect(keys(stepsFor(order({ status: 'exchanging' })))).toEqual(['sent', 'confirmed'])
		expect(keys(stepsFor(order({ status: 'sending' })))).toEqual(['sent', 'confirmed', 'exchanged'])
	})

	it('el último paso exige la PRUEBA del pago, no solo el estado', () => {
		expect(keys(stepsFor(order({ status: 'completed' })))).not.toContain('received')
		expect(keys(stepsFor(order({ status: 'completed', payout_hash: 'out' })))).toContain('received')
	})

	it('una devolución no avanza pasos: se queda donde llegó', () => {
		const steps = stepsFor(order({ status: 'refunded', payin_hash: 'h' }))
		expect(keys(steps)).toEqual(['sent'])
		// Y no marca ninguno como "en curso": ya no hay nada en curso
		expect(steps.some(s => s.current)).toBe(false)
	})

	it('marca como en curso el primer paso pendiente, solo si sigue viva', () => {
		const live = stepsFor(order({ status: 'confirming' }))
		expect(live.find(s => s.current)?.key).toBe('confirmed')
		expect(stepsFor(order({ status: 'completed', payout_hash: 'o' })).some(s => s.current)).toBe(false)
	})
})

describe('lo recibido frente a lo prometido', () => {

	it('recibir de menos es negativo y de más positivo', () => {
		expect(deviationBps({ expected_out: '100', actual_out: '95' })).toBe(-500)
		expect(deviationBps({ expected_out: '100', actual_out: '102' })).toBe(200)
	})

	it('sin datos no se inventa una desviación', () => {
		expect(deviationBps({ expected_out: null, actual_out: '1' })).toBeNull()
		expect(deviationBps({ expected_out: '0', actual_out: '1' })).toBeNull()
		expect(deviationBps({ expected_out: '100', actual_out: null })).toBeNull()
	})

	it('una desviación pequeña con tasa flotante es normal y no se cuenta', () => {
		expect(isDeviationNotable(50)).toBe(false)
		expect(isDeviationNotable(-120)).toBe(false)
	})

	it('una grande sí, en los dos sentidos', () => {
		expect(isDeviationNotable(-400)).toBe(true)
		expect(isDeviationNotable(400)).toBe(true)
	})

	it('sin desviación conocida no hay nada que contar', () => {
		expect(isDeviationNotable(null)).toBe(false)
	})
})

describe('importe a depositar', () => {

	it('se re-deriva del importe que registró el backend', () => {
		expect(depositAmountRaw({ amount_in: '50.5' }, 6)).toBe(50_500000n)
		expect(depositAmountLabel({ amount_in: '50.5' }, 6)).toBe('50.5')
	})

	it('sobrevive a un decimal con más precisión de la que la cadena admite', () => {
		expect(() => depositAmountRaw({ amount_in: '0.1234567890123' }, 6)).not.toThrow()
	})
})
