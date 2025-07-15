import React, { useContext, useEffect } from 'react'
import { StyleSheet, Pressable } from 'react-native'

import { createBottomTabNavigator } from '@react-navigation/bottom-tabs'
const Tab = createBottomTabNavigator()

// Bottom Bar
import BottomBar from './BottomBar'

// Routes
import { ROUTES } from '../routes'

// Tab Screens
import Home from './home/Home'
import Invest from './invest/Invest'
import Keypad from './keypad/Keypad'
import P2P from './p2p/P2P'
import Store from './store/Store'

const MainStack = () => {
    return (
        <Tab.Navigator
            initialRouteName="Home"
            backBehavior='initialRoute'
            tabBar={props => <BottomBar {...props} />}
        >
            <Tab.Screen name={ROUTES.HOME_SCREEN} component={Home} />
            <Tab.Screen name={ROUTES.INVEST_SCREEN} component={Invest} />
            <Tab.Screen name={ROUTES.KEYPAD_SCREEN} component={Keypad} />
            <Tab.Screen name={ROUTES.P2P_SCREEN} component={P2P} />
            <Tab.Screen name={ROUTES.STORE_SCREEN} component={Store} />
        </Tab.Navigator>
    )
}

export default MainStack