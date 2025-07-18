import React from 'react'
import { StyleSheet, Pressable } from 'react-native'

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

// Auth
import { useAuth } from '../auth/authContext'

// UI Components
import QPAvatar from '../ui/particles/QPAvatar'

// Main Stack
const MainStack = () => {

    // Contexts
    const { user } = useAuth()
    const { theme } = useTheme()
    const insets = useSafeAreaInsets()

    return (
        <SafeAreaProvider style={{ paddingBottom: insets.bottom, backgroundColor: theme.colors.background }}>
            <Tab.Navigator
                initialRouteName="Home"
                backBehavior='initialRoute'
                tabBar={props => <BottomBar {...props} />}
                screenOptions={({ navigation }) => ({
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
                    headerRight: () => (
                        <Pressable
                            style={styles.headerRight}
                            onPress={() => navigation.navigate(ROUTES.SETTINGS_MENU)}>
                            <QPAvatar
                                size={32}
                                vip={user.vip}
                                source_uri={user.image}
                            />
                        </Pressable>
                    )
                })}
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

const styles = StyleSheet.create({
    qrIconStyle: {
        color: 'white',
        fontSize: 28,
        marginLeft: 20,
    },
    headerRight: {
        marginRight: 20,
        alignItems: 'center',
        flexDirection: 'row',
        justifyContent: 'space-between',
    },
    headerWelcome: {
        marginRight: 10,
        alignItems: 'flex-end',
    },
    headerRightText: {
        color: 'white',
        fontSize: 14,
        fontWeight: 'bold',
        fontFamily: 'Rubik-Regular'
    },
    handleText: {
        color: 'white',
        fontSize: 13,
        fontFamily: 'Rubik-Bold'
    },
})

export default MainStack