import React from 'react'
import { StyleSheet, View, Pressable } from 'react-native'
import FontAwesome5 from 'react-native-vector-icons/FontAwesome5'

// Bottom Bar for Main Stack
export default function BottomBar({ state, descriptors, navigation }) {

    const navItems = [
        {
            key: 'Home',
            name: 'wallet'
        },
        {
            key: 'Invest',
            name: 'wallet'
        },
        {
            key: 'Keypad',
            name: 'dollar-sign'
        },
        {
            key: 'P2P',
            name: 'wallet'
        },
        {
            key: 'Store',
            name: 'store'
        },
    ]

    return (
        <View style={styles.bottomNav}>
            {
                state.routes.map((route, index) => {

                    const { options } = descriptors[route.key]
                    const isFocused = state.index === index

                    const onPress = () => {
                        const event = navigation.emit({
                            type: 'tabPress',
                            target: route.key,
                            canPreventDefault: true,
                        })
                        if (!isFocused && !event.defaultPrevented) {
                            navigation.navigate({ name: route.name, merge: true })
                        }
                    }

                    const onLongPress = () => {
                        navigation.emit({
                            type: 'tabLongPress',
                            target: route.key,
                        })
                    }

                    return (
                        <Pressable
                            key={route.key}
                            accessibilityRole="button"
                            style={styles.pressableArea}
                            accessibilityState={isFocused ? { selected: true } : {}}
                            accessibilityLabel={options.tabBarAccessibilityLabel}
                            onPress={onPress}
                            onLongPress={onLongPress}
                        >
                            <View style={{ flex: 1 }}>
                                <FontAwesome5 name={navItems[index].name} style={isFocused ? styles.activeTab : styles.fa} />
                            </View>
                        </Pressable>
                    )
                })
            }
        </View>
    )
}

const styles = StyleSheet.create({
    bottomNav: {
        height: 50,
        paddingVertical: 10,
        flexDirection: 'row',
        justifyContent: 'space-between',
        // backgroundColor: theme.darkColors.background,
    },
    pressableArea: {
        flex: 1,
        alignItems: 'center',
    },
    fa: {
        fontSize: 20,
        color: '#505268',
    },
    activeTab: {
        fontSize: 24,
        color: 'white',
    },
})