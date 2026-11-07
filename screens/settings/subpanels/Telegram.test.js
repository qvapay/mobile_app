/**
 * Telegram: el vínculo cambia en el bot, fuera de la app. La pantalla relee el perfil
 * (que también va al AuthContext) al entrar, al volver del bot y al tirar.
 * @jest-environment node
 */
jest.mock('../../../theme/ThemeContext', () => {
	const { createTheme } = jest.requireActual('../../../theme/themeTokens')
	return { useTheme: () => ({ theme: createTheme(true) }) }
})
jest.mock('../../../auth/AuthContext', () => ({ useAuth: () => ({ updateUser: jest.fn() }) }))
const mockRefreshProfile = jest.fn()
jest.mock('../../../hooks/useProfileRefresh', () => () => mockRefreshProfile)
let mockPull
jest.mock('../../../hooks/usePullRefresh', () => (refresh) => { mockPull = refresh; return null })
jest.mock('../../../ui/particles/QPButton', () => 'QPButton')
jest.mock('../../../ui/particles/QPLoader', () => 'QPLoader')
jest.mock('@react-native-vector-icons/fontawesome6', () => 'FontAwesome6')
jest.mock('sonner-native', () => ({ toast: { success: jest.fn(), error: jest.fn() } }))
jest.mock('../../../api/userApi', () => ({ userApi: { getTelegramVerificationLink: jest.fn(), removeTelegram: jest.fn() } }))

import React from 'react'
import { AppState, Linking } from 'react-native'
import { act, create } from 'react-test-renderer'
import { userApi } from '../../../api/userApi'
import Telegram from './Telegram'

const settle = () => act(async () => { await new Promise(resolve => setTimeout(resolve, 0)) })
let tree
let appStateListener
beforeEach(() => {
	jest.clearAllMocks()
	jest.spyOn(AppState, 'addEventListener').mockImplementation((_event, listener) => { appStateListener = listener; return { remove: jest.fn() } })
	jest.spyOn(Linking, 'openURL').mockResolvedValue(true)
	mockRefreshProfile.mockResolvedValue({ telegram: '', telegram_id: null })
})
afterEach(async () => { await act(async () => { tree.unmount() }); jest.restoreAllMocks() })

const open = async () => { await act(async () => { tree = create(<Telegram />) }); await settle() }
const button = () => tree.root.findByType('QPButton')

test('al entrar lee el vínculo del perfil', async () => {
	await open()
	expect(mockRefreshProfile).toHaveBeenCalledTimes(1)
})

test('al volver del bot relee y pinta el vínculo nuevo', async () => {
	userApi.getTelegramVerificationLink.mockResolvedValue({ success: true, data: { verificationLink: 'https://t.me/bot?start=x' } })
	await open()
	await act(async () => { await button().props.onPress() })
	mockRefreshProfile.mockResolvedValue({ telegram: 'erich', telegram_id: 123 })
	await act(async () => { appStateListener('active') })
	await settle()
	expect(mockRefreshProfile).toHaveBeenCalledTimes(2)
	expect(button().props.title).not.toBe(undefined)
	expect(JSON.stringify(tree.toJSON())).toContain('erich')
})

test('volver a la app sin haber abierto el bot no relee', async () => {
	await open()
	await act(async () => { appStateListener('active') })
	expect(mockRefreshProfile).toHaveBeenCalledTimes(1)
})

test('tirar relee', async () => {
	await open()
	await act(async () => { await mockPull() })
	expect(mockRefreshProfile).toHaveBeenCalledTimes(2)
})
