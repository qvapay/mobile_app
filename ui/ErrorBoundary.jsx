import React from 'react'
import { View, Text, Pressable, StyleSheet } from 'react-native'
import FontAwesome6 from '@react-native-vector-icons/fontawesome6'

/**
 * App-wide error boundary — the codebase's only class component (error
 * boundaries require one). Wraps the entire provider tree in `App.tsx` and
 * swaps in a Spanish full-screen fallback with a "Reintentar" button when a
 * descendant throws during render. Colors/fonts are hardcoded to the dark
 * palette because it may render before ThemeContext exists.
 *
 * @param {object} props
 * @param {() => void} [props.onReset] - Called after the retry button clears the error state.
 */
class ErrorBoundary extends React.Component {

	constructor(props) {
		super(props)
		this.state = { hasError: false }
	}

	static getDerivedStateFromError() {
		return { hasError: true }
	}

	handleReset = () => {
		this.setState({ hasError: false })
		this.props.onReset?.()
	}

	render() {
		if (this.state.hasError) {
			return (
				<View style={styles.container}>
					<FontAwesome6 name="triangle-exclamation" size={48} color="#DB253E" iconStyle="solid" />
					<Text style={styles.title}>Algo salió mal</Text>
					<Text style={styles.subtitle}>Ha ocurrido un error inesperado</Text>
					<Pressable style={styles.button} onPress={this.handleReset}>
						<Text style={styles.buttonText}>Reintentar</Text>
					</Pressable>
				</View>
			)
		}

		return this.props.children
	}
}

const styles = StyleSheet.create({
	container: {
		flex: 1,
		justifyContent: 'center',
		alignItems: 'center',
		backgroundColor: '#0E0E1C',
		padding: 24,
	},
	title: {
		color: '#F7F7F7',
		fontSize: 20,
		fontFamily: 'Rubik-SemiBold',
		marginTop: 20,
		textAlign: 'center',
	},
	subtitle: {
		color: '#9DA3B4',
		fontSize: 14,
		fontFamily: 'Rubik-Regular',
		marginTop: 8,
		textAlign: 'center',
	},
	button: {
		backgroundColor: '#6759EF',
		borderRadius: 12,
		paddingHorizontal: 32,
		paddingVertical: 14,
		marginTop: 24,
	},
	buttonText: {
		color: '#FFFFFF',
		fontSize: 16,
		fontFamily: 'Rubik-Medium',
	},
})

export default ErrorBoundary
