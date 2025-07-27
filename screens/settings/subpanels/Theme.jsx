import { StyleSheet, Text, View } from 'react-native'



const Theme = () => {

    // Theme variables, dark and light modes with memoized styles
    // const { theme } = useTheme()
    // const textStyles = createTextStyles(theme)
    // const containerStyles = createContainerStyles(theme)

    return (
        <View style={[containerStyles.subContainer]}>
            <Text style={textStyles.h1}>Tema</Text>
        </View>
    )
}

const styles = StyleSheet.create({})

export default Theme