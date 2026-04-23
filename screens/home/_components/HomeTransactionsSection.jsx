import { Pressable, StyleSheet, Text, View } from 'react-native'
import FontAwesome6 from '@react-native-vector-icons/fontawesome6'
import { useNavigation } from '@react-navigation/native'
import { ROUTES } from '../../../routes'
import QPTransaction from '../../../ui/particles/QPTransaction'
import { useHomeTransactions } from '../hooks/useHomeTransactions'
import { useTheme } from '../../../theme/ThemeContext'
import { useTextStyles } from '../../../theme/themeUtils'

const HomeTransactionsSection = () => {
	const navigation = useNavigation()
	const { theme } = useTheme()
	const textStyles = useTextStyles(theme)
	const { data: latestTransactions = [], isLoading } = useHomeTransactions()

	return (
		<View style={styles.section}>
			<View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
				<Text style={[textStyles.h5, { color: theme.colors.tertiaryText }]}>Últimas transacciones</Text>
				<Pressable onPress={() => navigation.navigate(ROUTES.TRANSACTIONS, { showSearch: true })} hitSlop={8}>
					<FontAwesome6 name="magnifying-glass" size={16} color={theme.colors.tertiaryText} iconStyle="solid" />
				</Pressable>
			</View>
			<View>
				{latestTransactions.map((transaction, index) => (
					<QPTransaction key={transaction.uuid} transaction={transaction} navigation={navigation} index={index} totalItems={latestTransactions.length} />
				))}
				{isLoading && latestTransactions.length === 0 && (
					<Text style={{ color: theme.colors.tertiaryText, paddingVertical: 8 }}>Cargando transacciones...</Text>
				)}
			</View>
			<Pressable onPress={() => navigation.navigate(ROUTES.TRANSACTIONS)} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }} >
				<Text style={{ color: theme.colors.primary, fontSize: theme.typography.fontSize.sm, fontFamily: theme.typography.fontFamily.medium }}>Ver todas</Text>
				<FontAwesome6 name="chevron-right" size={12} color={theme.colors.primary} iconStyle="solid" />
			</Pressable>
		</View>
	)
}

const styles = StyleSheet.create({
	section: {
		marginVertical: 10,
		gap: 8,
	},
})

export default HomeTransactionsSection

