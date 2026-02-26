import { createContext, useContext } from 'react'
import { useSharedValue } from 'react-native-reanimated'

const BottomBarContext = createContext()

export const BottomBarProvider = ({ children }) => {
	const bottomBarVisible = useSharedValue(1)
	return (
		<BottomBarContext.Provider value={{ bottomBarVisible }}>
			{children}
		</BottomBarContext.Provider>
	)
}

export const useBottomBar = () => {
	const context = useContext(BottomBarContext)
	if (!context) { throw new Error('useBottomBar must be used within a BottomBarProvider') }
	return context
}
