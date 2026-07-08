import { createContext, use } from 'react'
import { useSharedValue } from 'react-native-reanimated'

const BottomBarContext = createContext()

/**
 * Provides `bottomBarVisible`, a Reanimated shared value (1 = shown, 0 = hidden)
 * that AnimatedTabBar animates against. A shared value — not React state — so
 * scroll-driven show/hide runs on the UI thread with zero re-renders.
 * Wrapped around the bottom tabs in MainStack.
 */
export const BottomBarProvider = ({ children }) => {
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
 * @returns {{ bottomBarVisible: import('react-native-reanimated').SharedValue<number> }}
 */
export const useBottomBar = () => {
	const context = use(BottomBarContext)
	if (!context) { throw new Error('useBottomBar must be used within a BottomBarProvider') }
	return context
}
