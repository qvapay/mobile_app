import React from 'react'

// Safe Area
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context'

// Bottom Tab Navigator
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs'
const Tab = createBottomTabNavigator()

// Bottom Bar
import BottomBar from '../ui/BottomBar'

// Routes
import { ROUTES } from '../routes'

// Tab Screens
import Home from './home/Home'
import Invest from './invest/Invest'
import Keypad from './keypad/Keypad'
import P2P from './p2p/P2P'
import Store from './store/Store'

// Theme
import { useTheme } from '../theme/ThemeContext'

// Main Stack
const MainStack = () => {

    const { theme } = useTheme()
    const insets = useSafeAreaInsets()

    return (
        <SafeAreaProvider style={{ paddingBottom: insets.bottom, backgroundColor: theme.colors.background }}>
            <Tab.Navigator
                initialRouteName="Home"
                backBehavior='initialRoute'
                tabBar={props => <BottomBar {...props} />}
                screenOptions={{
                    headerShown: true,
                    headerBackVisible: true,
                    headerBackTitleVisible: false,
                    headerBackButtonMenuEnabled: false,
                    headerShadowVisible: false,
                    headerStyle: {
                        backgroundColor: theme.colors.background,
                    },
                    headerTintColor: theme.colors.primaryText,
                    headerTitleStyle: {
                        fontSize: 24,
                        fontFamily: theme.typography.fontFamily.bold,
                    },
                }}
            >
                <Tab.Screen name={ROUTES.HOME_SCREEN} component={Home} />
                <Tab.Screen name={ROUTES.INVEST_SCREEN} component={Invest} />
                <Tab.Screen name={ROUTES.KEYPAD_SCREEN} component={Keypad} />
                <Tab.Screen name={ROUTES.P2P_SCREEN} component={P2P} />
                <Tab.Screen name={ROUTES.STORE_SCREEN} component={Store} />
            </Tab.Navigator>
        </SafeAreaProvider>
    )
}

export default MainStack