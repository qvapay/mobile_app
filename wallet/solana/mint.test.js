/**
 * @jest-environment node
 *
 * Lectura de mints y multiplicador de Scaled UI de los xStocks, con datos REALES de mainnet
 * (NVDAx, 2026-10-14). Lo que no se puede romper: el multiplicador vigente es `newMultiplier`
 * en cuanto pasa su hora (leer solo `multiplier` deja corto el saldo), y la conversión
 * acciones → crudo nunca pide más de lo que hay.
 */
import { TOKEN_2022_PROGRAM, TOKEN_PROGRAM } from './codec'
import { currentMultiplier, decimalToFraction, mintTransferBlock, parseMintInfo, scaleRaw, unscaleToRaw } from './mint'
import { withXStocks, XSTOCKS, xStockByMint } from '../xstocks'

const NVDAX_ACCOUNT = {
	value: {
		owner: TOKEN_2022_PROGRAM,
		data: {
			parsed: {
				type: 'mint',
				info: {
					decimals: 8,
					extensions: [
						{ extension: 'permanentDelegate', state: { delegate: '5aMNNLQJwAEeoemTEMkv5NVjqKwvvefRYCQ5Z67HFvEq' } },
						{ extension: 'scaledUiAmountConfig', state: { multiplier: '1.0009180758490996', newMultiplier: '1.001701196801074', newMultiplierEffectiveTimestamp: 1789000200 } },
						{ extension: 'pausableConfig', state: { paused: false } },
						{ extension: 'transferHook', state: { programId: null } },
					],
				},
			},
		},
	},
}

describe('parseMintInfo', () => {

	test('xStock real: Token-2022, 8 decimales, sin pausa ni hook activo', () => {
		const info = parseMintInfo(NVDAX_ACCOUNT)
		expect(info).toMatchObject({ program: TOKEN_2022_PROGRAM, decimals: 8, paused: false, transferHook: null })
		expect(info.scaledUi).toEqual({ multiplier: '1.0009180758490996', newMultiplier: '1.001701196801074', effectiveAt: 1789000200 })
		expect(mintTransferBlock(info)).toBeNull()
	})

	test('mint clásico sin extensiones', () => {
		const info = parseMintInfo({ value: { owner: TOKEN_PROGRAM, data: { parsed: { type: 'mint', info: { decimals: 6 } } } } })
		expect(info).toMatchObject({ program: TOKEN_PROGRAM, decimals: 6, paused: false, transferHook: null, scaledUi: null })
	})

	test('pausa y hook bloquean; otra cosa que no sea un mint no se acepta', () => {
		const paused = JSON.parse(JSON.stringify(NVDAX_ACCOUNT))
		paused.value.data.parsed.info.extensions[2].state.paused = true
		expect(mintTransferBlock(parseMintInfo(paused))).toBe('paused')
		const hooked = JSON.parse(JSON.stringify(NVDAX_ACCOUNT))
		hooked.value.data.parsed.info.extensions[3].state.programId = 'Hook111111111111111111111111111111111111111'
		expect(mintTransferBlock(parseMintInfo(hooked))).toBe('transferHook')
		expect(parseMintInfo({ value: null })).toBeNull()
		expect(parseMintInfo({ value: { owner: '11111111111111111111111111111111', data: { parsed: { type: 'mint', info: { decimals: 6 } } } } })).toBeNull()
		expect(parseMintInfo({ value: { owner: TOKEN_PROGRAM, data: { parsed: { type: 'account', info: { decimals: 6 } } } } })).toBeNull()
	})
})

describe('multiplicador', () => {

	test('decimal en texto → fracción exacta', () => {
		expect(decimalToFraction('1')).toEqual({ num: 1n, den: 1n })
		expect(decimalToFraction('1.0017')).toEqual({ num: 10017n, den: 10000n })
		expect(decimalToFraction('1e-3')).toBeNull()
		expect(decimalToFraction('-1')).toBeNull()
	})

	test('antes de su hora manda `multiplier`; después, `newMultiplier`', () => {
		const { scaledUi } = parseMintInfo(NVDAX_ACCOUNT)
		expect(currentMultiplier(scaledUi, 1789000199)).toEqual(decimalToFraction('1.0009180758490996'))
		expect(currentMultiplier(scaledUi, 1789000200)).toEqual(decimalToFraction('1.001701196801074'))
		expect(currentMultiplier(null, 0)).toEqual({ num: 1n, den: 1n })
		expect(currentMultiplier({ multiplier: 'basura', newMultiplier: '', effectiveAt: 0 }, 0)).toEqual({ num: 1n, den: 1n })
	})

	test('crudo ↔ acciones: escalar trunca y desescalar nunca pide de más', () => {
		const m = decimalToFraction('1.001701196801074')
		const raw = 100_000_000n // 1 unidad cruda
		const shares = scaleRaw(raw, m)
		expect(shares).toBe(100_170_119n)
		const back = unscaleToRaw(shares, m)
		expect(back <= raw).toBe(true)
		expect(raw - back).toBeLessThanOrEqual(1n)
	})
})

describe('xStocks', () => {

	test('doce mints únicos, todos con la marca de Backed (`Xs…`) y subyacente', () => {
		expect(XSTOCKS).toHaveLength(12)
		expect(new Set(XSTOCKS.map(s => s.mint)).size).toBe(12)
		XSTOCKS.forEach(s => {
			expect(s.mint.startsWith('Xs')).toBe(true)
			expect(s.symbol).toBe(`${s.underlying}x`)
		})
		expect(xStockByMint('XsDoVfqeBukxuZHWhdvWHBhgEHjGNst4MLodqsJHzoB')?.underlying).toBe('TSLA')
	})

	test('withXStocks añade los doce a Solana y expulsa falsificaciones por símbolo', () => {
		const registry = {
			version: 1,
			chains: {
				solana: { kind: 'solana', name: 'Solana', native: { symbol: 'SOL', decimals: 9 }, rpcs: [], tokens: [
					{ symbol: 'USDC', address: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', decimals: 6 },
					{ symbol: 'TSLAx', address: 'HnpaH1HkEj7asNHm8rTeutgixBor11bdVj3ELcfvFU8j', decimals: 6 },
				] },
				tron: { kind: 'tron', name: 'TRON', native: { symbol: 'TRX', decimals: 6 }, rpcs: [] },
			},
		}
		const out = withXStocks(registry)
		const tokens = out.chains.solana.tokens
		expect(tokens.find(t => t.address === 'HnpaH1HkEj7asNHm8rTeutgixBor11bdVj3ELcfvFU8j')).toBeUndefined()
		expect(tokens.filter(t => t.kind === 'stock')).toHaveLength(12)
		expect(tokens.find(t => t.symbol === 'USDC')).toBeDefined()
		expect(tokens.find(t => t.symbol === 'TSLAx')).toMatchObject({ address: 'XsDoVfqeBukxuZHWhdvWHBhgEHjGNst4MLodqsJHzoB', program: 'token2022', decimals: 8 })
		expect(out.chains.tron).toBe(registry.chains.tron)
		// Sin Solana en el registro, no toca nada
		expect(withXStocks({ version: 1, chains: { tron: registry.chains.tron } }).chains.solana).toBeUndefined()
	})
})
