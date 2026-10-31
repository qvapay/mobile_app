import { useCallback, useSyncExternalStore } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner-native'

import { useAuth } from '../../auth/AuthContext'
import { subscribe, getFavoritesByOwner, toggle as toggleInStore } from './miniappFavoritesStore'
import type { MiniApp } from '../../types/domain'

const NO_FAVORITES: string[] = []

/** Favoritas de la cuenta actual y los mutadores. */
export type MiniAppFavorites = {
	/** Slugs, la más reciente primero. */
	favorites: string[]
	isFavorite: (slug: string) => boolean
	/** Marca/desmarca y avisa con un toast. */
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
	const owner = useAuth().user?.uuid || ''
	const byOwner = useSyncExternalStore(subscribe, getFavoritesByOwner)
	const favorites = (owner && byOwner[owner]) || NO_FAVORITES

	const isFavorite = useCallback((slug: string) => favorites.includes(slug), [favorites])
	const toggle = useCallback((app: Pick<MiniApp, 'slug' | 'name'>) => {
		if (!owner) return
		const added = toggleInStore(owner, app.slug)
		toast.success(added
			? t('miniapps.actions.toasts.favorited', { name: app.name })
			: t('miniapps.actions.toasts.unfavorited', { name: app.name }))
	}, [owner, t])

	return { favorites, isFavorite, toggle }
}
