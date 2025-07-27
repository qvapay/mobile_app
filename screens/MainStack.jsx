import React from 'react'
import { StyleSheet, Pressable, View, Text } from 'react-native'

// Safe Area
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context'

// Bottom Tab Navigator
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs'
const Tab = createBottomTabNavigator()

// Bottom Bar
import BottomBar from '../ui/BottomBar'

// Routes
import { ROUTES, navItems } from '../routes'

// Tab Screens
import Home from './home/Home'
import Invest from './invest/Invest'
import Keypad from './keypad/Keypad'
import P2P from './p2p/P2P'
import Store from './store/Store'

// Theme
import { useTheme } from '../theme/ThemeContext'
import { createContainerStyles, createTextStyles } from '../theme/themeUtils'

// Auth
import { useAuth } from '../auth/AuthContext'

// UI Components
import QPAvatar from '../ui/particles/QPAvatar'

// Icons
import FontAwesome6 from '@react-native-vector-icons/fontawesome6'

// Main Stack
const MainStack = ({ navigation }) => {

    // Contexts
    const { user } = useAuth()
    const { theme } = useTheme()
    const containerStyles = createContainerStyles(theme)
    const textStyles = createTextStyles(theme)
    const insets = useSafeAreaInsets()

    return (
        <SafeAreaProvider style={{ paddingBottom: insets.bottom, backgroundColor: theme.colors.background }}>
            <Tab.Navigator
                initialRouteName={ROUTES.HOME_SCREEN}
                backBehavior='initialRoute'
                tabBar={props => <BottomBar {...props} navItems={navItems} />}
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
                        <Pressable style={styles.headerRight} onPress={() => navigation.navigate(ROUTES.SETTINGS_STACK)}>
                            <QPAvatar user={user} size={32} />
                        </Pressable>
                    )
                })}
            >

                <Tab.Screen
                    name={ROUTES.HOME_SCREEN}
                    component={Home}
                    options={{
                        headerTitle: '',
                        headerLeft: () => (
                            <Pressable style={styles.headerLeft} onPress={() => navigation.navigate(ROUTES.SETTINGS_STACK)}>
                                <QPAvatar user={user} size={48} />
                                <View style={styles.headerLeftTextContainer}>
                                    <Text style={textStyles.h4}>Hola {user.name}!</Text>
                                    <Text style={[textStyles.h5, { color: theme.colors.secondaryText, marginTop: -5 }]}>@{user.username}</Text>
                                </View>
                            </Pressable>
                        ),
                        headerRight: () => (
                            // TODO: Add notifications Screen and modify this to navigate to it
                            <Pressable style={styles.headerRight} onPress={() => navigation.navigate(ROUTES.MAIN_STACK, { screen: ROUTES.KEYPAD_SCREEN })}>
                                <FontAwesome6 name="bell" size={24} color={theme.colors.primaryText} iconStyle="solid" />
                            </Pressable>
                        )
                    }}
                />

                <Tab.Screen name={ROUTES.INVEST_SCREEN} component={Invest} />

                <Tab.Screen
                    name={ROUTES.KEYPAD_SCREEN}
                    component={Keypad}
                    options={({ navigation }) => ({
                        headerTitle: '',
                        headerLeft: () => (
                            <Pressable style={styles.headerLeft} onPress={() => navigation.goBack()}>
                                <FontAwesome6 name="qrcode" size={24} color={theme.colors.primaryText} iconStyle="solid" />
                            </Pressable>
                        )
                    })}
                />

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
    headerLeft: {
        marginLeft: 20,
        alignItems: 'center',
        flexDirection: 'row',
        justifyContent: 'space-between',
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
    headerLeftTextContainer: {
        marginLeft: 10,
    },
    headerLeftText: {
        color: 'white',
        fontSize: 24,
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