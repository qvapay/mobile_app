/**
 * Store de favoritas: hidrata una vez desde AsyncStorage (mock en memoria de
 * jest.setup.js), persiste cada cambio y separa las cuentas. Cada test carga
 * de cero el store Y su AsyncStorage (`resetModules`): el estado es de módulo,
 * y los dos tienen que salir del mismo registro para compartir el mock.
 * @jest-environment node
 */
const KEY = '@qpminiapps:favorites:v1'

let AsyncStorage
const loadStore = () => {
	jest.resetModules()
	AsyncStorage = require('@react-native-async-storage/async-storage').default
	return require('./miniappFavoritesStore')
}

const flush = () => new Promise(resolve => setImmediate(resolve))

test('hidrata lo guardado al suscribirse y avisa', async () => {
	const store = loadStore()
	await AsyncStorage.setItem(KEY, JSON.stringify({ u1: ['a', 'b'] }))
	const listener = jest.fn()
	store.subscribe(listener)
	await store.hydrate()
	expect(store.getFavoritesByOwner()).toEqual({ u1: ['a', 'b'] })
	expect(listener).toHaveBeenCalled()
})

test('marcar persiste y devuelve si quedó como favorita', async () => {
	const store = loadStore()
	await store.hydrate()
	expect(store.toggle('u1', 'a')).toBe(true)
	expect(store.toggle('u1', 'b')).toBe(true)
	expect(store.getFavoritesByOwner()).toEqual({ u1: ['b', 'a'] })
	await flush()
	expect(JSON.parse(await AsyncStorage.getItem(KEY))).toEqual({ u1: ['b', 'a'] })
	expect(store.toggle('u1', 'b')).toBe(false)
	expect(store.getFavoritesByOwner()).toEqual({ u1: ['a'] })
})

test('cada cuenta tiene las suyas; una cuenta sin favoritas desaparece del mapa', async () => {
	const store = loadStore()
	await store.hydrate()
	store.toggle('u1', 'a')
	store.toggle('u2', 'z')
	expect(store.getFavoritesByOwner()).toEqual({ u1: ['a'], u2: ['z'] })
	store.toggle('u2', 'z')
	expect(store.getFavoritesByOwner()).toEqual({ u1: ['a'] })
})

test('el snapshot conserva la referencia hasta un cambio (useSyncExternalStore)', async () => {
	const store = loadStore()
	await store.hydrate()
	const before = store.getFavoritesByOwner()
	expect(store.getFavoritesByOwner()).toBe(before)
	store.toggle('u1', 'a')
	expect(store.getFavoritesByOwner()).not.toBe(before)
})

test('lo marcado antes de terminar la lectura no se pisa', async () => {
	const store = loadStore()
	await AsyncStorage.setItem(KEY, JSON.stringify({ u1: ['viejo'], u2: ['otra'] }))
	const hydrating = store.hydrate()
	store.toggle('u1', 'nuevo')
	await hydrating
	expect(store.getFavoritesByOwner()).toEqual({ u1: ['nuevo'], u2: ['otra'] })
	await flush()
	expect(JSON.parse(await AsyncStorage.getItem(KEY))).toEqual({ u1: ['nuevo'], u2: ['otra'] })
})

test('un fallo del storage no rompe nada', async () => {
	const store = loadStore()
	AsyncStorage.getItem.mockRejectedValueOnce(new Error('disk'))
	await store.hydrate()
	expect(store.getFavoritesByOwner()).toEqual({})
	expect(store.toggle('u1', 'a')).toBe(true)
})
