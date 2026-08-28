import { useState, useEffect, useCallback } from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'

const MS_PER_DAY = 24 * 60 * 60 * 1000

/**
 * Clave de descarte de un aviso. Cuelga del id A PROPÓSITO — es lo que hace que
 * un aviso NUEVO vuelva a aparecer aunque el anterior se hubiera descartado.
 * Mismo criterio que `bannerStorageKey` en la web (qpweb), con el prefijo de la
 * app.
 *
 * @param id - Id del aviso.
 */
export const dismissKey = (id: string | number) => `announcement_dismissed_${id}`

/**
 * ¿Sigue vigente un descarte? Puro, para poder probarlo sin AsyncStorage.
 *
 * @param dismissedAt - Marca de tiempo del descarte en ms, o null si nunca se descartó.
 * @param dismissDays - Días que dura el descarte; 0 (o menos) = para siempre.
 * @param now - Instante de referencia en ms.
 * @returns `true` si el aviso debe seguir oculto.
 */
export const isDismissalActive = (dismissedAt: number | null, dismissDays: number, now: number = Date.now()): boolean => {
	if (!dismissedAt) return false
	if (dismissDays <= 0) return true
	return now < dismissedAt + dismissDays * MS_PER_DAY
}

/**
 * Estado de descarte del aviso global del Home, persistido en AsyncStorage.
 *
 * Arranca en `visible: false` hasta que el almacenamiento responde (`ready`),
 * igual que `useKycPrompt`: si arrancara en visible, un aviso ya descartado
 * parpadearía en cada arranque — que es justo lo que en la web evita el script
 * anti-flash.
 *
 * Un descarte caducado se limpia al leerlo, para no dejar claves muertas de
 * avisos viejos en el almacenamiento.
 *
 * @param id - Id del aviso vigente, o null/undefined si no hay ninguno.
 * @param dismissDays - `dismiss_days` del aviso (0 = descartar para siempre).
 * @returns `{ visible, dismiss }` — `dismiss` oculta y persiste el descarte.
 */
export default function useAnnouncementDismiss(id?: string | null, dismissDays: number = 0) {

	const [visible, setVisible] = useState(false)

	useEffect(() => {

		let cancelled = false

		// Sin aviso no hay nada que consultar; y al cambiar de aviso se vuelve a
		// ocultar mientras se resuelve el descarte del nuevo
		setVisible(false)
		if (!id) return

		const key = dismissKey(id)

		;(async () => {
			try {
				const stored = await AsyncStorage.getItem(key)
				const dismissedAt = stored ? Number(stored) : null
				if (dismissedAt && !isDismissalActive(dismissedAt, dismissDays)) {
					await AsyncStorage.removeItem(key)
				}
				if (!cancelled) { setVisible(!isDismissalActive(dismissedAt, dismissDays)) }
			} catch {
				// Sin almacenamiento se muestra: un aviso es información, y el coste
				// de repetirlo es menor que el de tragárselo
				if (!cancelled) setVisible(true)
			}
		})()

		return () => { cancelled = true }

	}, [id, dismissDays])

	const dismiss = useCallback(() => {
		setVisible(false)
		if (!id) return
		AsyncStorage.setItem(dismissKey(id), String(Date.now())).catch(() => { /* storage write failed */ })
	}, [id])

	return { visible, dismiss }
}
