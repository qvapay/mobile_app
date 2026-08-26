import { StyleSheet, View, Text } from 'react-native'

// Press animation wrapper
import QPPressable from './particles/QPPressable'

// Icons
import FontAwesome6 from '@react-native-vector-icons/fontawesome6'

// Theme
import { useTheme } from '../theme/ThemeContext'

// Nav Items from routes.js
import { navItems } from '../routes'

// Tipos (código muerto — ver CLAUDE.md; conversión mínima)
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs'

// Navigation labels in Spanish
const navLabels: Record<string, string> = {
    'Home': 'Inicio',
    'Invest': 'Invertir',
    'Keypad': 'Enviar',
    'P2P': 'P2P',
    'Store': 'Tienda'
}

// Settings Context
import { useSettings } from '../settings/SettingsContext'

/**
 * Fully custom bottom tab bar for the Main Stack (drop-in for React
 * Navigation's `tabBar` prop). Renders one QPPressable per route with a
 * FontAwesome icon from `navItems` and an optional Spanish label, gated by the
 * `appearance.bottomBarLabels` setting. The focused tab gets a larger icon and
 * primary text color; presses emit `tabPress` so screens can intercept them.
 *
 * @param props - React Navigation tab bar props (`state`, `descriptors`, `navigation`).
 */
export default function BottomBar({ state, descriptors, navigation }: BottomTabBarProps) {

    // Theme Contexts
    const { theme } = useTheme()

    // Settings Context
    const { settings } = useSettings()
    const showLabels = settings.appearance.bottomBarLabels

    return (
        <View style={[styles.bottomNav, { backgroundColor: theme.colors.background }]}>

            {state.routes.map((route, index) => {

                const { options } = descriptors[route.key]
                const isFocused = state.index === index

                const onPress = () => {
                    const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true })
                    // Cast local: la sobrecarga de objeto de navigate exige la clave `params`
                    // presente (aunque admite undefined); omitirla es idéntico en runtime
                    if (!isFocused && !event.defaultPrevented) { navigation.navigate({ name: route.name, merge: true } as unknown as { name: string, params: object | undefined, merge?: boolean }) }
                }

                return (
                    <QPPressable
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
                                <Text style={[styles.tabLabel, { color: isFocused ? theme.colors.primaryText : theme.colors.secondaryText, fontSize: theme.typography.fontSize.xs }]}>
                                    {navLabels[route.name] || route.name}
                                </Text>
                            )}
                        </View>
                    </QPPressable>
                )
            })}
        </View>
    )
}

const styles = StyleSheet.create({
    bottomNav: {
        minHeight: 50,
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
        marginTop: 2,
        textAlign: 'center',
        fontWeight: '500',
    }
})