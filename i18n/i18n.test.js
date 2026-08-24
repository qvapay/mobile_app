/**
 * Contract test del singleton de i18n — fija la estrategia de tests entera:
 * init síncrono en español, extracción verbatim (t() devuelve los literales
 * que las demás suites asertan), plurales _one/_other e interpolación.
 * @jest-environment node
 */
import i18n, { resolveLanguage, getDeviceLanguage, getDateLocale, SUPPORTED_LANGUAGES } from './index'

describe('i18n singleton', () => {
	test('inicializa síncrono, en español y con el bundle real', () => {
		expect(i18n.isInitialized).toBe(true)
		expect(i18n.language).toBe('es')
		expect(i18n.t('errors.server')).toBe('Ha ocurrido un error, contacte a soporte')
		expect(i18n.t('errors.network')).toBe('No se ha podido conectar con el servidor')
		expect(i18n.t('common.actions.retry')).toBe('Reintentar')
	})

	test('plurales via count (el 0 es plural, no singular)', () => {
		expect(i18n.t('common.time.day', { count: 1 })).toBe('1 día')
		expect(i18n.t('common.time.day', { count: 3 })).toBe('3 días')
		expect(i18n.t('common.time.day', { count: 0 })).toBe('0 días')
		expect(i18n.t('common.time.month', { count: 1 })).toBe('1 mes')
		expect(i18n.t('common.time.month', { count: 2 })).toBe('2 meses')
	})

	test('interpolación con variables nombradas', () => {
		expect(i18n.t('navigation.headers.orderNumber', { id: 42 })).toBe('Pedido #42')
	})

	test('resolveLanguage: elección explícita gana, lo desconocido cae a es', () => {
		expect(resolveLanguage('en')).toBe('en')
		expect(resolveLanguage('es')).toBe('es')
		expect(resolveLanguage('fr')).toBe('es')
		expect(resolveLanguage(null)).toBe(getDeviceLanguage())
		expect(SUPPORTED_LANGUAGES).toContain(resolveLanguage('auto'))
		expect(SUPPORTED_LANGUAGES).toContain(getDeviceLanguage())
	})

	test('el bundle inglés resuelve tras changeLanguage y getDateLocale lo sigue', async () => {
		await i18n.changeLanguage('en')
		expect(i18n.t('errors.network')).toBe('Could not connect to the server')
		expect(i18n.t('navigation.headers.deposit')).toBe('Deposit')
		expect(i18n.t('common.time.day', { count: 1 })).toBe('1 day')
		expect(getDateLocale()).toBe('en-US')
		// De vuelta a español (cada archivo de test tiene su propio registry,
		// pero dejamos el singleton como lo encontramos igualmente)
		await i18n.changeLanguage('es')
		expect(getDateLocale()).toBe('es-ES')
	})
})
