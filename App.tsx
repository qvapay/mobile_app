import { StatusBar, StyleSheet, Text, useColorScheme, View } from 'react-native'

function App() {

	const isDarkMode = useColorScheme() === 'dark'

	return (
		<View style={styles.container}>
			<StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} />

			<Text>Hello World</Text>
		</View>
	)
}

const styles = StyleSheet.create({
	container: {
		flex: 1
	}
})

export default App
