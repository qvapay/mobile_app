import { View, Platform } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import Keypad from '../keypad/Keypad'

export default function SavingsKeypad({ navigation, route }) {
	const insets = useSafeAreaInsets()
	return (
		<View style={{ flex: 1, paddingBottom: Platform.OS === 'android' ? insets.bottom : 0 }}>
			<Keypad navigation={navigation} route={route} />
		</View>
	)
}
