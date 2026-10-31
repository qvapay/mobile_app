import { useEffect, useState } from 'react'
import type { TFunction } from 'i18next'
import { toast } from 'sonner-native'

import { canPinShortcut, pinMiniAppShortcut } from '../../helpers/miniAppShortcuts'
import type { MiniApp } from '../../types/domain'

/**
 * ¿Se ofrece «Añadir a la pantalla de inicio»? Solo en Android y si el
 * launcher lo admite; en iOS siempre false (no hay API para poner iconos).
 */
export const useCanPinShortcut = (): boolean => {
	const [canPin, setCanPin] = useState(false)
	useEffect(() => {
		let alive = true
		canPinShortcut().then(value => { if (alive) setCanPin(value) })
		return () => { alive = false }
	}, [])
	return canPin
}

/**
 * Pide al launcher un acceso directo a la mini-app. La confirmación la enseña
 * el propio launcher; aquí solo se avisa si ni siquiera se pudo pedir.
 */
export const addToHomeScreen = async (app: Pick<MiniApp, 'slug' | 'name' | 'icon'>, t: TFunction): Promise<void> => {
	const result = await pinMiniAppShortcut({ slug: app.slug, name: app.name, icon: app.icon ?? null })
	if (result !== 'requested') toast.error(t('miniapps.actions.toasts.pinFailed'))
}
