import { useEffect } from 'react'
import { View, Text, StyleSheet, Dimensions, Linking, Image, Pressable } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import LinearGradient from 'react-native-linear-gradient'
import Animated, {
	useSharedValue,
	useAnimatedStyle,
	withRepeat,
	withTiming,
	withDelay,
	withSequence,
	Easing,
	interpolate,
} from 'react-native-reanimated'

// Theme
import { useTheme } from '../../theme/ThemeContext'

// Routes
import { ROUTES } from '../../routes'

// UI Particles
import QPButton from '../../ui/particles/QPButton'

// Settings Context
import { useSettings } from '../../settings/SettingsContext'

// SVG Coins
import BtcIcon from '../../assets/images/coins/btc.svg'
import EthIcon from '../../assets/images/coins/eth.svg'
import UsdtIcon from '../../assets/images/coins/usdt.svg'
import SolIcon from '../../assets/images/coins/sol.svg'
import BnbIcon from '../../assets/images/coins/bnb.svg'
import TonIcon from '../../assets/images/coins/ton.svg'

const { width, height } = Dimensions.get('window')

// Floating coin configuration
const floatingCoins = [
	{ Icon: BtcIcon, size: 56, x: '8%', y: '12%', duration: 8000, delay: 0 },
	{ Icon: EthIcon, size: 48, x: '82%', y: '8%', duration: 10000, delay: 500 },
	{ Icon: UsdtIcon, size: 40, x: '15%', y: '35%', duration: 9000, delay: 1000 },
	{ Icon: SolIcon, size: 44, x: '78%', y: '28%', duration: 11000, delay: 1500 },
	{ Icon: BnbIcon, size: 36, x: '5%', y: '55%', duration: 7500, delay: 800 },
	{ Icon: TonIcon, size: 42, x: '88%', y: '48%', duration: 9500, delay: 1200 },
]

// Animated floating coin component
const FloatingCoin = ({ Icon, size, x, y, duration, delay }) => {
	const progress = useSharedValue(0)
	const rotation = useSharedValue(0)

	useEffect(() => {
		progress.value = withDelay(
			delay,
			withRepeat(
				withSequence(
					withTiming(1, { duration: duration / 2, easing: Easing.inOut(Easing.ease) }),
					withTiming(0, { duration: duration / 2, easing: Easing.inOut(Easing.ease) })
				),
				-1,
				false
			)
		)
		rotation.value = withDelay(
			delay,
			withRepeat(
				withSequence(
					withTiming(10, { duration: duration, easing: Easing.inOut(Easing.ease) }),
					withTiming(-10, { duration: duration, easing: Easing.inOut(Easing.ease) })
				),
				-1,
				true
			)
		)
	}, [delay, duration, progress, rotation])

	const animatedStyle = useAnimatedStyle(() => ({
		transform: [
			{ translateY: interpolate(progress.value, [0, 1], [0, -20]) },
			{ rotate: `${rotation.value}deg` },
			{ scale: interpolate(progress.value, [0, 0.5, 1], [1, 1.08, 1]) },
		],
		opacity: interpolate(progress.value, [0, 0.5, 1], [0.25, 0.4, 0.25]),
	}))

	return (
		<Animated.View style={[styles.floatingCoin, { left: x, top: y }, animatedStyle]} pointerEvents="none">
			<Icon width={size} height={size} />
		</Animated.View>
	)
}

// Animated gradient orb component
const GradientOrb = ({ colors, size, x, y, duration, delay }) => {
	const scale = useSharedValue(1)
	const opacity = useSharedValue(0.15)

	useEffect(() => {
		scale.value = withDelay(
			delay,
			withRepeat(
				withSequence(
					withTiming(1.3, { duration, easing: Easing.inOut(Easing.ease) }),
					withTiming(1, { duration, easing: Easing.inOut(Easing.ease) })
				),
				-1,
				true
			)
		)
		opacity.value = withDelay(
			delay,
			withRepeat(
				withSequence(
					withTiming(0.3, { duration, easing: Easing.inOut(Easing.ease) }),
					withTiming(0.15, { duration, easing: Easing.inOut(Easing.ease) })
				),
				-1,
				true
			)
		)
	}, [delay, duration, opacity, scale])

	const animatedStyle = useAnimatedStyle(() => ({
		transform: [{ scale: scale.value }],
		opacity: opacity.value,
	}))

	return (
		<Animated.View style={[styles.orbContainer, { left: x, top: y }, animatedStyle]} pointerEvents="none">
			<LinearGradient
				colors={colors}
				style={[styles.orb, { width: size, height: size, borderRadius: size / 2 }]}
				start={{ x: 0, y: 0 }}
				end={{ x: 1, y: 1 }}
			/>
		</Animated.View>
	)
}

// Welcome Screen
const WelcomeScreen = ({ navigation }) => {

	// Theme
	const { theme } = useTheme()

	// Settings context
	const { updateSetting } = useSettings()

	// Animation values for main content
	const titleOpacity = useSharedValue(0)
	const titleTranslateY = useSharedValue(30)
	const coinsOpacity = useSharedValue(0)
	const coinsScale = useSharedValue(0.8)
	const buttonsOpacity = useSharedValue(0)
	const buttonsTranslateY = useSharedValue(20)

	useEffect(() => {
		// Staggered entrance animations
		titleOpacity.value = withDelay(300, withTiming(1, { duration: 800 }))
		titleTranslateY.value = withDelay(300, withTiming(0, { duration: 800, easing: Easing.out(Easing.back(1.5)) }))

		coinsOpacity.value = withDelay(600, withTiming(1, { duration: 1000 }))
		coinsScale.value = withDelay(600, withTiming(1, { duration: 1000, easing: Easing.out(Easing.back(1.2)) }))

		buttonsOpacity.value = withDelay(900, withTiming(1, { duration: 600 }))
		buttonsTranslateY.value = withDelay(900, withTiming(0, { duration: 600, easing: Easing.out(Easing.ease) }))
	}, [buttonsOpacity, buttonsTranslateY, coinsOpacity, coinsScale, titleOpacity, titleTranslateY])

	const titleAnimatedStyle = useAnimatedStyle(() => ({
		opacity: titleOpacity.value,
		transform: [{ translateY: titleTranslateY.value }],
	}))

	const coinsAnimatedStyle = useAnimatedStyle(() => ({
		opacity: coinsOpacity.value,
		transform: [{ scale: coinsScale.value }],
	}))

	const buttonsAnimatedStyle = useAnimatedStyle(() => ({
		opacity: buttonsOpacity.value,
		transform: [{ translateY: buttonsTranslateY.value }],
	}))

	// Handle long press on title to reset first time use
	const handleTitleLongPress = async () => {
		try {
			await updateSetting('appearance', 'firstTime', true)
			navigation.reset({ index: 0, routes: [{ name: ROUTES.ONBOARD_SCREEN }] })
		} catch (error) { /* error resetting app */ }
	}

	return (
		<View style={[styles.container, { backgroundColor: theme.colors.background }]}>

			{/* Animated gradient orbs */}
			<GradientOrb
				colors={['rgba(147, 51, 234, 0.3)', 'rgba(219, 39, 119, 0.2)']}
				size={300}
				x={-100}
				y={-50}
				duration={8000}
				delay={0}
			/>
			<GradientOrb
				colors={['rgba(59, 130, 246, 0.25)', 'rgba(6, 182, 212, 0.2)']}
				size={350}
				x={width - 150}
				y={100}
				duration={10000}
				delay={2000}
			/>
			<GradientOrb
				colors={['rgba(103, 89, 239, 0.2)', 'rgba(251, 191, 36, 0.15)']}
				size={280}
				x={-50}
				y={height - 400}
				duration={9000}
				delay={1000}
			/>

			{/* Floating coins */}
			{floatingCoins.map((coin, index) => (
				<FloatingCoin key={index} {...coin} />
			))}

			{/* Gradient overlay for depth - positioned behind content */}
			<LinearGradient
				colors={['transparent', theme.colors.background + '60', theme.colors.background + 'CC']}
				style={styles.bottomGradient}
				locations={[0, 0.6, 1]}
				pointerEvents="none"
			/>

			<SafeAreaView style={styles.safeArea}>

				{/* Main content */}
				<View style={styles.content}>

					{/* Title section */}
					<Animated.View style={[styles.titleContainer, titleAnimatedStyle]}>
						<Pressable onLongPress={handleTitleLongPress} delayLongPress={3000}>
							<Text style={[styles.title, { color: theme.colors.primaryText }]}>
								Tu cuenta digital
							</Text>
							<Text style={[styles.title, { color: theme.colors.primaryText }]}>
								en{' '}
								<Text style={styles.titleGradient}>
									DÓLARES
								</Text>
							</Text>
						</Pressable>
						<Text style={[styles.subtitle, { color: theme.colors.secondaryText }]}>
							La plataforma de pagos P2P más rápida y segura del Caribe
						</Text>
					</Animated.View>

					{/* 3D Coins image */}
					<Animated.View style={[styles.coinsContainer, coinsAnimatedStyle]}>
						<Image
							source={require('../../assets/images/onboard/coins.png')}
							style={styles.coinsImage}
							resizeMode="contain"
						/>
					</Animated.View>

					{/* Buttons section */}
					<Animated.View style={[styles.bottomSection, buttonsAnimatedStyle]}>
						<View style={styles.buttonContainer}>
							<QPButton
								title="Comenzar"
								onPress={() => navigation.navigate(ROUTES.LOGIN_SCREEN)}
								style={[styles.primaryButton, { backgroundColor: theme.colors.primary }]}
								textStyle={styles.primaryButtonText}
							/>
							<QPButton
								title="Crear cuenta"
								onPress={() => navigation.navigate(ROUTES.REGISTER_SCREEN)}
								style={[styles.secondaryButton, {
									backgroundColor: 'transparent',
									borderWidth: 1.5,
									borderColor: theme.colors.primary + '60'
								}]}
								textStyle={[styles.secondaryButtonText, { color: theme.colors.primaryText }]}
							/>
						</View>

						{/* Terms and Conditions */}
						<Text style={[styles.terms, { color: theme.colors.tertiaryText }]}>
							Al continuar, aceptas nuestros{' '}
							<Text
								style={[styles.termsLink, { color: theme.colors.primary }]}
								onPress={() => Linking.openURL(ROUTES.TERMS_AND_CONDITIONS)}
							>
								Términos y Condiciones
							</Text>
						</Text>
					</Animated.View>

				</View>
			</SafeAreaView>
		</View>
	)
}

const styles = StyleSheet.create({
	container: {
		flex: 1,
		overflow: 'hidden',
	},
	safeArea: {
		flex: 1,
		zIndex: 10,
	},
	content: {
		flex: 1,
		paddingHorizontal: 24,
		justifyContent: 'space-between',
	},
	// Gradient orbs
	orbContainer: {
		position: 'absolute',
	},
	orb: {
		position: 'absolute',
	},
	// Floating coins
	floatingCoin: {
		position: 'absolute',
		zIndex: 1,
	},
	// Bottom gradient overlay - behind content
	bottomGradient: {
		position: 'absolute',
		bottom: 0,
		left: 0,
		right: 0,
		height: '45%',
		zIndex: 0,
	},
	// Title section
	titleContainer: {
		marginTop: 60,
		zIndex: 10,
	},
	title: {
		fontFamily: 'Rubik-Bold',
		fontSize: 42,
		lineHeight: 50,
		letterSpacing: -1,
	},
	titleGradient: {
		fontFamily: 'Rubik-Bold',
		fontSize: 42,
		color: '#F59E0B', // Warm yellow-orange for "DÓLARES"
	},
	subtitle: {
		fontFamily: 'Rubik-Regular',
		fontSize: 16,
		marginTop: 16,
		lineHeight: 24,
		maxWidth: '85%',
	},
	// Coins section
	coinsContainer: {
		flex: 1,
		justifyContent: 'center',
		alignItems: 'center',
		zIndex: 5,
		marginVertical: -40,
	},
	coinsImage: {
		width: width * 0.85,
		height: width * 0.85,
	},
	// Bottom section
	bottomSection: {
		paddingBottom: 20,
		zIndex: 10,
	},
	buttonContainer: {
		gap: 12,
	},
	primaryButton: {
		height: 56,
	},
	primaryButtonText: {
		fontFamily: 'Rubik-SemiBold',
		fontSize: 17,
		color: '#FFFFFF',
	},
	secondaryButton: {
		height: 56,
	},
	secondaryButtonText: {
		fontFamily: 'Rubik-SemiBold',
		fontSize: 17,
	},
	// Terms
	terms: {
		fontFamily: 'Rubik-Regular',
		fontSize: 13,
		textAlign: 'center',
		marginTop: 20,
		lineHeight: 18,
	},
	termsLink: {
		fontFamily: 'Rubik-Medium',
	},
})

export default WelcomeScreen
