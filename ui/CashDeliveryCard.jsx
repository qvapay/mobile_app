import { useMemo } from 'react'
import { View, Text, Pressable, StyleSheet, Image } from 'react-native'
import LinearGradient from 'react-native-linear-gradient'
import { useTheme } from '../theme/ThemeContext'
import { ROUTES } from '../routes'
import FontAwesome6 from '@react-native-vector-icons/fontawesome6'

// Delivery vehicle SVGs (isometric)
import Delivery1 from '../assets/images/ui/delivery/1.svg'
import Delivery2 from '../assets/images/ui/delivery/2.svg'
import Delivery3 from '../assets/images/ui/delivery/3.svg'
import Delivery4 from '../assets/images/ui/delivery/4.svg'
import Delivery5 from '../assets/images/ui/delivery/5.svg'
import Delivery6 from '../assets/images/ui/delivery/6.svg'
import Delivery7 from '../assets/images/ui/delivery/7.svg'
import Delivery8 from '../assets/images/ui/delivery/8.svg'

const ALL_DELIVERIES = [Delivery1, Delivery2, Delivery3, Delivery4, Delivery5, Delivery6, Delivery7, Delivery8]

// Generate random position within safe bounds
const randomPos = () => ({
	top: `${10 + Math.floor(Math.random() * 40)}%`,
	left: `${5 + Math.floor(Math.random() * 70)}%`,
})

const CashDeliveryCard = ({ navigation }) => {

	const { theme } = useTheme()

	// Pick 3 random delivery SVGs with random rotations (stable per mount)
	const deliveryIcons = useMemo(() => {
		const shuffled = [...ALL_DELIVERIES].sort(() => Math.random() - 0.5)
		return shuffled.slice(0, 3).map(icon => ({
			Component: icon,
			rotation: Math.floor(Math.random() * 60) - 30,
			position: randomPos(),
		}))
	}, [])

	return (
		<View style={styles.section}>

			<Text style={[styles.sectionTitle, { color: theme.colors.primaryText, fontFamily: theme.typography.fontFamily.semiBold, fontSize: theme.typography.fontSize.lg }]}>
				Envío de efectivo
			</Text>

			<Pressable onPress={() => navigation.navigate(ROUTES.CASH_DELIVERY)} style={({ pressed }) => [styles.card, { backgroundColor: theme.colors.surface, transform: [{ scale: pressed ? 0.98 : 1 }] }, theme.mode === 'light' && { borderWidth: 1, borderColor: theme.colors.border }]}>

				{/* Map background area */}
				<View style={styles.mapArea}>

					{/* Havana map image */}
					<Image
						source={require('../assets/images/maps/havana.png')}
						style={styles.mapImage}
						resizeMode="cover"
					/>

					{/* Bottom fade — matches action row surface color, fades up to transparent */}
					<LinearGradient
						colors={[
							'transparent',
							theme.colors.surface,
						]}
						style={styles.overlay}
					/>

					{/* Delivery vehicle icons */}
					{deliveryIcons.map(({ Component, rotation, position }, index) => (
						<View key={index} style={[styles.deliveryIcon, position, { transform: [{ rotate: `${rotation}deg` }] }]}>
							<Component width={25} height={25} />
						</View>
					))}

					{/* Title overlay */}
					<View style={styles.titleOverlay}>
						<Text style={[styles.cardTitle, { color: theme.colors.primaryText, fontFamily: theme.typography.fontFamily.bold, fontSize: theme.typography.fontSize.xxl }]}>
							USD CASH
						</Text>
						<Text style={[styles.cardSubtitle, { color: theme.colors.secondaryText, fontFamily: theme.typography.fontFamily.regular, fontSize: theme.typography.fontSize.sm }]}>
							Recibe USD en efectivo en La Habana{'\n'}en menos de 48 horas
						</Text>
					</View>
				</View>

				{/* Bottom action row */}
				<View style={styles.actionRow}>
					<Text style={[styles.actionText, { color: theme.colors.primary, fontFamily: theme.typography.fontFamily.semiBold, fontSize: theme.typography.fontSize.md }]}>
						Enviar efectivo
					</Text>
					<FontAwesome6 name="chevron-right" size={14} color={theme.colors.primary} iconStyle="solid" />
				</View>
			</Pressable>
		</View>
	)
}

const styles = StyleSheet.create({
	section: {
		marginVertical: 10,
		gap: 8,
	},
	sectionTitle: {},
	card: {
		borderRadius: 16,
		overflow: 'hidden',
	},
	mapArea: {
		height: 200,
		position: 'relative',
		overflow: 'hidden',
	},
	mapImage: {
		position: 'absolute',
		top: 0,
		left: 0,
		right: 0,
		bottom: 0,
		width: '100%',
		height: '100%',
	},
	overlay: {
		position: 'absolute',
		top: 0,
		left: 0,
		right: 0,
		bottom: 0,
	},
	deliveryIcon: {
		position: 'absolute',
	},
	titleOverlay: {
		position: 'absolute',
		bottom: 16,
		left: 16,
		right: 16,
	},
	cardTitle: {},
	cardSubtitle: {
		marginTop: 4,
	},
	actionRow: {
		flexDirection: 'row',
		alignItems: 'center',
		justifyContent: 'space-between',
		paddingHorizontal: 16,
		paddingVertical: 14,
	},
	actionText: {},
})

export default CashDeliveryCard
