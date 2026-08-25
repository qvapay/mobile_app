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
