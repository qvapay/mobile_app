import { View, Text, StyleSheet } from 'react-native'

// Routes
import { ROUTES } from '../../routes'

const HelpScreen = ({ navigation }) => {

    return (
        <View style={styles.container}>
            <Text>Help Screen</Text>
        </View>
    )
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
})

export default HelpScreen