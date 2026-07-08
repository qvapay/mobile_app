/**
 * Unit tests for the P2P chat state hook (history load, SSE append dedup,
 * send flows, image validation, sticker helpers), rendered with
 * react-test-renderer — node environment with react-native, the image picker,
 * p2pApi and sonner-native mocked (see useSettingsState.test.js for the
 * harness pattern).
 * @jest-environment node
 */
jest.mock('react-native', () => ({
	Animated: {
		Value: class MockAnimatedValue {
			constructor(value) { this.value = value }
		},
		timing: jest.fn(() => ({ start: jest.fn() })),
	},
}))

jest.mock('react-native-image-picker', () => ({
	launchImageLibrary: jest.fn(),
}))

jest.mock('../../api/p2pApi', () => ({
	p2pApi: {
		getChat: jest.fn(),
		sendChat: jest.fn(),
	},
}))

jest.mock('sonner-native', () => ({
	toast: {
		error: jest.fn(),
		success: jest.fn(),
	},
}))

import React from 'react'
import { act, create } from 'react-test-renderer'
import { launchImageLibrary } from 'react-native-image-picker'
import { toast } from 'sonner-native'
import { p2pApi } from '../../api/p2pApi'
import useP2PChat, { isSticker, getStickerName } from './useP2PChat'

// Minimal hook harness: renders the hook inside a throwaway component and
// exposes its latest return value through `result.current`.
const renderHook = async (initialProps = { p2p_uuid: 'offer-1' }) => {
	const result = { current: null }
	const Harness = (props) => {
		result.current = useP2PChat(props)
		return null
	}
	let root
	await act(async () => { root = create(React.createElement(Harness, initialProps)) })
	return { result, root }
}

const message = (id, createdAt, body = `msg-${id}`) => ({ id, created_at: createdAt, message: body })

beforeEach(() => {
	jest.clearAllMocks()
	p2pApi.getChat.mockResolvedValue({ success: true, data: { chat: [] } })
	p2pApi.sendChat.mockResolvedValue({ success: true })
})

describe('sticker helpers', () => {
	test('isSticker recognizes sticker bodies only', () => {
		expect(isSticker(':sticker:qva_rocket.webm')).toBe(true)
		expect(isSticker(':sticker:qva_rocket.gif')).toBe(true)
		expect(isSticker('hola :sticker:')).toBe(false)
		expect(isSticker(null)).toBe(false)
		expect(isSticker(42)).toBe(false)
	})

	test('getStickerName strips the prefix and either extension', () => {
		expect(getStickerName(':sticker:qva_rocket.webm')).toBe('qva_rocket')
		expect(getStickerName(':sticker:qva_rocket.gif')).toBe('qva_rocket')
	})
})

describe('history load', () => {
	test('loads the chat on mount and sorts it oldest → newest', async () => {
		p2pApi.getChat.mockResolvedValue({
			success: true,
			data: { chat: [
				message(3, '2026-07-07T10:02:00Z'),
				message(1, '2026-07-07T10:00:00Z'),
				message(2, '2026-07-07T10:01:00Z'),
			] },
		})
		const { result } = await renderHook()
		expect(p2pApi.getChat).toHaveBeenCalledWith('offer-1')
		expect(result.current.messages.map((m) => m.id)).toEqual([1, 2, 3])
		expect(result.current.chatLoading).toBe(false)
	})

	test('accepts a bare array payload and falls back to numeric ids when created_at is missing', async () => {
		p2pApi.getChat.mockResolvedValue({
			success: true,
			data: [{ id: '10', message: 'b' }, { id: '2', message: 'a' }],
		})
		const { result } = await renderHook()
		expect(result.current.messages.map((m) => m.id)).toEqual(['2', '10'])
	})

	test('a failed load surfaces the error and a toast without crashing', async () => {
		p2pApi.getChat.mockRejectedValue(new Error('network down'))
		const { result } = await renderHook()
		expect(result.current.chatError).toBe('network down')
		expect(result.current.chatLoading).toBe(false)
		expect(toast.error).toHaveBeenCalledWith('Error', { description: 'network down' })
	})
})

describe('appendMessage (SSE push)', () => {
	test('appends a pushed message keeping ascending order', async () => {
		p2pApi.getChat.mockResolvedValue({
			success: true,
			data: { chat: [message(1, '2026-07-07T10:00:00Z'), message(3, '2026-07-07T10:02:00Z')] },
		})
		const { result } = await renderHook()
		await act(async () => { result.current.appendMessage(message(2, '2026-07-07T10:01:00Z')) })
		expect(result.current.messages.map((m) => m.id)).toEqual([1, 2, 3])
	})

	test('dedups by id across string/number types (the stream echoes the sender\'s own message)', async () => {
		p2pApi.getChat.mockResolvedValue({
			success: true,
			data: { chat: [message('2', '2026-07-07T10:00:00Z')] },
		})
		const { result } = await renderHook()
		await act(async () => { result.current.appendMessage(message(2, '2026-07-07T10:00:00Z')) })
		expect(result.current.messages).toHaveLength(1)
	})

	test('ignores messages without an id', async () => {
		const { result } = await renderHook()
		await act(async () => { result.current.appendMessage({ message: 'anonymous' }) })
		await act(async () => { result.current.appendMessage(null) })
		expect(result.current.messages).toHaveLength(0)
	})
})

describe('handleSendChat', () => {
	test('trims the composer and skips empty messages', async () => {
		const { result } = await renderHook()
		await act(async () => { result.current.setChatText('   ') })
		await act(async () => { await result.current.handleSendChat() })
		expect(p2pApi.sendChat).not.toHaveBeenCalled()
	})

	test('posts the trimmed text, clears the composer and refetches the history', async () => {
		const { result } = await renderHook()
		await act(async () => { result.current.setChatText('  hola  ') })
		p2pApi.getChat.mockClear()
		await act(async () => { await result.current.handleSendChat() })
		expect(p2pApi.sendChat).toHaveBeenCalledWith('offer-1', { message: 'hola' })
		expect(result.current.chatText).toBe('')
		expect(p2pApi.getChat).toHaveBeenCalledTimes(1) // post-send refetch
	})

	test('a rejected send keeps the composer and shows a toast', async () => {
		p2pApi.sendChat.mockResolvedValue({ success: false, error: 'bloqueado' })
		const { result } = await renderHook()
		await act(async () => { result.current.setChatText('hola') })
		await act(async () => { await result.current.handleSendChat() })
		expect(result.current.chatText).toBe('hola')
		expect(toast.error).toHaveBeenCalledWith('No se pudo enviar', { description: 'bloqueado' })
	})
})

describe('handleSendSticker', () => {
	test('posts the gif variant of the sticker and closes the panel', async () => {
		const { result } = await renderHook()
		await act(async () => { result.current.setShowStickerPanel(true) })
		await act(async () => { await result.current.handleSendSticker('qva_rocket') })
		expect(p2pApi.sendChat).toHaveBeenCalledWith('offer-1', { message: ':sticker:qva_rocket.gif' })
		expect(result.current.showStickerPanel).toBe(false)
	})
})

describe('handlePickImage', () => {
	const pickWith = (response) => {
		launchImageLibrary.mockImplementation((options, callback) => callback(response))
	}

	test('rejects files over 5MB with a toast', async () => {
		pickWith({ assets: [{ uri: 'file://big.jpg', type: 'image/jpeg', fileSize: 6 * 1024 * 1024 }] })
		const { result } = await renderHook()
		await act(async () => { result.current.handlePickImage() })
		expect(toast.error).toHaveBeenCalledWith('Imagen muy grande', { description: 'El máximo es 5MB' })
		expect(result.current.selectedImage).toBeNull()
	})

	test('rejects unsupported formats with a toast', async () => {
		pickWith({ assets: [{ uri: 'file://x.webp', type: 'image/webp', fileSize: 1024 }] })
		const { result } = await renderHook()
		await act(async () => { result.current.handlePickImage() })
		expect(toast.error).toHaveBeenCalledWith('Formato no soportado', { description: 'Solo JPG, PNG y GIF' })
		expect(result.current.selectedImage).toBeNull()
	})

	test('accepts a valid asset and stores it as the pending attachment', async () => {
		const asset = { uri: 'file://ok.png', type: 'image/png', fileSize: 1024 }
		pickWith({ assets: [asset] })
		const { result } = await renderHook()
		await act(async () => { result.current.handlePickImage() })
		expect(result.current.selectedImage).toEqual(asset)
		expect(toast.error).not.toHaveBeenCalled()
	})

	test('does nothing when the picker is cancelled', async () => {
		pickWith({ didCancel: true })
		const { result } = await renderHook()
		await act(async () => { result.current.handlePickImage() })
		expect(result.current.selectedImage).toBeNull()
	})
})

describe('handleSendImage', () => {
	test('posts the attachment with the caption and clears the composer state', async () => {
		const { result } = await renderHook()
		await act(async () => {
			result.current.setSelectedImage({ uri: 'file://ok.jpg', type: 'image/jpeg', fileName: 'ok.jpg' })
			result.current.setChatText('mira esto')
		})
		await act(async () => { await result.current.handleSendImage() })
		expect(p2pApi.sendChat).toHaveBeenCalledWith('offer-1', {
			message: 'mira esto',
			image: { uri: 'file://ok.jpg', type: 'image/jpeg', fileName: 'ok.jpg' },
		})
		expect(result.current.selectedImage).toBeNull()
		expect(result.current.chatText).toBe('')
		expect(result.current.sendingImage).toBe(false)
	})

	test('does nothing without a selected image', async () => {
		const { result } = await renderHook()
		await act(async () => { await result.current.handleSendImage() })
		expect(p2pApi.sendChat).not.toHaveBeenCalled()
	})
})

describe('toggleTimestamp', () => {
	test('flips a message\'s timestamp visibility on and off', async () => {
		const { result } = await renderHook()
		await act(async () => { result.current.toggleTimestamp(7) })
		expect(result.current.visibleTimestamps.has(7)).toBe(true)
		await act(async () => { result.current.toggleTimestamp(7) })
		expect(result.current.visibleTimestamps.has(7)).toBe(false)
	})
})
