import React from 'react'
import { StyleSheet, View, Pressable } from 'react-native'
import FontAwesome6 from '@react-native-vector-icons/fontawesome6'
import { useTheme } from '../theme/ThemeContext'

// Bottom Bar for Main Stack
export default function BottomBar({ state, descriptors, navigation }) {

    const { theme } = useTheme()

    const navItems = [
        {
            key: 'Home',
            name: 'wallet'
        },
        {
            key: 'Invest',
            name: 'bitcoin-sign'
        },
        {
            key: 'Keypad',
            name: 'dollar-sign'
        },
        {
            key: 'P2P',
            name: 'users'
        },
        {
            key: 'Store',
            name: 'store'
        },
    ]

    return (
        <View style={[styles.bottomNav, { backgroundColor: theme.colors.background }]}>
            {
                state.routes.map((route, index) => {

                    const { options } = descriptors[route.key]
                    const isFocused = state.index === index

                    const onPress = () => {
                        const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true })
                        if (!isFocused && !event.defaultPrevented) { navigation.navigate({ name: route.name, merge: true }) }
                    }

                    const onLongPress = () => {
                        navigation.emit({ type: 'tabLongPress', target: route.key })
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
                                <FontAwesome6
                                    name={navItems[index].name}
                                    iconStyle="solid"
                                    style={[
                                        isFocused ? styles.activeTab : styles.fa,
                                        { color: isFocused ? theme.colors.almostWhite : theme.colors.secondaryText }
                                    ]}
                                />
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
    },
    pressableArea: {
        flex: 1,
        alignItems: 'center',
    },
    fa: {
        fontSize: 20,
    },
    activeTab: {
        fontSize: 24,
    },
})