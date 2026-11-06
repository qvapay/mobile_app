import { useEffect } from 'react'
import type { RefObject } from 'react'
import { useNavigation, useScrollToTop } from '@react-navigation/native'
import type { ParamListBase } from '@react-navigation/native'
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs'

/** Lo que la barra nativa manda en `tabPress`; los tipos de la barra JS no lo declaran. */
type NativeTabPressData = { origin?: string, behavior?: { scrollToTop?: boolean } }

/** Un ScrollView, o una FlashList, que expone su propio `scrollToTop`. */
type TabScrollable =
	| { scrollToTop: (params?: { animated?: boolean }) => void }
	| { scrollTo: (options: { y: number, animated: boolean }) => void }

/**
 * Tocar la pestaña que ya está activa devuelve su contenido arriba. Si se llega
 * desde otra pestaña no se mueve: conserva el scroll donde se dejó.
 *
 * `useScrollToTop` cubre la barra emulada (`ui/GlassTabBar`: Android e iOS < 26),
 * pero se aparta ante la barra nativa (iOS 26+) y deja el trabajo a su efecto
 * nativo. Ese efecto busca solo por el primer hijo de cada vista: en P2P llegaría
 * al `ScrollView` de chips de la barra de filtros y nunca a las ofertas, y un
 * banner nuevo encima de cualquier lista lo rompería sin avisar. Por eso el toque
 * repetido de la barra nativa se atiende también aquí; si el efecto nativo acierta,
 * los dos van al mismo sitio.
 *
 * @param ref - Ref del ScrollView o la FlashList principal de la pestaña.
 *
 * @example
 * const scrollRef = useRef<ScrollViewInstance>(null)
 * useTabScrollToTop(scrollRef)
 */
export default function useTabScrollToTop(ref: RefObject<TabScrollable | null>): void {
	const navigation = useNavigation<BottomTabNavigationProp<ParamListBase>>()

	useScrollToTop(ref)

	useEffect(() => navigation.addListener('tabPress', (event) => {
		const { origin, behavior } = (event.data ?? {}) as NativeTabPressData
		if (origin !== 'native' || !behavior?.scrollToTop) { return }

		const scrollable = ref.current
		if (!scrollable) { return }
		if ('scrollToTop' in scrollable) { scrollable.scrollToTop({ animated: true }) }
		else { scrollable.scrollTo({ y: 0, animated: true }) }
	}), [navigation, ref])
}
