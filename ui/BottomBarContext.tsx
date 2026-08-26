import { createContext, use } from 'react'
import type { ReactNode } from 'react'
import { useSharedValue } from 'react-native-reanimated'
import type { SharedValue } from 'react-native-reanimated'

/** Valor del contexto: el shared value que anima AnimatedTabBar. */
export type BottomBarContextValue = { bottomBarVisible: SharedValue<number> }

const BottomBarContext = createContext<BottomBarContextValue | undefined>(undefined)

/**
 * Provides `bottomBarVisible`, a Reanimated shared value (1 = shown, 0 = hidden)
 * that AnimatedTabBar animates against. A shared value — not React state — so
 * scroll-driven show/hide runs on the UI thread with zero re-renders.
 * Wrapped around the bottom tabs in MainStack.
 */
export const BottomBarProvider = ({ children }: { children: ReactNode }) => {
	const bottomBarVisible = useSharedValue(1)
	return (
		<BottomBarContext.Provider value={{ bottomBarVisible }}>
			{children}
		</BottomBarContext.Provider>
	)
}

/**
 * Accessor for the bottom-bar shared value; throws outside BottomBarProvider.
 *
 * @returns El shared value del bottom bar.
 */
export const useBottomBar = (): BottomBarContextValue => {
	const context = use(BottomBarContext)
	if (!context) { throw new Error('useBottomBar must be used within a BottomBarProvider') }
	return context
}
