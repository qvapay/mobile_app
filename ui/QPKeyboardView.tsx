import { ScrollView, TouchableWithoutFeedback, Keyboard, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useTheme } from '../theme/ThemeContext'
import { createContainerStyles } from '../theme/themeUtils'
import { useKeyboardHeight } from '../hooks/useKeyboardHeight'

// Tipos
import type { ReactNode, Ref } from 'react'
import type { ScrollViewProps, StyleProp, ViewStyle } from 'react-native'

type QPKeyboardViewProps = {
	children: ReactNode
	actions?: ReactNode
	scrollViewProps?: ScrollViewProps
	actionsContainerStyle?: StyleProp<ViewStyle>
	scrollViewRef?: Ref<ScrollView> | null
}

/**
 * Keyboard-aware screen container used across forms (Login, Register, Send,
 * settings subpanels): a themed ScrollView plus an optional pinned `actions`
 * footer (usually the submit QPButton) that rides above the keyboard.
 * Tracks keyboard height manually via `useKeyboardHeight` instead of
 * KeyboardAvoidingView. Tapping anywhere outside inputs dismisses the
 * keyboard (`keyboardShouldPersistTaps="handled"` keeps buttons tappable).
 *
 * @param props
 * @param props.children - Scrollable form content.
 * @param [props.actions] - Footer pinned above the keyboard / safe area.
 * @param [props.scrollViewProps] - Extra props spread onto the ScrollView.
 * @param [props.actionsContainerStyle] - Estilo extra del contenedor del footer.
 * @param [props.scrollViewRef] - Ref forwarded to the ScrollView.
 */
const QPKeyboardView = ({
	children,
	actions = null,
	scrollViewProps = {},
	actionsContainerStyle = {},
	scrollViewRef = null,
}: QPKeyboardViewProps) => {
	const { theme } = useTheme()
	const containerStyles = createContainerStyles(theme)
	const insets = useSafeAreaInsets()
	const { keyboardHeight, keyboardVisible } = useKeyboardHeight()

	return (
		<View style={[containerStyles.subContainer, keyboardVisible && { paddingBottom: keyboardHeight }]}>
			<TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
				<View style={{ flex: 1 }}>
					<ScrollView
						ref={scrollViewRef}
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
