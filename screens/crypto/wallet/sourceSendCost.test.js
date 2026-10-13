/**
 * @jest-environment node
 */
const { tronSendCost, TRC20_TRANSFER_ENERGY } = require('./sourceSendCost')

const params = { energyFeeSun: 100n, bandwidthFeeSun: 1000n, createAccountFeeSun: 1_000_000n }
const resources = (over = {}) => ({
	energy: 0n, energyLimit: 0n, freeBandwidth: 0n, freeBandwidthLimit: 600n,
	stakedBandwidth: 0n, stakedBandwidthLimit: 0n, ...over,
})

describe('coste del envío TRON al depósito', () => {

	it('sin datos no inventa un número', () => {
		expect(tronSendCost({ isToken: true, resources: null, params })).toBeNull()
		expect(tronSendCost({ isToken: true, resources: resources(), params: undefined })).toBeNull()
	})

	it('USDT sin energía ni banda: quema energía del peor caso + ancho de banda', () => {
		// 131.000 × 100 sun = 13,1 TRX + 345 × 1000 sun = 0,345 TRX → 13,445 → 13,45 hacia arriba
		expect(tronSendCost({ isToken: true, resources: resources(), params })).toEqual({ kind: 'burn', trx: 13.45, energyShort: true })
	})

	it('con energía y banda suficientes no se quema nada', () => {
		const r = resources({ energy: TRC20_TRANSFER_ENERGY, freeBandwidth: 600n })
		expect(tronSendCost({ isToken: true, resources: r, params })).toEqual({ kind: 'covered' })
	})

	it('con energía pero sin banda solo se quema la banda, y rentar energía no ayuda', () => {
		const r = resources({ energy: TRC20_TRANSFER_ENERGY })
		expect(tronSendCost({ isToken: true, resources: r, params })).toEqual({ kind: 'burn', trx: 0.35, energyShort: false })
	})

	it('TRX nativo: solo ancho de banda, gratis con la cuota diaria', () => {
		expect(tronSendCost({ isToken: false, resources: resources({ freeBandwidth: 600n }), params })).toEqual({ kind: 'covered' })
		expect(tronSendCost({ isToken: false, resources: resources(), params })).toEqual({ kind: 'burn', trx: 0.27, energyShort: false })
	})
})
