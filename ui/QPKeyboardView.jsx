import { useState, useEffect } from 'react'
import { Platform, ScrollView, TouchableWithoutFeedback, Keyboard, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useTheme } from '../theme/ThemeContext'
import { createContainerStyles } from '../theme/themeUtils'

const QPKeyboardView = ({
	children,
	actions = null,
	scrollViewProps = {},
	actionsContainerStyle = {},
}) => {
	const { theme } = useTheme()
	const containerStyles = createContainerStyles(theme)
	const insets = useSafeAreaInsets()
	const [keyboardHeight, setKeyboardHeight] = useState(0)

	useEffect(() => {
		const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow'
		const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide'
		const showSub = Keyboard.addListener(showEvent, (e) => setKeyboardHeight(e.endCoordinates.height))
		const hideSub = Keyboard.addListener(hideEvent, () => setKeyboardHeight(0))
		return () => { showSub.remove(); hideSub.remove() }
	}, [])

	const keyboardVisible = keyboardHeight > 0

	return (
		<View style={[containerStyles.subContainer, keyboardVisible && { paddingBottom: keyboardHeight }]}>
			<TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
				<View style={{ flex: 1 }}>
					<ScrollView
						contentContainerStyle={containerStyles.scrollContainer}
						showsVerticalScrollIndicator={false}
						keyboardShouldPersistTaps="handled"
						{...scrollViewProps}
					>
						{children}
					</ScrollView>
					{actions && (
						<View style={[containerStyles.bottomButtonContainer, { paddingBottom: keyboardVisible ? 8 : (insets.bottom || 16) }, actionsContainerStyle]}>
							{actions}
						</View>
					)}
				</View>
			</TouchableWithoutFeedback>
		</View>
	)
}

export default QPKeyboardView
