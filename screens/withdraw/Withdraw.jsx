import { StyleSheet, Text, View } from 'react-native'

// Theme
import { useTheme } from '../../theme/ThemeContext'
import { createContainerStyles } from '../../theme/themeUtils'

// UI
import QPButton from '../../ui/particles/QPButton'
import QPInput from '../../ui/particles/QPInput'

const Withdraw = () => {

    // Theme variables, dark and light modes
    const { theme } = useTheme()
    const containerStyles = createContainerStyles(theme)

    return (
        <View style={[containerStyles.subContainer]}>
            <Text>Withdraw</Text>
        </View>
    )
}

const styles = StyleSheet.create({})

export default Withdraw