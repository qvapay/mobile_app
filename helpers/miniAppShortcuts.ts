import { NativeModules, Platform, TurboModuleRegistry, type TurboModule } from 'react-native'

import { buildMiniAppUrl } from '../screens/miniapps/miniappLinks'
import { renderMiniAppIconPng } from './miniAppIconBitmap'
import type { QuickActionItem } from '../screens/miniapps/miniappFavorites'

/** Un acceso directo tal como lo recibe el nativo. */
type NativeShortcut = {
	/** `miniapp:<slug>`: el mismo id para el acceso anclado y el rápido. */
	id: string
	label: string
	/** URL pública de la mini-app: entra por el deep link `/apps/:slug`. */
	url: string
	/** PNG en base64 (solo Android); null = icono de QvaPay. */
	icon: string | null
}

interface MiniAppShortcutsModule extends TurboModule {
	/** Solo Android: el launcher admite anclar accesos directos. */
	isPinSupported?(): Promise<boolean>
	/** Solo Android: pide al launcher anclar el acceso (él enseña la confirmación). */
	requestPin?(shortcut: NativeShortcut): Promise<boolean>
	/** Accesos rápidos del icono de la app (mantener pulsado). */
	setQuickActions(shortcuts: NativeShortcut[]): Promise<boolean>
	clearQuickActions(): Promise<boolean>
}

/**
 * Módulo nativo propio `MiniAppShortcuts` (ios/QvaPay/MiniAppShortcuts.swift y
 * android/.../bridge/MiniAppShortcutsModule.kt). Se resuelve en call time, sin
 * spread: en la nueva arquitectura los métodos de un TurboModule viven en el
 * prototipo y un `{ ...module }` los pierde (ver useSecureScreen).
 */
const getNativeModule = (): MiniAppShortcutsModule | null =>
	TurboModuleRegistry.get<MiniAppShortcutsModule>('MiniAppShortcuts')
	?? NativeModules.MiniAppShortcuts
	?? null

// Iconos ya pintados, por URL: los accesos rápidos se republican a menudo.
// Solo se guardan los éxitos (un fallo de red se reintenta la próxima vez)
const iconCache = new Map<string, string>()

const iconFor = async (icon: string | null): Promise<string | null> => {
	if (!icon) return null
	const cached = iconCache.get(icon)
	if (cached) return cached
	const png = await renderMiniAppIconPng(icon)
	if (png) iconCache.set(icon, png)
	return png
}

// iOS solo admite símbolos del sistema en los accesos rápidos: no se pinta nada
const toNative = async (item: QuickActionItem): Promise<NativeShortcut> => ({
	id: `miniapp:${item.slug}`,
	label: item.name,
	url: buildMiniAppUrl(item.slug),
	icon: Platform.OS === 'android' ? await iconFor(item.icon) : null,
})

/**
 * ¿Se puede anclar una mini-app a la pantalla de inicio? Solo Android: iOS no
 * deja que una app ponga iconos ahí.
 */
export const canPinShortcut = async (): Promise<boolean> => {
	if (Platform.OS !== 'android') return false
	const native = getNativeModule()
	if (!native?.isPinSupported) return false
	try { return await native.isPinSupported() } catch { return false }
}

export type PinShortcutResult = 'requested' | 'unsupported' | 'failed'

/**
 * Pide al launcher un acceso directo a la mini-app. El launcher enseña su
 * propia confirmación; `requested` no garantiza que el usuario la aceptara.
 */
export const pinMiniAppShortcut = async (app: QuickActionItem): Promise<PinShortcutResult> => {
	const native = getNativeModule()
	if (Platform.OS !== 'android' || !native?.requestPin) return 'unsupported'
	try {
		return (await native.requestPin(await toNative(app))) ? 'requested' : 'unsupported'
	} catch {
		return 'failed'
	}
}

let lastItems: QuickActionItem[] = []
let publishedSignature: string | null = null
let generation = 0

/**
 * Publica las favoritas como accesos rápidos del icono de QvaPay. Llamarla en
 * cada render es barato: si la lista no cambió no toca el nativo.
 */
export const setMiniAppQuickActions = async (items: QuickActionItem[]): Promise<void> => {
	const signature = JSON.stringify(items.map(item => [item.slug, item.name, item.icon]))
	if (signature === publishedSignature) return
	publishedSignature = signature
	lastItems = items
	const current = ++generation
	const native = getNativeModule()
	if (!native) return
	try {
		const shortcuts = await Promise.all(items.map(toNative))
		// Llegó una lista más nueva mientras se pintaban los iconos: gana esa
		if (current !== generation) return
		const published = await (shortcuts.length > 0 ? native.setQuickActions(shortcuts) : native.clearQuickActions())
		// false = Android lo limitó (llamadas en segundo plano): la próxima vez se reintenta
		if (published === false && current === generation) publishedSignature = null
	} catch {
		// Que el siguiente render lo reintente
		if (current === generation) publishedSignature = null
	}
}

/** Quita los accesos rápidos (logout: no enseñar las favoritas de otra cuenta). */
export const clearMiniAppQuickActions = (): Promise<void> => setMiniAppQuickActions([])

/**
 * Vuelve a publicar los últimos accesos rápidos. En Android cuelgan del alias
 * LAUNCHER activo y se pierden al cambiar el icono de la app.
 */
export const refreshMiniAppQuickActions = (): Promise<void> => {
	publishedSignature = null
	return setMiniAppQuickActions(lastItems)
}
