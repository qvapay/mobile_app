import { StyleSheet, Text, View } from 'react-native'

// Theme
import { useTheme } from '../../../theme/ThemeContext'
import { createTextStyles, createContainerStyles } from '../../../theme/themeUtils'

// Datos personales y ajustes de cuenta
const Userdata = () => {

    // Theme variables, dark and light modes with memoized styles
    const { theme } = useTheme()
    const textStyles = createTextStyles(theme)
    const containerStyles = createContainerStyles(theme)

    return (
        <View style={[containerStyles.subContainer]}>
            <Text style={textStyles.h1}>Datos personales</Text>
            <Text style={[textStyles.h3, { color: theme.colors.secondaryText }]}>
                Edita tus datos personales
            </Text>
        </View>
    )
}

const styles = StyleSheet.create({

})

export default Userdata