import { useEffect } from 'react'
import { Pressable, ScrollView, StyleSheet, View } from 'react-native'
import FontAwesome6 from '@react-native-vector-icons/fontawesome6'
import { useNavigation } from '@react-navigation/native'
import QPSectionHeader from '../../../ui/particles/QPSectionHeader'
import QPAvatar from '../../../ui/particles/QPAvatar'
import { ROUTES } from '../../../routes'
import { useHomeQuickPayUsers } from '../hooks/useHomeQuickPayUsers'
import { useOnlineStatus } from '../../../hooks/OnlineStatusContext'
import { useTheme } from '../../../theme/ThemeContext'

const HomeQuickPaySection = () => {
	const navigation = useNavigation()
	const { theme } = useTheme()
	const { trackUsers, untrackUsers, isUserOnline } = useOnlineStatus()
	const { data: users = [] } = useHomeQuickPayUsers()

	useEffect(() => {
		const ids = users.map(u => u.uuid).filter(Boolean)
		if (ids.length) trackUsers(ids)
		return () => {
			if (ids.length) untrackUsers(ids)
		}
	}, [users, trackUsers, untrackUsers])

	return (
		<View style={styles.section}>
			<QPSectionHeader title="Pago rápido" subtitle="Ver todas" iconName="arrow-right" onPress={() => navigation.navigate(ROUTES.SEND)} />
			<ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 0 }}>
				<View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
					<Pressable onPress={() => navigation.navigate(ROUTES.SEND)}>
						<View style={{ backgroundColor: theme.colors.elevation, height: 56, width: 56, borderRadius: 28, justifyContent: 'center', alignItems: 'center' }}>
							<FontAwesome6 name="plus" size={24} color={theme.colors.primary} iconStyle="solid" />
						</View>
					</Pressable>
					{users.map((transferUser) => (
						<Pressable key={transferUser.uuid} onPress={() => navigation.navigate(ROUTES.SEND, { user_uuid: transferUser.uuid, send_amount: '0.00' })}>
							<QPAvatar user={transferUser} size={56} isOnline={isUserOnline(transferUser.uuid)} />
						</Pressable>
					))}
				</View>
			</ScrollView>
		</View>
	)
}

const styles = StyleSheet.create({
	section: {
		marginVertical: 10,
		gap: 8,
	},
})

export default HomeQuickPaySection

