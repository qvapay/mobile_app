import { StyleSheet, View, Pressable, Text } from 'react-native'

// Icons
import FontAwesome6 from '@react-native-vector-icons/fontawesome6'

// Theme
import { useTheme } from '../theme/ThemeContext'

// Nav Items from routes.js
import { navItems } from '../routes'

// Navigation labels in Spanish
const navLabels = {
    'Home': 'Inicio',
    'Invest': 'Invertir',
    'Keypad': 'Enviar',
    'P2P': 'P2P',
    'Store': 'Tienda'
}

// Settings Context
import { useSettings } from '../settings/SettingsContext'

// Bottom Bar for Main Stack
export default function BottomBar({ state, descriptors, navigation }) {

    // Theme Contexts
    const { theme } = useTheme()

    // Settings Context
    const { settings, getSetting, isSettingEnabled } = useSettings()
    const showLabels = settings.appearance.bottomBarLabels

    return (
        <View style={[styles.bottomNav, { backgroundColor: theme.colors.background }]}>

            {state.routes.map((route, index) => {

                const { options } = descriptors[route.key]
                const isFocused = state.index === index

                const onPress = () => {
                    const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true })
                    if (!isFocused && !event.defaultPrevented) { navigation.navigate({ name: route.name, merge: true }) }
                }

                return (
                    <Pressable
                        key={route.key}
                        onPress={onPress}
                        style={styles.pressableArea}
                        accessibilityRole="button"
                        accessibilityState={isFocused ? { selected: true } : {}}
                        accessibilityLabel={options.tabBarAccessibilityLabel}
                    >
                        <View style={styles.tabContent}>
                            <FontAwesome6 name={navItems[index].name} iconStyle="solid" style={[isFocused ? styles.activeTab : styles.fa, { color: isFocused ? theme.colors.primaryText : theme.colors.secondaryText }]} />
                            {showLabels && (
                                <Text style={[styles.tabLabel, { color: isFocused ? theme.colors.primaryText : theme.colors.secondaryText }]}>
                                    {navLabels[route.name] || route.name}
                                </Text>
                            )}
                        </View>
                    </Pressable>
                )
            })}
        </View>
    )
}

const styles = StyleSheet.create({
    bottomNav: {
        minHeight: 50,
        paddingTop: 10,
        flexDirection: 'row',
        justifyContent: 'space-between',
    },
    pressableArea: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center'
    },
    tabContent: {
        alignItems: 'center',
        justifyContent: 'center',
    },
    fa: {
        fontSize: 20,
    },
    activeTab: {
        fontSize: 24,
    },
    tabLabel: {
        fontSize: 10,
        marginTop: 2,
        textAlign: 'center',
        fontWeight: '500',
    }
})