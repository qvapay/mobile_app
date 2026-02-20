import { useState, useEffect } from 'react'
import { KeyboardAvoidingView, Platform, ScrollView, TouchableWithoutFeedback, Keyboard, View } from 'react-native'
import { useHeaderHeight } from '@react-navigation/elements'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useTheme } from '../theme/ThemeContext'
import { createContainerStyles } from '../theme/themeUtils'

const QPKeyboardView = ({
	children,
	actions = null,
	scrollViewProps = {},
	keyboardVerticalOffset,
	actionsContainerStyle = {},
}) => {
	const { theme } = useTheme()
	const containerStyles = createContainerStyles(theme)
	const headerHeight = useHeaderHeight()
	const insets = useSafeAreaInsets()
	const offset = keyboardVerticalOffset ?? (Platform.OS === 'ios' ? headerHeight : 20)
	const [keyboardVisible, setKeyboardVisible] = useState(false)

	useEffect(() => {
		const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow'
		const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide'
		const showSub = Keyboard.addListener(showEvent, () => setKeyboardVisible(true))
		const hideSub = Keyboard.addListener(hideEvent, () => setKeyboardVisible(false))
		return () => { showSub.remove(); hideSub.remove() }
	}, [])

	return (
		<KeyboardAvoidingView
			style={containerStyles.subContainer}
			behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
			keyboardVerticalOffset={offset}
		>
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
		</KeyboardAvoidingView>
	)
}

export default QPKeyboardView
