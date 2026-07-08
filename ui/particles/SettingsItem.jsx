import { View, Text } from 'react-native'

// Press animation wrapper
import QPPressable from './QPPressable'

// Contexts
import { useTheme } from '../../theme/ThemeContext'

// UI
import { createTextStyles, createContainerStyles } from '../../theme/themeUtils'

// Icons
import FontAwesome6 from '@react-native-vector-icons/fontawesome6'

/**
 * Settings menu row: title, right chevron and an optional red alert dot, wrapped
 * in QPPressable for press feedback. Rows stack into one visual card —
 * `index`/`totalItems` round only the first row's top and the last row's bottom
 * corners. Pressing navigates to `screen`; `disabled` dims the row to 50% and
 * blocks the press.
 *
 * @param {object} props
 * @param {string} props.title - Row label.
 * @param {string} props.screen - Route name pushed on press.
 * @param {number} props.index - Position within the group (corner rounding).
 * @param {number} props.totalItems - Group length (corner rounding).
 * @param {boolean} [props.showBadge=false] - Shows the red dot next to the chevron.
 */
const SettingsItem = ({ title, icon, screen, index, totalItems, navigation, disabled, showBadge = false }) => {

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
        borderRadius: isFirst ? 10 : isLast ? 10 : 0,
        borderTopLeftRadius: isFirst ? 10 : 0,
        borderTopRightRadius: isFirst ? 10 : 0,
        borderBottomLeftRadius: isLast ? 10 : 0,
        borderBottomRightRadius: isLast ? 10 : 0,
        marginBottom: isLast ? 10 : 0,
        opacity: disabled ? 0.5 : 1,
        paddingVertical: 12
    }

    return (
        <QPPressable disabled={disabled} style={[containerStyles.box, containerStyle]} onPress={() => navigation.navigate(screen)}>
            <Text style={[textStyles.h4, { color: theme.colors.primaryText, fontFamily: theme.typography.fontFamily.regular }]}>{title}</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                {showBadge && <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: theme.colors.danger }} />}
                <FontAwesome6 name="angle-right" size={16} style={{ color: theme.colors.secondaryText }} iconStyle="solid" />
            </View>
        </QPPressable>
    )
}

export default SettingsItem