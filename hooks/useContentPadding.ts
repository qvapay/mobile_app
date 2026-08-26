import { useMemo } from 'react'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

/** Estilo estable devuelto por el hook: siempre `paddingBottom`, `paddingTop` solo si se pidió. */
export type ContentPaddingStyle = { paddingBottom: number, paddingTop?: number }

/**
 * Estilo memoizado para el `contentContainerStyle` de una lista o un ScrollView,
 * con el hueco inferior del área segura ya sumado.
 *
 * Escrito a mano, `contentContainerStyle={{ paddingBottom: insets.bottom + 30 }}`
 * crea un objeto nuevo en cada render. El contenedor de contenido recibe
 * entonces un `style` con identidad distinta aunque los valores sean idénticos,
 * lo que obliga a reconciliar y volver a diferenciar el estilo; en FlashList,
 * además, un cambio de `contentContainerStyle` puede provocar un nuevo cálculo
 * de layout de la lista. Memoizando contra `insets.bottom` el objeto solo cambia
 * cuando cambia de verdad (rotación, barra de gestos).
 *
 * De paso centraliza la aritmética: había dieciocho copias del mismo
 * `insets.bottom + N` repartidas por las pantallas.
 *
 * @param extraBottom - Margen inferior propio de la pantalla, que se suma al inset.
 * @param top - `paddingTop` opcional; se omite del estilo si no se pasa.
 * @returns Estilo estable entre renders.
 *
 * @example
 * const contentPadding = useContentPadding(30)
 * return <ScrollView contentContainerStyle={contentPadding}>…</ScrollView>
 */
export default function useContentPadding(extraBottom: number = 0, top?: number): ContentPaddingStyle {

	const insets = useSafeAreaInsets()

	return useMemo(() => {
		const style: ContentPaddingStyle = { paddingBottom: insets.bottom + extraBottom }
		if (top != null) { style.paddingTop = top }
		return style
	}, [insets.bottom, extraBottom, top])
}
