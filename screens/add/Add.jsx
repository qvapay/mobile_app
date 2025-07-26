import { StyleSheet, Text, View } from 'react-native'

// Theme
import { useTheme } from '../../theme/ThemeContext'
import { createContainerStyles } from '../../theme/themeUtils'

const Add = () => {

    // Theme variables, dark and light modes
    const { theme } = useTheme()
    const containerStyles = createContainerStyles(theme)

    return (
        <View style={[containerStyles.subContainer]}>
            <Text>Add</Text>
        </View>
    )
}

const styles = StyleSheet.create({})

export default Add
