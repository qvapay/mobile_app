/**
 * Behavior tests for the Send screen — recipient carousel merging/dedupe,
 * recipient resolution from route params, send-button gating and the handoff
 * payload to SendConfirm (no money moves here) — node environment with every
 * collaborator mocked (see keypadAmount.test.js for why node env, and
 * auth/screens/Login.test.js for the screen-testing pattern).
 * @jest-environment node
 */
jest.mock('../../theme/ThemeContext', () => {
	const { createTheme } = jest.requireActual('../../theme/ThemeContext')
	return { useTheme: () => ({ theme: createTheme(true) }) }
})
jest.mock('../../auth/AuthContext', () => ({ useAuth: jest.fn() }))
jest.mock('../../hooks/OnlineStatusContext', () => ({ useOnlineStatus: jest.fn() }))
jest.mock('../../ui/QPKeyboardView', () => {
	const React = require('react')
	const { View } = require('react-native')
	return ({ children, actions }) => React.createElement(View, null, children, actions)
})
jest.mock('../../ui/AmountInput', () => 'AmountInput')
jest.mock('../../ui/particles/QPInput', () => 'QPInput')
jest.mock('../../ui/particles/QPAvatar', () => 'QPAvatar')
jest.mock('../../ui/particles/QPButton', () => 'QPButton')
jest.mock('../../ui/particles/QPPressable', () => 'QPPressable')
jest.mock('../../ui/particles/TransactionSticker', () => 'TransactionSticker')
jest.mock('../../ui/ProfileContainerHorizontal', () => 'ProfileContainerHorizontal')
jest.mock('./SendUserSearchModal', () => 'SendUserSearchModal')
jest.mock('./StickerPickerModal', () => 'StickerPickerModal')
jest.mock('../../api/userApi', () => ({
	userApi: { searchUser: jest.fn(), getContacts: jest.fn() },
}))
jest.mock('../../api/transferApi', () => ({
	transferApi: { getLatestSentTransfers: jest.fn() },
}))
jest.mock('@react-native-vector-icons/fontawesome6', () => 'FontAwesome6')
jest.mock('sonner-native', () => ({ toast: { success: jest.fn(), error: jest.fn() } }))

import React from 'react'
import { act, create } from 'react-test-renderer'
import { useAuth } from '../../auth/AuthContext'
import { useOnlineStatus } from '../../hooks/OnlineStatusContext'
import { userApi } from '../../api/userApi'
import { transferApi } from '../../api/transferApi'
import { ROUTES } from '../../routes'
import Send from './Send'

const RECIPIENT = { uuid: 'u-9', name: 'Ana', username: 'ana', image: 'ana.png' }
const navigation = { navigate: jest.fn(), goBack: jest.fn() }
const trackUsers = jest.fn()
const untrackUsers = jest.fn()
const isUserOnline = jest.fn(() => false)

const renderSend = async (params = {}) => {
	let tree
	await act(async () => { tree = create(<Send navigation={navigation} route={{ params }} />) })
	return tree
}

const sendButton = (tree) => tree.root.findByType('QPButton')
const setAmount = (tree, value) => act(async () => { tree.root.findByType('AmountInput').props.onAmountChange(value) })
const selectRecipient = (tree, user = RECIPIENT) =>
	act(async () => { tree.root.findByType('SendUserSearchModal').props.onSelect(user) })

beforeEach(() => {
	jest.clearAllMocks()
	useAuth.mockReturnValue({ user: { balance: 100, golden_check: true } })
	useOnlineStatus.mockReturnValue({ trackUsers, untrackUsers, isUserOnline })
	transferApi.getLatestSentTransfers.mockResolvedValue({ success: true, data: [] })
	userApi.getContacts.mockResolvedValue({ success: true, data: [] })
	userApi.searchUser.mockResolvedValue({ success: true, data: [RECIPIENT] })
})

describe('recipient carousel', () => {
	test('merges sent transfers and contacts, deduped and skipping imageless users', async () => {
		transferApi.getLatestSentTransfers.mockResolvedValue({
			success: true,
			data: [{ uuid: 'u-1', image: 'a.png' }, { uuid: 'u-2' }],
		})
		userApi.getContacts.mockResolvedValue({
			success: true,
			data: [{ Contact: { uuid: 'u-1', image: 'a.png' } }, { Contact: { uuid: 'u-3', image: 'c.png' } }],
		})
		const tree = await renderSend()
		const avatars = tree.root.findAllByType('QPAvatar').map(a => a.props.user.uuid)
		expect(avatars).toEqual(['u-1', 'u-3'])
	})

	test('tapping a carousel avatar resolves that user via searchUser', async () => {
		transferApi.getLatestSentTransfers.mockResolvedValue({
			success: true,
			data: [{ uuid: 'u-3', image: 'c.png' }],
		})
		const tree = await renderSend()
		const avatar = tree.root.findAllByType('QPAvatar').find(a => a.props.user.uuid === 'u-3')
		let node = avatar.parent
		while (node && typeof node.props.onPress !== 'function') { node = node.parent }
		await act(async () => { node.props.onPress() })
		expect(userApi.searchUser).toHaveBeenCalledWith('u-3')
		expect(tree.root.findByType('ProfileContainerHorizontal').props.user).toEqual(RECIPIENT)
	})
})

describe('recipient from route params', () => {
	test('a user_uuid param resolves and shows the recipient', async () => {
		const tree = await renderSend({ user_uuid: 'u-9' })
		expect(userApi.searchUser).toHaveBeenCalledWith('u-9')
		expect(tree.root.findByType('ProfileContainerHorizontal').props.user).toEqual(RECIPIENT)
	})

	test('a send_amount param prefills the amount and the button title', async () => {
		const tree = await renderSend({ send_amount: '25' })
		expect(tree.root.findByType('AmountInput').props.amount).toBe('25')
		expect(sendButton(tree).props.title).toBe('Enviar $25')
	})
})

describe('send-button gating', () => {
	test('disabled without a recipient even when the amount is set', async () => {
		const tree = await renderSend()
		await setAmount(tree, '25')
		expect(sendButton(tree).props.disabled).toBe(true)
	})

	test('disabled with a recipient but a zero or empty amount', async () => {
		const tree = await renderSend()
		await selectRecipient(tree)
		expect(sendButton(tree).props.disabled).toBe(true)
		await setAmount(tree, '0')
		expect(sendButton(tree).props.disabled).toBe(true)
	})

	test('removing the selected recipient disables the button again', async () => {
		const tree = await renderSend()
		await selectRecipient(tree)
		await setAmount(tree, '25')
		expect(sendButton(tree).props.disabled).toBe(false)
		const removeButton = tree.root.findAllByType('QPPressable')
			.find(p => p.props.accessibilityLabel === 'Eliminar usuario seleccionado')
		await act(async () => { removeButton.props.onPress() })
		expect(sendButton(tree).props.disabled).toBe(true)
	})
})

describe('handoff to SendConfirm', () => {
	test('navigates with the recipient uuid, amount and description', async () => {
		const tree = await renderSend()
		await selectRecipient(tree)
		await setAmount(tree, '25')
		await act(async () => { tree.root.findByType('QPInput').props.onChangeText('para el café') })
		await act(async () => { sendButton(tree).props.onPress() })
		expect(navigation.navigate).toHaveBeenCalledWith(ROUTES.SEND_CONFIRM, {
			user_uuid: 'u-9',
			send_amount: '25',
			description: 'para el café',
		})
	})

	test('a selected sticker travels as a :sticker: description and shows the sticker card', async () => {
		const tree = await renderSend()
		await selectRecipient(tree)
		await setAmount(tree, '25')
		await act(async () => { tree.root.findByType('StickerPickerModal').props.onSelect('ok.webm') })
		const stickers = tree.root.findAllByType('TransactionSticker').map(s => s.props.name)
		expect(stickers).toContain('ok.webm')
		await act(async () => { sendButton(tree).props.onPress() })
		expect(navigation.navigate).toHaveBeenCalledWith(ROUTES.SEND_CONFIRM, {
			user_uuid: 'u-9',
			send_amount: '25',
			description: ':sticker:ok.webm',
		})
	})
})
