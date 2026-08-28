/**
 * Render tests for the Home announcement banner — node environment with
 * reanimated, AsyncStorage and the theme mocked (see keypadAmount.test.js).
 * @jest-environment node
 */
jest.mock('react-native-reanimated', () => {
	const { View } = require('react-native')
	return {
		__esModule: true,
		default: { View },
		useSharedValue: (v) => ({ value: v }),
		useAnimatedStyle: () => ({}),
		withTiming: (v) => v,
		Easing: { out: () => undefined, ease: undefined },
	}
})
jest.mock('@react-native-async-storage/async-storage', () => ({
	getItem: jest.fn(async () => null),
	setItem: jest.fn(async () => undefined),
	removeItem: jest.fn(async () => undefined),
}))
jest.mock('@react-native-vector-icons/fontawesome6', () => 'FontAwesome6')
jest.mock('../theme/ThemeContext', () => {
	const { createTheme } = jest.requireActual('../theme/ThemeContext')
	return { useTheme: () => ({ theme: { ...createTheme(true), mode: 'dark' } }) }
})

import React from 'react'
import { Text, Linking } from 'react-native'
import { act, create } from 'react-test-renderer'
import AsyncStorage from '@react-native-async-storage/async-storage'
import AnnouncementBanner from './AnnouncementBanner'

const ANNOUNCEMENT = {
	id: '7',
	title: 'Mantenimiento programado',
	message: 'El P2P estará en pausa de 3:00 a 4:00.',
	cta_label: 'Ver detalles',
	cta_url: '/p2p',
	dismiss_days: 3,
}

const navigation = { navigate: jest.fn() }

const renderBanner = async (announcement) => {
	let tree
	await act(async () => { tree = create(<AnnouncementBanner announcement={announcement} navigation={navigation} />) })
	return tree
}

const texts = (tree) => tree.root.findAllByType(Text).map(node => node.props.children)

// Pressable es un forwardRef: se busca por la prop, como en PromoBanner.test.js
const pressables = (tree) => tree.root.findAll(node => typeof node.props.onPress === 'function')

beforeEach(() => {
	jest.clearAllMocks()
	AsyncStorage.getItem.mockResolvedValue(null)
	jest.spyOn(Linking, 'openURL').mockResolvedValue()
})
afterEach(() => { jest.restoreAllMocks() })

describe('qué se pinta', () => {

	test('sin aviso no ocupa sitio', async () => {
		const tree = await renderBanner(null)
		expect(tree.toJSON()).toBeNull()
	})

	test('un aviso sin título tampoco se pinta', async () => {
		const tree = await renderBanner({ id: '1', title: '', dismiss_days: 0 })
		expect(tree.toJSON()).toBeNull()
	})

	test('título, mensaje y botón del admin salen verbatim (passthrough, no i18n)', async () => {
		const tree = await renderBanner(ANNOUNCEMENT)
		expect(texts(tree)).toEqual(expect.arrayContaining([
			ANNOUNCEMENT.title, ANNOUNCEMENT.message, ANNOUNCEMENT.cta_label,
		]))
	})

	test('sin cta_label no se pinta botón', async () => {
		const tree = await renderBanner({ ...ANNOUNCEMENT, cta_label: null, cta_url: null })
		expect(texts(tree)).not.toContain('Ver detalles')
	})

	test('un cta_label sin enlace utilizable tampoco pinta botón', async () => {
		const tree = await renderBanner({ ...ANNOUNCEMENT, cta_url: 'javascript:alert(1)' })
		expect(texts(tree)).not.toContain('Ver detalles')
	})
})

describe('el botón', () => {

	test('una ruta interna navega DENTRO de la app', async () => {
		const tree = await renderBanner(ANNOUNCEMENT)
		const cta = pressables(tree)[0]
		await act(async () => { cta.props.onPress() })
		expect(navigation.navigate).toHaveBeenCalledWith('MainStack', { screen: 'P2P' })
		expect(Linking.openURL).not.toHaveBeenCalled()
	})

	test('una URL ajena sale al navegador', async () => {
		const tree = await renderBanner({ ...ANNOUNCEMENT, cta_url: 'https://blog.ejemplo.com/post' })
		const cta = pressables(tree)[0]
		await act(async () => { cta.props.onPress() })
		expect(Linking.openURL).toHaveBeenCalledWith('https://blog.ejemplo.com/post')
		expect(navigation.navigate).not.toHaveBeenCalled()
	})
})

describe('el descarte', () => {

	test('la X oculta el aviso y persiste la marca bajo la clave de ESE aviso', async () => {
		const tree = await renderBanner(ANNOUNCEMENT)
		const dismiss = pressables(tree).at(-1)
		await act(async () => { dismiss.props.onPress() })
		expect(tree.toJSON()).toBeNull()
		expect(AsyncStorage.setItem).toHaveBeenCalledWith('announcement_dismissed_7', expect.any(String))
	})

	test('un aviso ya descartado no llega a pintarse', async () => {
		AsyncStorage.getItem.mockResolvedValue(String(Date.now()))
		const tree = await renderBanner(ANNOUNCEMENT)
		expect(tree.toJSON()).toBeNull()
	})
})
