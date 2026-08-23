import { View, Text, StyleSheet } from 'react-native'

// Press animation wrapper
import QPPressable from './QPPressable'

// Contexts
import { useTheme } from '../../theme/ThemeContext'

// UI
import { createTextStyles, createContainerStyles } from '../../theme/themeUtils'

// Icons
import FontAwesome6 from '@react-native-vector-icons/fontawesome6'

/**
 * Settings menu row: leading tinted icon tile (iOS Settings style), title,
 * right chevron and optional trailing accessories — a red alert dot, a green
 * verified check or a tinted status pill. Wrapped in QPPressable for press
 * feedback. Rows stack into one visual card — `index`/`totalItems` round only
 * the first row's top and the last row's bottom corners. Pressing navigates
 * to `screen`; `disabled` dims the row to 50% and blocks the press.
 *
 * @param {object} props
 * @param {string} props.title - Row label.
 * @param {string} [props.icon] - FontAwesome6 solid icon for the leading tile.
 * @param {string} [props.color] - Tile tint (hex); icon color + tile background at low alpha.
 * @param {string} props.screen - Route name pushed on press.
 * @param {number} props.index - Position within the group (corner rounding).
 * @param {number} props.totalItems - Group length (corner rounding).
 * @param {boolean} [props.showBadge=false] - Shows the red dot next to the chevron.
 * @param {boolean} [props.verified=false] - Shows a green check (completed verification).
 * @param {string} [props.pill] - Short status text rendered as a tinted pill (e.g. "Activo").
 */
const SettingsItem = ({ title, icon, color, screen, index, totalItems, navigation, disabled, showBadge = false, verified = false, pill }) => {

    // Contexts
    const { theme } = useTheme()

    // Styles
    const textStyles = createTextStyles(theme)
    const containerStyles = createContainerStyles(theme)

    // Determine border radius based on position
    const isFirst = index === 0
    const isLast = index === totalItems - 1

    const containerStyle = {
        justifyContent: 'space-between',
        borderTopLeftRadius: isFirst ? 12 : 0,
        borderTopRightRadius: isFirst ? 12 : 0,
        borderBottomLeftRadius: isLast ? 12 : 0,
        borderBottomRightRadius: isLast ? 12 : 0,
        borderCurve: 'continuous',
        marginBottom: isLast ? 10 : 0,
        opacity: disabled ? 0.5 : 1,
        paddingVertical: 11
    }

    const tint = color || theme.colors.primary

    return (
        <QPPressable disabled={disabled} style={[containerStyles.box, containerStyle]} onPress={() => navigation.navigate(screen)}>

            <View style={styles.leading}>
                {icon && (
                    <View style={[styles.iconTile, { backgroundColor: tint + '1F' }]}>
                        <FontAwesome6 name={icon} size={14} color={tint} iconStyle="solid" />
                    </View>
                )}
                <Text numberOfLines={1} style={[textStyles.h4, { color: theme.colors.primaryText, fontFamily: theme.typography.fontFamily.regular, flexShrink: 1 }]}>{title}</Text>
            </View>

            <View style={styles.trailing}>
                {pill && (
                    <View style={[styles.pill, { backgroundColor: tint + '1F' }]}>
                        <Text style={[textStyles.h7, { color: tint }]}>{pill}</Text>
                    </View>
                )}
                {verified && <FontAwesome6 name="circle-check" size={14} color={theme.colors.successText} iconStyle="solid" />}
                {showBadge && <View style={[styles.dot, { backgroundColor: theme.colors.danger }]} />}
                <FontAwesome6 name="angle-right" size={16} style={{ color: theme.colors.secondaryText }} iconStyle="solid" />
            </View>

        </QPPressable>
    )
}

const styles = StyleSheet.create({
    leading: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        flexShrink: 1,
        paddingRight: 8,
    },
    iconTile: {
        width: 30,
        height: 30,
        borderRadius: 9,
        borderCurve: 'continuous',
        alignItems: 'center',
        justifyContent: 'center',
    },
    trailing: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    pill: {
        borderRadius: 999,
        paddingHorizontal: 8,
        paddingVertical: 2,
    },
    dot: {
        width: 8,
        height: 8,
        borderRadius: 4,
    },
})

export default SettingsItem
