/**
 * Inicializa el singleton REAL de i18next con el bundle en español antes de
 * cada suite (via setupFiles). Estrategia de tests del i18n: la extracción a
 * `i18n/locales/es/*.json` es verbatim, así que `t()` devuelve exactamente los
 * literales españoles que las aserciones existentes ya esperan — y
 * `useTranslation()` funciona sin provider (initReactI18next registra la
 * instancia global), dejando intactos los harnesses `create(<Componente/>)`.
 */
require('./i18n')

/**
 * El SDK nativo de verificación de identidad es un TurboModule: importarlo en
 * el entorno node de jest lanzaría al registrar el módulo nativo. Mock global
 * con la misma superficie que consume useKycVerification; las suites que
 * necesiten resultados concretos lo re-mockean con jest.mocked/mockResolvedValue.
 */
/* global jest */
jest.mock('@didit-protocol/sdk-react-native', () => ({
	startVerification: jest.fn(async () => ({ type: 'cancelled' })),
	startVerificationWithWorkflow: jest.fn(async () => ({ type: 'cancelled' })),
	VerificationStatus: { Approved: 'Approved', Pending: 'Pending', Declined: 'Declined' },
}))

// Módulo nativo de bloqueo de capturas: sin binario en jest, stub inerte
jest.mock('react-native-screenshot-prevent', () => ({
	__esModule: true,
	default: { enabled: () => {}, enableSecureView: () => {}, disableSecureView: () => {}, addListener: () => ({ remove: () => {} }) },
	addListener: () => ({ remove: () => {} }),
}))

// AsyncStorage: el ESM del paquete no pasa por el transform y el nativo no existe en
// jest. Mock en memoria global (las suites que lo mockean por su cuenta siguen mandando).
jest.mock('@react-native-async-storage/async-storage', () => {
	const store = new Map()
	const api = {
		getItem: jest.fn(async key => (store.has(key) ? store.get(key) : null)),
		setItem: jest.fn(async (key, value) => { store.set(key, String(value)) }),
		removeItem: jest.fn(async key => { store.delete(key) }),
		multiGet: jest.fn(async keys => keys.map(key => [key, store.has(key) ? store.get(key) : null])),
		multiSet: jest.fn(async pairs => { pairs.forEach(([key, value]) => store.set(key, String(value))) }),
		multiRemove: jest.fn(async keys => { keys.forEach(key => store.delete(key)) }),
		getAllKeys: jest.fn(async () => [...store.keys()]),
		clear: jest.fn(async () => { store.clear() }),
	}
	return { __esModule: true, default: api, ...api }
})
