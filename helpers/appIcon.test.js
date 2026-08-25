/**
 * Unit tests for the app-icon bridge — node environment with the
 * AppIconChanger native module mocked (see keypadAmount.test.js for why).
 * @jest-environment node
 */
jest.mock('react-native', () => ({
	NativeModules: {
		AppIconChanger: {
			getIcon: jest.fn(),
			changeIcon: jest.fn(),
		},
	},
	Platform: { OS: 'ios' },
}))

import { NativeModules, Platform } from 'react-native'
import { APP_ICONS, changeAppIcon, getAppIcon } from './appIcon'

const { AppIconChanger } = NativeModules

beforeEach(() => {
	jest.clearAllMocks()
	AppIconChanger.getIcon.mockResolvedValue('default')
	AppIconChanger.changeIcon.mockResolvedValue(true)
	Platform.OS = 'ios'
})

describe('APP_ICONS', () => {
	test('has 8 unique ids with default first', () => {
		expect(APP_ICONS).toHaveLength(8)
		expect(APP_ICONS[0].id).toBe('default')
		expect(new Set(APP_ICONS.map(i => i.id)).size).toBe(8)
	})

	test('every icon carries an iosName and a preview asset', () => {
		APP_ICONS.forEach(icon => {
			expect(typeof icon.iosName).toBe('string')
			expect(icon.preview).toBeDefined()
		})
	})
})

describe('changeAppIcon', () => {
	test('passes the appiconset name on iOS', async () => {
		await changeAppIcon('midnight')
		expect(AppIconChanger.changeIcon).toHaveBeenCalledWith('AppIconMidnight')
	})

	test('passes the catalog id on Android', async () => {
		Platform.OS = 'android'
		await changeAppIcon('halloween')
		expect(AppIconChanger.changeIcon).toHaveBeenCalledWith('halloween')
	})

	test('maps default to the "default" sentinel on both platforms', async () => {
		await changeAppIcon('default')
		expect(AppIconChanger.changeIcon).toHaveBeenCalledWith('default')
	})

	test('rejects unknown ids without touching the native module', async () => {
		await expect(changeAppIcon('rainbow')).rejects.toThrow('Unknown app icon')
		expect(AppIconChanger.changeIcon).not.toHaveBeenCalled()
	})

	test('rethrows native failures so callers do not persist', async () => {
		AppIconChanger.changeIcon.mockRejectedValue(new Error('ICON_ERROR'))
		await expect(changeAppIcon('gold')).rejects.toThrow('ICON_ERROR')
	})
})

describe('getAppIcon', () => {
	test('maps an iOS alternate icon name back to its id', async () => {
		AppIconChanger.getIcon.mockResolvedValue('AppIconBlackFriday')
		await expect(getAppIcon()).resolves.toBe('blackfriday')
	})

	test('returns the id verbatim on Android', async () => {
		Platform.OS = 'android'
		AppIconChanger.getIcon.mockResolvedValue('navidad')
		await expect(getAppIcon()).resolves.toBe('navidad')
	})

	test('falls back to default on unknown values or native errors', async () => {
		AppIconChanger.getIcon.mockResolvedValue('AppIconRetired')
		await expect(getAppIcon()).resolves.toBe('default')
		AppIconChanger.getIcon.mockRejectedValue(new Error('x'))
		await expect(getAppIcon()).resolves.toBe('default')
	})
})
