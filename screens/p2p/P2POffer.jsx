import { useState, useEffect, useMemo } from "react"
import { View, Text, StyleSheet, KeyboardAvoidingView, Platform, ScrollView, TouchableWithoutFeedback, Keyboard } from "react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"

// Theme
import { useTheme } from "../../theme/ThemeContext"
import { createContainerStyles, createTextStyles } from "../../theme/themeUtils"

// UI Particles
import QPInput from "../../ui/particles/QPInput"
import QPButton from "../../ui/particles/QPButton"

// Icons
import FontAwesome6 from "@react-native-vector-icons/fontawesome6"

// User context
import { useAuth } from "../../auth/AuthContext"

// P2P Offer Component
const P2POffer = ({ route }) => {

	// User context
	const { user } = useAuth()

	// Contexts
	const { theme } = useTheme()
	const textStyles = createTextStyles(theme)
	const containerStyles = createContainerStyles(theme)

	const { offer } = route.params

	return (
		<KeyboardAvoidingView style={containerStyles.subContainer} behavior={Platform.OS === "ios" ? "padding" : "height"} keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 20} >
			<TouchableWithoutFeedback onPress={Keyboard.dismiss}>
				<View style={{ flex: 1 }}>

					<ScrollView contentContainerStyle={containerStyles.scrollContainer} showsVerticalScrollIndicator={false}>

						<Text>P2POffer</Text>
						<Text>{offer}</Text>

					</ScrollView>

					<View style={containerStyles.bottomButtonContainer}>
						<QPButton title="Contactar" onPress={() => { }} />
						<QPButton title="Contactar" onPress={() => { }} />
						<QPButton title="Contactar" onPress={() => { }} />
					</View>


				</View>
			</TouchableWithoutFeedback>
		</KeyboardAvoidingView>
	)
}

export default P2POffer