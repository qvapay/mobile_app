import { View, Text, StyleSheet, Pressable } from 'react-native'
import { useNavigation } from '@react-navigation/native'
import FontAwesome6 from '@react-native-vector-icons/fontawesome6'

import { useTheme } from '../../theme/ThemeContext'
import useMarketCart from '../../screens/store/market/useMarketCart'
import { ROUTES } from '../../routes'

/**
 * Header cart icon with a live unit-count badge, for the marketplace screens'
 * `headerRight`. Self-contained (resolves navigation and the cart store on
 * its own) so it can live inside static screen options.
 */
const CartHeaderButton = () => {

	const { theme } = useTheme()
	const navigation = useNavigation()
	const { count } = useMarketCart()

	return (
		<Pressable onPress={() => navigation.navigate(ROUTES.MARKET_CART)} hitSlop={10} style={styles.wrap}>
			<FontAwesome6 name="cart-shopping" size={17} color={theme.colors.primaryText} iconStyle="solid" />
			{count > 0 && (
				<View style={[styles.badge, { backgroundColor: theme.colors.primary }]}>
					<Text style={styles.badgeText}>{count > 99 ? '99+' : count}</Text>
				</View>
			)}
		</Pressable>
	)
}

const styles = StyleSheet.create({
	wrap: {
		padding: 4,
	},
	badge: {
		position: 'absolute',
		top: -4,
		right: -6,
		minWidth: 16,
		height: 16,
		borderRadius: 8,
		paddingHorizontal: 3,
		alignItems: 'center',
		justifyContent: 'center',
	},
	badgeText: {
		color: '#FFF',
		fontSize: 9,
		fontWeight: '700',
	},
})

export default CartHeaderButton
