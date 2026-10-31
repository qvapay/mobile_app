/**
 * Puente de los accesos directos a mini-apps con el módulo nativo simulado:
 * qué se manda, cuándo NO se vuelve a mandar y qué pasa en cada plataforma.
 * @jest-environment node
 */
jest.mock('react-native', () => ({
	NativeModules: {},
	TurboModuleRegistry: { get: jest.fn() },
	Platform: { OS: 'android' },
}))
jest.mock('./miniAppIconBitmap', () => ({ renderMiniAppIconPng: jest.fn() }))

const native = {
	isPinSupported: jest.fn(),
	requestPin: jest.fn(),
	setQuickActions: jest.fn(),
	clearQuickActions: jest.fn(),
}

// Estado de módulo (firma publicada, caché de iconos): cada test carga uno
// nuevo, junto con los mocks del MISMO registro para poder configurarlos
let Platform
let renderMiniAppIconPng
const load = () => {
	jest.resetModules()
	const RN = require('react-native')
	Platform = RN.Platform
	RN.TurboModuleRegistry.get.mockReturnValue(native)
	renderMiniAppIconPng = require('./miniAppIconBitmap').renderMiniAppIconPng
	renderMiniAppIconPng.mockImplementation(async icon => `png:${icon}`)
	return require('./miniAppShortcuts')
}

const item = (slug, extra = {}) => ({ slug, name: `App ${slug}`, icon: `apps/${slug}.png`, ...extra })

beforeEach(() => {
	jest.clearAllMocks()
	native.isPinSupported.mockResolvedValue(true)
	native.requestPin.mockResolvedValue(true)
	native.setQuickActions.mockResolvedValue(true)
	native.clearQuickActions.mockResolvedValue(true)
})

describe('setMiniAppQuickActions', () => {
	test('manda id, nombre, URL pública y el icono pintado (Android)', async () => {
		const { setMiniAppQuickActions } = load()
		await setMiniAppQuickActions([item('domino')])
		expect(native.setQuickActions).toHaveBeenCalledWith([
			{ id: 'miniapp:domino', label: 'App domino', url: 'https://www.qvapay.com/apps/domino', icon: 'png:apps/domino.png' },
		])
	})

	test('en iOS no pinta iconos (solo admite símbolos del sistema)', async () => {
		const { setMiniAppQuickActions } = load()
		Platform.OS = 'ios'
		await setMiniAppQuickActions([item('domino')])
		expect(renderMiniAppIconPng).not.toHaveBeenCalled()
		expect(native.setQuickActions.mock.calls[0][0][0].icon).toBeNull()
	})

	test('la misma lista no vuelve a tocar el nativo', async () => {
		const { setMiniAppQuickActions } = load()
		await setMiniAppQuickActions([item('a'), item('b')])
		await setMiniAppQuickActions([item('a'), item('b')])
		expect(native.setQuickActions).toHaveBeenCalledTimes(1)
		await setMiniAppQuickActions([item('b'), item('a')])
		expect(native.setQuickActions).toHaveBeenCalledTimes(2)
	})

	test('lista vacía = quitarlos', async () => {
		const { setMiniAppQuickActions, clearMiniAppQuickActions } = load()
		await setMiniAppQuickActions([item('a')])
		await clearMiniAppQuickActions()
		expect(native.clearQuickActions).toHaveBeenCalledTimes(1)
	})

	test('si el nativo falla, el siguiente intento vuelve a mandarla', async () => {
		native.setQuickActions.mockRejectedValueOnce(new Error('rate limited'))
		const { setMiniAppQuickActions } = load()
		await setMiniAppQuickActions([item('a')])
		await setMiniAppQuickActions([item('a')])
		expect(native.setQuickActions).toHaveBeenCalledTimes(2)
	})

	test('si Android la limita (responde false), el siguiente intento vuelve a mandarla', async () => {
		native.setQuickActions.mockResolvedValueOnce(false)
		const { setMiniAppQuickActions } = load()
		await setMiniAppQuickActions([item('a')])
		await setMiniAppQuickActions([item('a')])
		await setMiniAppQuickActions([item('a')])
		expect(native.setQuickActions).toHaveBeenCalledTimes(2)
	})

	test('si llega una lista más nueva mientras se pintan los iconos, gana la nueva', async () => {
		let release
		const { setMiniAppQuickActions } = load()
		renderMiniAppIconPng.mockImplementationOnce(() => new Promise(resolve => { release = () => resolve('png:slow') }))
		const first = setMiniAppQuickActions([item('slow')])
		await setMiniAppQuickActions([item('fast')])
		release()
		await first
		expect(native.setQuickActions).toHaveBeenCalledTimes(1)
		expect(native.setQuickActions.mock.calls[0][0][0].id).toBe('miniapp:fast')
	})

	test('los iconos pintados se reutilizan; un fallo se reintenta', async () => {
		const { setMiniAppQuickActions } = load()
		renderMiniAppIconPng.mockResolvedValueOnce(null)
		await setMiniAppQuickActions([item('a')])
		expect(native.setQuickActions.mock.calls[0][0][0].icon).toBeNull()
		await setMiniAppQuickActions([item('a', { name: 'Otro nombre' })])
		await setMiniAppQuickActions([item('a', { name: 'Tercero' })])
		expect(renderMiniAppIconPng).toHaveBeenCalledTimes(2)
		expect(native.setQuickActions.mock.calls[2][0][0].icon).toBe('png:apps/a.png')
	})

	test('refresh republica la última lista aunque no haya cambiado', async () => {
		const { setMiniAppQuickActions, refreshMiniAppQuickActions } = load()
		await setMiniAppQuickActions([item('a')])
		await refreshMiniAppQuickActions()
		expect(native.setQuickActions).toHaveBeenCalledTimes(2)
	})

	test('sin módulo nativo no hace nada ni lanza', async () => {
		const { setMiniAppQuickActions } = load()
		require('react-native').TurboModuleRegistry.get.mockReturnValue(null)
		await expect(setMiniAppQuickActions([item('a')])).resolves.toBeUndefined()
	})
})

describe('anclar a la pantalla de inicio', () => {
	test('solo en Android y si el launcher lo admite', async () => {
		const { canPinShortcut } = load()
		await expect(canPinShortcut()).resolves.toBe(true)
		native.isPinSupported.mockResolvedValueOnce(false)
		await expect(canPinShortcut()).resolves.toBe(false)
		Platform.OS = 'ios'
		await expect(canPinShortcut()).resolves.toBe(false)
	})

	test('pide el acceso con el icono pintado', async () => {
		const { pinMiniAppShortcut } = load()
		await expect(pinMiniAppShortcut(item('domino'))).resolves.toBe('requested')
		expect(native.requestPin).toHaveBeenCalledWith({ id: 'miniapp:domino', label: 'App domino', url: 'https://www.qvapay.com/apps/domino', icon: 'png:apps/domino.png' })
	})

	test('launcher que no acepta, error nativo o iOS', async () => {
		const { pinMiniAppShortcut } = load()
		native.requestPin.mockResolvedValueOnce(false)
		await expect(pinMiniAppShortcut(item('a'))).resolves.toBe('unsupported')
		native.requestPin.mockRejectedValueOnce(new Error('boom'))
		await expect(pinMiniAppShortcut(item('a'))).resolves.toBe('failed')
		Platform.OS = 'ios'
		await expect(pinMiniAppShortcut(item('a'))).resolves.toBe('unsupported')
	})
})
