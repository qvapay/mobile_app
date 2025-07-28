import { StyleSheet, Text, View, Pressable, ScrollView } from 'react-native'
import FontAwesome6 from '@react-native-vector-icons/fontawesome6'

// Theme 
import { useTheme } from '../../../theme/ThemeContext'
import { createTextStyles, createContainerStyles } from '../../../theme/themeUtils'

const themeOptions = [
    {
        id: 'auto',
        title: 'Automático',
        icon: 'circle-half-stroke',
        description: 'Ajuste automático según el sistema'
    },
    {
        id: 'light',
        title: 'Claro',
        icon: 'sun',
        description: 'Usar el tema claro en todo momento'
    },
    {
        id: 'dark',
        title: 'Oscuro',
        icon: 'moon',
        description: 'Usar el tema oscuro en todo momento'
    }
]

// Theme Screen
const Theme = () => {

    // Theme variables, dark and light modes with memoized styles
    const { theme, themeMode, setThemeMode } = useTheme()
    const textStyles = createTextStyles(theme)
    const containerStyles = createContainerStyles(theme)

    const handleThemeSelect = (themeId) => {
        setThemeMode(themeId)
    }

    const ThemeOption = ({ option, isSelected, onPress }) => {
        return (
            <Pressable style={[containerStyles.box, styles.themeOption, isSelected && styles.selectedOption]} onPress={onPress} >
                <View style={styles.optionContent}>
                    <View style={styles.iconContainer}>
                        <FontAwesome6 name={option.icon} size={20} color={isSelected ? theme.colors.primary : theme.colors.secondaryText} iconStyle="solid" />
                    </View>
                    <View style={styles.textContainer}>
                        <Text style={[textStyles.h4, { color: theme.colors.primaryText }]}>
                            {option.title}
                        </Text>
                        <Text style={[textStyles.caption, { color: theme.colors.tertiaryText, marginTop: 4 }]}>
                            {option.description}
                        </Text>
                    </View>
                </View>
            </Pressable>
        )
    }

    return (
        <ScrollView style={[containerStyles.subContainer]} showsVerticalScrollIndicator={false}>
            <View style={styles.header}>
                <Text style={textStyles.h1}>Tema</Text>
                <Text style={[textStyles.h3, { color: theme.colors.secondaryText }]}>
                    Personaliza la apariencia de la aplicación
                </Text>
            </View>

            <View style={styles.optionsContainer}>
                {themeOptions.map((option, index) => (
                    <ThemeOption
                        key={option.id}
                        option={option}
                        isSelected={themeMode === option.id}
                        onPress={() => handleThemeSelect(option.id)}
                    />
                ))}
            </View>

            <View style={styles.infoContainer}>
                <View style={styles.infoBox}>
                    <FontAwesome6 name="circle-info" size={16} color={theme.colors.secondaryText} iconStyle="solid" />
                    <Text style={[textStyles.caption, { color: theme.colors.secondaryText, marginLeft: 8 }]}>
                        Los cambios se aplican inmediatamente
                    </Text>
                </View>
            </View>
        </ScrollView>
    )
}

const styles = StyleSheet.create({
    header: {
        marginBottom: 24,
    },
    optionsContainer: {
        gap: 12,
        marginBottom: 24,
    },
    themeOption: {
        padding: 16,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: 'transparent',
    },
    selectedOption: {
        borderColor: '#6759EF',
        backgroundColor: 'rgba(103, 89, 239, 0.05)',
    },
    optionContent: {
        flexDirection: 'row',
        alignItems: 'center',
        flex: 1,
    },
    iconContainer: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: 'rgba(103, 89, 239, 0.1)',
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 16,
    },
    textContainer: {
        flex: 1,
    },
    checkmarkContainer: {
        width: 24,
        height: 24,
        borderRadius: 12,
        backgroundColor: '#6759EF',
        justifyContent: 'center',
        alignItems: 'center',
        marginLeft: 12,
    },
    infoContainer: {
        marginTop: 16,
    },
    infoBox: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 12,
        backgroundColor: 'rgba(103, 89, 239, 0.05)',
        borderRadius: 8,
        borderWidth: 1,
        borderColor: 'rgba(103, 89, 239, 0.1)',
    },
})

export default Theme