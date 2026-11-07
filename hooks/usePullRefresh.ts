import { useEffect, useMemo, useRef } from 'react'
import type { ReactElement } from 'react'
import type { RefreshControlProps } from 'react-native'

// UI
import { createHiddenRefreshControl } from '../ui/QPRefreshIndicator'

/**
 * Tirar hacia abajo para releer lo que pinta la pantalla. Es el control invisible de la
 * casa (`createHiddenRefreshControl`: sin hueco arriba, el progreso lo enseña la barra
 * global), y un tirón con otro en vuelo no lanza un segundo.
 *
 * @param refresh - Qué releer. Puede cambiar entre renders; se usa siempre el último.
 * @returns El `refreshControl` para el ScrollView.
 */
export default function usePullRefresh(refresh: () => unknown): ReactElement<RefreshControlProps> {

	const refreshRef = useRef(refresh)
	useEffect(() => { refreshRef.current = refresh })
	const inFlightRef = useRef(false)

	return useMemo(() => createHiddenRefreshControl(false, async () => {
		if (inFlightRef.current) { return }
		inFlightRef.current = true
		try { await refreshRef.current() }
		catch { /* lo que había sigue en pantalla */ }
		finally { inFlightRef.current = false }
	}), []) as ReactElement<RefreshControlProps>
}
