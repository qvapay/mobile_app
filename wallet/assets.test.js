/**
 * @jest-environment node
 *
 * Catálogo de activos sobre el registry REAL empaquetado: si alguien cambia
 * bundled.json y rompe la lista base (p. ej. renombra una cadena), esto falla.
 */
import bundled from './registry/bundled.json'
import {
	assetPrice,
	buildAssetCatalog,
	DEFAULT_ASSETS,
	explorerAddressUrl,
	explorerTxUrl,
	findAssetForCoin,
	findCoinForAsset,
	isAssetVisible,
	sortAssets,
	toAssetView,
	totalUsd,
} from './assets'

const catalog = buildAssetCatalog(bundled)
const byId = Object.fromEntries(catalog.map(asset => [asset.id, asset]))
const find = (chainKey, symbol) => catalog.find(a => a.chainKey === chainKey && a.symbol === symbol)

const PRICES = { ETH: 2500, BNBBSC: 700, TRX: 0.34, BTC: 77000, MATICMAINNET: 0.1 }

describe('buildAssetCatalog', () => {
	test('cada activo de la lista base existe en el registry empaquetado', () => {
		DEFAULT_ASSETS.forEach(({ chainKey, symbol }) => {
			expect(find(chainKey, symbol)).toBeDefined()
		})
	})

	test('ETH, BSC y Base van por separado aunque compartan dirección', () => {
		expect(find('ethereum', 'ETH').id).toBe('ethereum:native')
		expect(find('base', 'ETH').id).toBe('base:native')
		expect(find('bsc', 'USDT').id).not.toBe(find('tron', 'USDT').id)
	})

	test('ticks de precio/logo de QvaPay y redes con nombre corto', () => {
		expect(find('bsc', 'BNB')).toMatchObject({ priceTick: 'BNBBSC', networkTick: 'BNBBSC', chainName: 'BNB Chain' })
		expect(find('base', 'ETH')).toMatchObject({ priceTick: 'ETH', logoTick: 'ETH', networkTick: 'BASE' })
		expect(find('polygon', 'USDC.e')).toMatchObject({ stable: true, logoTick: 'USDC', priceTick: 'USDC' })
		expect(find('tron', 'USDT')).toMatchObject({ contract: 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t', decimals: 6 })
	})
})

describe('valoración y visibilidad', () => {
	test('stable sin precio = 1 USD; volátil sin precio = null (no suma)', () => {
		expect(assetPrice(find('tron', 'USDT'), {})).toBe(1)
		expect(assetPrice(find('ethereum', 'ETH'), {})).toBeNull()
		expect(assetPrice(find('ethereum', 'ETH'), PRICES)).toBe(2500)
	})

	test('USDT-BEP20 con 18 decimales se valora bien', () => {
		const usdtBsc = find('bsc', 'USDT')
		const view = toAssetView(usdtBsc, { [usdtBsc.id]: '300000000000000000000' }, PRICES)
		expect(view).toMatchObject({ amount: '300', amountLabel: '300', usd: 300, hasBalance: true })
	})

	test('base visible aunque esté en cero; extra visible solo con saldo; prefs mandan', () => {
		const zero = toAssetView(find('ethereum', 'ETH'), {}, PRICES)
		const usdcBase = find('base', 'USDC')
		const usdcBaseEmpty = toAssetView(usdcBase, {}, PRICES)
		const usdcBaseFunded = toAssetView(usdcBase, { [usdcBase.id]: '5000000' }, PRICES)

		expect(isAssetVisible(zero, {})).toBe(true)
		expect(isAssetVisible(usdcBaseEmpty, {})).toBe(false)
		expect(isAssetVisible(usdcBaseFunded, {})).toBe(true)
		expect(isAssetVisible(zero, { 'ethereum:native': false })).toBe(false)
		expect(isAssetVisible(usdcBaseEmpty, { [usdcBase.id]: true })).toBe(true)
	})

	test('orden: USD desc, empates por lista base; total suma solo lo valorado', () => {
		const balances = {
			'tron:native': '45100000', // 45.1 TRX ≈ 15.33
			'bitcoin:native': '120000', // 0.0012 BTC ≈ 92.4
			[find('tron', 'USDT').id]: '820000000', // 820
		}
		const views = DEFAULT_ASSETS.map(({ chainKey, symbol }) => toAssetView(find(chainKey, symbol), balances, PRICES))
		const sorted = sortAssets(views).map(v => `${v.chainKey}:${v.symbol}`)
		expect(sorted.slice(0, 3)).toEqual(['tron:USDT', 'bitcoin:BTC', 'tron:TRX'])
		// ceros después, en el orden de la lista base
		expect(sorted.slice(3)).toEqual(['stacks:QUSD', 'bsc:USDT', 'ethereum:ETH', 'base:ETH', 'bsc:BNB'])
		expect(totalUsd(views)).toBeCloseTo(820 + 92.4 + 15.334, 2)
	})
})

describe('exploradores', () => {
	test('tx y address desde el template del registry', () => {
		expect(explorerTxUrl(bundled.chains.bsc, '0xabc')).toBe('https://bscscan.com/tx/0xabc')
		expect(explorerAddressUrl(bundled.chains.bsc, '0x1')).toBe('https://bscscan.com/address/0x1')
		expect(explorerAddressUrl(bundled.chains.tron, 'TX')).toBe('https://tronscan.org/#/address/TX')
		expect(explorerAddressUrl(bundled.chains.bitcoin, 'bc1q')).toBe('https://mempool.space/address/bc1q')
		expect(explorerAddressUrl(bundled.chains.stacks, 'SPX')).toBe('https://explorer.hiro.so/address/SPX?chain=mainnet')
		expect(find('stacks', 'QUSD')).toMatchObject({ stable: true, decimals: 8, contract: 'SP14CTSJZNKZ7YTR6C84368J2QXRW8RC20GSQ8KS2.QUSD::QUSD', networkTick: 'STX', priceTick: 'QUSD' })
		expect(byId['bitcoin:native']).toBeDefined()
	})
})

describe('puente con el catálogo de QvaPay', () => {
	const COINS = [
		{ tick: 'USDT', network: 'TRON' }, { tick: 'USDTBSC', network: 'BSC' }, { tick: 'USDCTRC20', network: 'TRON' },
		{ tick: 'BNBBSC', network: 'BSC' }, { tick: 'TRX', network: 'TRON' }, { tick: 'ETH', network: 'ETH' },
		{ tick: 'USDCBASE', network: 'BASE' }, { tick: 'USDTMATIC', network: 'POL' }, { tick: 'MATICMAINNET', network: null },
		{ tick: 'BTC', network: 'BTC' }, { tick: 'BTCLN', network: 'BTC' }, { tick: 'USDTSOL', network: 'SOL' }, { tick: 'EURCBASE', network: 'BASE' },
	]
	const id = (tick) => findAssetForCoin(catalog, COINS.find(c => c.tick === tick))?.id ?? null

	test('moneda → activo por red y símbolo', () => {
		expect(id('USDT')).toBe(find('tron', 'USDT').id)
		expect(id('USDTBSC')).toBe(find('bsc', 'USDT').id)
		expect(id('USDCTRC20')).toBe(find('tron', 'USDC').id)
		expect(id('BNBBSC')).toBe('bsc:native')
		expect(id('TRX')).toBe('tron:native')
		expect(id('ETH')).toBe('ethereum:native')
		expect(id('USDCBASE')).toBe(find('base', 'USDC').id)
		expect(id('USDTMATIC')).toBe(find('polygon', 'USDT').id)
		expect(id('BTC')).toBe('bitcoin:native')
	})

	test('sin puente: Lightning, redes ajenas, tokens fuera del registry, sin network', () => {
		expect(id('BTCLN')).toBeNull() // comparte network BTC pero es Lightning, no on-chain
		expect(id('USDTSOL')).toBeNull()
		expect(id('EURCBASE')).toBeNull()
		expect(id('MATICMAINNET')).toBeNull()
	})

	test('activo → moneda (primera que casa)', () => {
		expect(findCoinForAsset(COINS, catalog, find('tron', 'USDT')).tick).toBe('USDT')
		expect(findCoinForAsset(COINS, catalog, find('bsc', 'BNB')).tick).toBe('BNBBSC')
		expect(findCoinForAsset(COINS, catalog, find('polygon', 'USDC.e'))).toBeNull()
	})
})
