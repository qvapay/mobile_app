/**
 * El destino de un envío contra el historial del usuario: lo que el address poisoning
 * intenta colar (una dirección con el mismo principio y final que una de confianza) tiene
 * que salir como `lookalike` o `poisoner`, y lo legítimo no puede asustar.
 * @jest-environment node
 */
import { addressDiff, checkRecipient, isBlockingVerdict, LOOKALIKE_MIN_EDGE, LOOKALIKE_MIN_EDGES } from './recipients'

// Wallet del usuario en TRON y un destinatario habitual (Bob)
const ME_TRON = 'TJRabPrwbZy45sbavfcjinPJC18kjpRTv8'
const BOB_TRON = 'TQrY8tryqsYVCYS3MFbtffiPp2ccyn4STm'
// Generada para imitar a Bob: mismos 6 primeros y 6 últimos, medio distinto
const FAKE_BOB_TRON = 'TQrY8tPkd2cWJ7hHmzXnoAe5vRbcyn4STm'

const ME_EVM = '0x2A6f3C8bD3eE0c4F5a1b7c9D0e1F2a3B4c5D6e7F'
const BOB_EVM = '0x8f3Ae21cB57D9a0C4e6F1b2D3c4E5f6A7b8CC9d1'
const FAKE_BOB_EVM = '0x8f3Ae2d41F0b9C7e2A5d8E1f3B6c9a0D2e4CC9d1'

const tx = (over) => ({
	kind: undefined,
	hash: `h${Math.random()}`,
	time: 1_790_000_000,
	direction: 'out',
	from: ME_TRON,
	to: BOB_TRON,
	amount: '120',
	symbol: 'USDT',
	contract: 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t',
	fee: null,
	status: 'confirmed',
	...over,
})

const tron = (to, items, priceUsd = 1) => checkRecipient({ kind: 'tron', to, own: [ME_TRON], histories: [{ items, priceUsd }] })
const evm = (to, histories) => checkRecipient({ kind: 'evm', to, own: [ME_EVM], histories })

describe('checkRecipient: el ataque', () => {
	test('polvo desde una imitación de Bob y el usuario la copia → lookalike (y dice a quién imita)', () => {
		const history = [
			tx({ direction: 'in', from: FAKE_BOB_TRON, to: ME_TRON, amount: '0.001' }),
			tx({ to: BOB_TRON }),
		]
		expect(tron(FAKE_BOB_TRON, history)).toEqual({ kind: 'lookalike', of: BOB_TRON, known: false })
	})

	test('transferFrom de 0 desde la wallet del usuario: la imitación aparece como SALIDA, y no por eso es conocida', () => {
		const history = [
			tx({ direction: 'out', to: FAKE_BOB_TRON, amount: '0' }),
			tx({ to: BOB_TRON }),
		]
		expect(tron(FAKE_BOB_TRON, history)).toEqual({ kind: 'lookalike', of: BOB_TRON, known: false })
	})

	test('la imitación manda algo más que polvo ($0.50) para parecer legítima: sigue siendo lookalike', () => {
		const history = [
			tx({ direction: 'in', from: FAKE_BOB_TRON, to: ME_TRON, amount: '0.5' }),
			tx({ to: BOB_TRON }),
		]
		expect(tron(FAKE_BOB_TRON, history)).toEqual({ kind: 'lookalike', of: BOB_TRON, known: false })
	})

	test('imitación de una dirección PROPIA (mover fondos entre wallets) → lookalike de la propia', () => {
		const fakeMe = `${ME_TRON.slice(0, 7)}9xQ2mWvLpZ4kHs7nDd3aB${ME_TRON.slice(-6)}`
		expect(fakeMe).toHaveLength(ME_TRON.length)
		expect(tron(fakeMe, [])).toEqual({ kind: 'lookalike', of: ME_TRON, known: false })
	})

	test('imitación de quien PAGÓ al usuario (devolverle el dinero) → lookalike', () => {
		const history = [tx({ direction: 'in', from: BOB_TRON, to: ME_TRON, amount: '50' })]
		expect(tron(FAKE_BOB_TRON, history)).toEqual({ kind: 'lookalike', of: BOB_TRON, known: false })
	})

	test('solo polvo o ceros, sin nada de confianza a lo que se parezca → poisoner', () => {
		const stranger = 'TXk9mN2pQ7rS4tU6vW8yZ1aB3cD5eF7gH9'
		expect(tron(stranger, [tx({ direction: 'in', from: stranger, to: ME_TRON, amount: '0.000001' })])).toEqual({ kind: 'poisoner' })
		expect(tron(stranger, [tx({ direction: 'out', to: stranger, amount: '0' })])).toEqual({ kind: 'poisoner' })
	})

	test('EVM: lo enviado en BSC protege un envío en Ethereum (la misma dirección en las dos)', () => {
		const bsc = { items: [tx({ from: ME_EVM, to: BOB_EVM, contract: '0x55d398326f99059fF775485246999027B3197955' })], priceUsd: 1 }
		const eth = { items: [tx({ direction: 'in', from: FAKE_BOB_EVM, to: ME_EVM, amount: '0.0001' })], priceUsd: 1 }
		expect(evm(FAKE_BOB_EVM, [eth, bsc])).toEqual({ kind: 'lookalike', of: BOB_EVM, known: false })
	})

	test('EVM: la imitación pegada en minúsculas no se escapa por el checksum', () => {
		const history = [{ items: [tx({ from: ME_EVM, to: BOB_EVM })], priceUsd: 1 }]
		expect(evm(FAKE_BOB_EVM.toLowerCase(), history)).toEqual({ kind: 'lookalike', of: BOB_EVM, known: false })
	})

	test('base58 distingue mayúsculas: cambiar UNA letra de caja es otra dirección, y se parece', () => {
		const flipped = `${BOB_TRON.slice(0, 12)}${BOB_TRON[12].toLowerCase()}${BOB_TRON.slice(13)}`
		expect(flipped).not.toBe(BOB_TRON)
		expect(tron(flipped, [tx({ to: BOB_TRON })])).toEqual({ kind: 'lookalike', of: BOB_TRON, known: false })
	})

	test('con varias de confianza parecidas, señala la que MÁS se parece', () => {
		const closer = `${FAKE_BOB_TRON.slice(0, 10)}${BOB_TRON.slice(10)}`
		const history = [tx({ to: BOB_TRON }), tx({ to: closer })]
		const target = `${FAKE_BOB_TRON.slice(0, 10)}Zz${BOB_TRON.slice(12)}`
		expect(tron(target, history)).toEqual({ kind: 'lookalike', of: closer, known: false })
	})
})

describe('checkRecipient: el parecido manda sobre "ya se le envió"', () => {
	test('envío de prueba a la imitación (1 USDT) y luego el grande: el grande también avisa', () => {
		const history = [
			tx({ to: FAKE_BOB_TRON, amount: '1' }),
			tx({ to: BOB_TRON }),
		]
		expect(tron(FAKE_BOB_TRON, history)).toEqual({ kind: 'lookalike', of: BOB_TRON, known: true })
	})

	test('ya pagó una vez a la imitación: enviar al Bob de verdad avisa, sin decir cuál es la buena', () => {
		const history = [
			tx({ to: FAKE_BOB_TRON, amount: '300' }),
			tx({ to: BOB_TRON }),
		]
		expect(tron(BOB_TRON, history)).toEqual({ kind: 'lookalike', of: FAKE_BOB_TRON, known: true })
	})

	test('la imitación mandó una cantidad real ($0.50) para parecer legítima: enviar a Bob avisa', () => {
		const history = [
			tx({ direction: 'in', from: FAKE_BOB_TRON, to: ME_TRON, amount: '0.5' }),
			tx({ to: BOB_TRON }),
		]
		expect(tron(BOB_TRON, history)).toEqual({ kind: 'lookalike', of: FAKE_BOB_TRON, known: true })
	})

	test('polvo o un transferFrom de 0 desde una imitación NO hacen avisar al Bob de verdad (llegan a diario)', () => {
		expect(tron(BOB_TRON, [tx({ direction: 'in', from: FAKE_BOB_TRON, to: ME_TRON, amount: '0.001' }), tx({ to: BOB_TRON })])).toEqual({ kind: 'known' })
		expect(tron(BOB_TRON, [tx({ to: FAKE_BOB_TRON, amount: '0' }), tx({ to: BOB_TRON })])).toEqual({ kind: 'known' })
	})
})

describe('checkRecipient: lo legítimo no asusta', () => {
	test('a quien ya se le envió dinero → known', () => {
		expect(tron(BOB_TRON, [tx({ to: BOB_TRON })])).toEqual({ kind: 'known' })
	})

	test('EVM y bech32 sin distinguir mayúsculas: un QR BIP-21 en MAYÚSCULAS sigue siendo conocido', () => {
		expect(evm(BOB_EVM.toLowerCase(), [{ items: [tx({ from: ME_EVM, to: BOB_EVM })], priceUsd: 1 }])).toEqual({ kind: 'known' })
		const me = 'bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq'
		const bob = 'bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh'
		const verdict = checkRecipient({ kind: 'btc', to: bob.toUpperCase(), own: [me], histories: [{ items: [tx({ from: me, to: bob, amount: '0.01' })], priceUsd: 77_000 }] })
		expect(verdict).toEqual({ kind: 'known' })
	})

	test('una dirección propia → self', () => {
		expect(tron(ME_TRON, [])).toEqual({ kind: 'self' })
		expect(evm(ME_EVM.toLowerCase(), [])).toEqual({ kind: 'self' })
	})

	test('una dirección cualquiera sin historial → new', () => {
		expect(tron('TXk9mN2pQ7rS4tU6vW8yZ1aB3cD5eF7gH9', [tx({ to: BOB_TRON })])).toEqual({ kind: 'new' })
		expect(tron(BOB_TRON, [])).toEqual({ kind: 'new' })
	})

	test('quien pagó al usuario (cantidad real) y nunca recibió de él → new, no poisoner', () => {
		expect(tron(BOB_TRON, [tx({ direction: 'in', from: BOB_TRON, to: ME_TRON, amount: '50' })])).toEqual({ kind: 'new' })
	})

	test('un envío fallido, uno pendiente, una comisión o el staking no hacen conocida una dirección', () => {
		expect(tron(BOB_TRON, [tx({ status: 'failed' })])).toEqual({ kind: 'new' })
		expect(tron(BOB_TRON, [tx({ status: 'pending' })])).toEqual({ kind: 'new' })
		expect(tron(BOB_TRON, [tx({ kind: 'fee', amount: '0.3' })])).toEqual({ kind: 'new' })
		expect(tron(BOB_TRON, [tx({ kind: 'vote', amount: '100' })])).toEqual({ kind: 'new' })
	})

	test('sin precio no se puede decir que algo es polvo: una entrada mínima de un activo sin precio no acusa', () => {
		const stranger = 'TXk9mN2pQ7rS4tU6vW8yZ1aB3cD5eF7gH9'
		expect(tron(stranger, [tx({ direction: 'in', from: stranger, to: ME_TRON, amount: '0.000001' })], null)).toEqual({ kind: 'new' })
	})

	test('quien manda polvo Y también dinero de verdad deja de ser sospechoso', () => {
		const payer = 'TXk9mN2pQ7rS4tU6vW8yZ1aB3cD5eF7gH9'
		const history = [
			tx({ direction: 'in', from: payer, to: ME_TRON, amount: '0.001' }),
			tx({ direction: 'in', from: payer, to: ME_TRON, amount: '40' }),
		]
		expect(tron(payer, history)).toEqual({ kind: 'new' })
	})
})

describe('umbral de parecido', () => {
	// Sobre la parte significativa (sin el `0x`): cuántos extremos comparte con Bob
	const withEdges = (head, tail) => {
		const body = BOB_EVM.slice(2).toLowerCase()
		const middle = body.slice(head, body.length - tail).split('').map(c => (c === 'f' ? 'e' : 'f')).join('')
		return `0x${body.slice(0, head)}${middle}${body.slice(body.length - tail)}`
	}
	const history = [{ items: [tx({ from: ME_EVM, to: BOB_EVM })], priceUsd: 1 }]

	test('es lo que dicen las constantes', () => {
		expect(LOOKALIKE_MIN_EDGE).toBe(2)
		expect(LOOKALIKE_MIN_EDGES).toBe(6)
	})

	test('3 + 3 o 2 + 4 → lookalike; 2 + 3 o 1 + 6 → no', () => {
		expect(evm(withEdges(3, 3), history).kind).toBe('lookalike')
		expect(evm(withEdges(2, 4), history).kind).toBe('lookalike')
		expect(evm(withEdges(4, 2), history).kind).toBe('lookalike')
		expect(evm(withEdges(2, 3), history).kind).toBe('new')
		expect(evm(withEdges(1, 6), history).kind).toBe('new')
		expect(evm(withEdges(6, 1), history).kind).toBe('new')
	})

	test('el prefijo fijo del formato no cuenta como parecido (toda TRON empieza por T, toda EVM por 0x)', () => {
		// Comparte `TQ` y los 5 últimos: contando la T serían 2 + 5 (lookalike); sin ella, 1 + 5 (no)
		const target = `TQ${'a'.repeat(27)}${BOB_TRON.slice(-5)}`
		expect(target).toHaveLength(BOB_TRON.length)
		expect(tron(target, [tx({ to: BOB_TRON })]).kind).toBe('new')
	})
})

describe('isBlockingVerdict', () => {
	test('lookalike y poisoner exigen confirmar; el resto no', () => {
		expect(isBlockingVerdict({ kind: 'lookalike', of: BOB_TRON, known: false })).toBe(true)
		expect(isBlockingVerdict({ kind: 'poisoner' })).toBe(true)
		for (const kind of ['self', 'known', 'new']) expect(isBlockingVerdict({ kind })).toBe(false)
		expect(isBlockingVerdict(null)).toBe(false)
	})
})

describe('addressDiff', () => {
	test('principio y final compartidos, y el medio que cambia', () => {
		expect(addressDiff('tron', FAKE_BOB_TRON, BOB_TRON)).toEqual({ head: 'TQrY8t', middle: 'Pkd2cWJ7hHmzXnoAe5vRb', tail: 'cyn4STm' })
	})

	test('EVM compara sin mayúsculas pero devuelve la dirección tal cual se escribió', () => {
		const diff = addressDiff('evm', FAKE_BOB_EVM, BOB_EVM.toLowerCase())
		expect(diff.head + diff.middle + diff.tail).toBe(FAKE_BOB_EVM)
		expect(diff.head).toBe('0x8f3Ae2')
		expect(diff.tail).toBe('CC9d1')
	})
})
