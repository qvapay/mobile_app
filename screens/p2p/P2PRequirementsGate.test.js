/**
 * El gate del P2P se va solo cuando el paso se completa fuera: al volver relee el perfil,
 * y tirar además vuelve a preguntar al servidor.
 * @jest-environment node
 */
const mockRefreshProfile = jest.fn(async () => null)
jest.mock('../../hooks/useProfileRefresh', () => () => mockRefreshProfile)
let mockPull
jest.mock('../../hooks/usePullRefresh', () => (refresh) => { mockPull = refresh; return null })
let mockFocus
jest.mock('@react-navigation/native', () => ({ useFocusEffect: (effect) => { mockFocus = effect } }))
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }))
jest.mock('../../hooks/useTabBarClearance', () => () => 0)
jest.mock('../../ui/particles/QPPressable', () => 'QPPressable')
jest.mock('@react-native-vector-icons/fontawesome6', () => 'FontAwesome6')

import React from 'react'
import { act, create } from 'react-test-renderer'
import { createTheme } from '../../theme/themeTokens'
import { createContainerStyles, createTextStyles } from '../../theme/themeUtils'
import P2PRequirementsGate from './P2PRequirementsGate'

const theme = createTheme(true)
const props = { user: { kyc: 1, phone_verified: 1, telegram_id: null, p2p_enabled: 1 }, navigation: { navigate: jest.fn() }, theme, textStyles: createTextStyles(theme), containerStyles: createContainerStyles(theme) }

let tree
afterEach(async () => { await act(async () => { tree.unmount() }) })
beforeEach(() => { jest.clearAllMocks() })

test('al enfocarse relee el perfil (Telegram se vincula en el bot)', async () => {
	await act(async () => { tree = create(<P2PRequirementsGate {...props} />) })
	await act(async () => { mockFocus() })
	expect(mockRefreshProfile).toHaveBeenCalledTimes(1)
})

test('tirar relee el perfil y vuelve a preguntar al servidor', async () => {
	const onRecheck = jest.fn()
	await act(async () => { tree = create(<P2PRequirementsGate {...props} serverMissing="kyc" onRecheck={onRecheck} />) })
	await act(async () => { await mockPull() })
	expect(mockRefreshProfile).toHaveBeenCalledTimes(1)
	expect(onRecheck).toHaveBeenCalledTimes(1)
})

test('sin gate del servidor, tirar solo relee el perfil', async () => {
	await act(async () => { tree = create(<P2PRequirementsGate {...props} />) })
	await act(async () => { await mockPull() })
	expect(mockRefreshProfile).toHaveBeenCalledTimes(1)
})
