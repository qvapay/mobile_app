import { useCallback, useSyncExternalStore } from 'react'
import { useTranslation } from 'react-i18next'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner-native'

import { useAuth } from '../../auth/AuthContext'
import { setMiniAppQuickActions } from '../../helpers/miniAppShortcuts'
import { subscribe, getFavoritesByOwner, isHydrated, toggle as toggleInStore } from './miniappFavoritesStore'
import { quickActionFavorites } from './miniappFavorites'
import { MINIAPPS_LIST_KEY } from './miniappsQueries'
import type { MiniApp } from '../../types/domain'

const NO_FAVORITES: string[] = []

/** Favoritas de la cuenta actual y los mutadores. */
export type MiniAppFavorites = {
	/** Slugs, la más reciente primero. */
	favorites: string[]
	/** Ya se leyeron las guardadas: antes, una lista vacía no significa «sin favoritas». */
	ready: boolean
	isFavorite: (slug: string) => boolean
	/** Marca/desmarca, avisa con un toast y actualiza los accesos rápidos. */
	toggle: (app: Pick<MiniApp, 'slug' | 'name'>) => void
}

/**
 * Mini-apps favoritas de la cuenta con sesión (guardadas en el teléfono, ver
 * `miniappFavoritesStore`). Sin cuenta no hay favoritas y `toggle` no hace nada.
 *
 * @returns Favorites of the signed-in account and the toggle.
 */
export default function useMiniAppFavorites(): MiniAppFavorites {
	const { t } = useTranslation()
	const queryClient = useQueryClient()
	const owner = useAuth().user?.uuid || ''
	const byOwner = useSyncExternalStore(subscribe, getFavoritesByOwner)
	const ready = useSyncExternalStore(subscribe, isHydrated)
	const favorites = (owner && byOwner[owner]) || NO_FAVORITES

	const isFavorite = useCallback((slug: string) => favorites.includes(slug), [favorites])
	const toggle = useCallback((app: Pick<MiniApp, 'slug' | 'name'>) => {
		if (!owner) return
		const added = toggleInStore(owner, app.slug)
		// Los accesos rápidos los publica el Home, pero está congelado (enableFreeze)
		// mientras se marca desde el catálogo o desde la propia mini-app: van aquí
		const directory = queryClient.getQueryData<MiniApp[]>(MINIAPPS_LIST_KEY)
		if (directory && isHydrated()) {
			setMiniAppQuickActions(quickActionFavorites(directory, getFavoritesByOwner()[owner] ?? NO_FAVORITES))
		}
		toast.success(added
			? t('miniapps.actions.toasts.favorited', { name: app.name })
			: t('miniapps.actions.toasts.unfavorited', { name: app.name }))
	}, [owner, t, queryClient])

	return { favorites, ready, isFavorite, toggle }
}
