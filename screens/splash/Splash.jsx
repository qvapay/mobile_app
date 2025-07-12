import React from 'react'
import { View, Text, StyleSheet, Button, StatusBar } from 'react-native'

import {
    SafeAreaProvider,
    useSafeAreaInsets,
} from 'react-native-safe-area-context';

// Routes
import { ROUTES } from '../routes'

const WAIT_TIME = 2500

// Splash Screen
const SplashScreen = ({ navigation }) => {

    const insets = useSafeAreaInsets();

    return (
        <View
            style={[
                styles.container,
                {
                    backgroundColor: '#6a51ae',
                    paddingTop: insets.top,
                    paddingBottom: insets.bottom,
                    paddingLeft: insets.left,
                    paddingRight: insets.right,
                },
            ]}
        >
            {/* <StatusBar barStyle="dark-content" backgroundColor="red" translucent={false} hidden={false} /> */}
            <Text>Splash Screen</Text>
            <Button title="Go to Welcome" onPress={() => navigation.navigate(ROUTES.WELCOME_SCREEN)} />
        </View>
    )
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        paddingHorizontal: 10,
        justifyContent: 'center',
        backgroundColor: 'blue',
    },
})

export default SplashScreen