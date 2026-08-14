import { useEffect, useState } from 'react'
import { Text, View, StyleSheet, Pressable, useWindowDimensions } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import LinearGradient from 'react-native-linear-gradient'
import Animated, {
	Easing,
	FadeInDown,
	FadeOutUp,
	cancelAnimation,
	useAnimatedStyle,
	useReducedMotion,
	useSharedValue,
	withRepeat,
	withTiming,
} from 'react-native-reanimated'

// Theme
import { useTheme } from '../../theme/ThemeContext'

// Marca: isotipo + nombre plano con halo respirando detrás
import BrandMark from './BrandMark'

// SVG Coins
import BtcIcon from '../../assets/images/coins/btc.svg'
import EthIcon from '../../assets/images/coins/eth.svg'
import UsdtIcon from '../../assets/images/coins/usdt.svg'
import SolIcon from '../../assets/images/coins/sol.svg'
import BnbIcon from '../../assets/images/coins/bnb.svg'
import TonIcon from '../../assets/images/coins/ton.svg'

// El verbo rotatorio del headline — cada uno con su acento del theme
const WORD_INTERVAL_MS = 2400
const kineticWords = (theme) => [
	{ text: 'Envíalo.', color: theme.colors.primary },
	{ text: 'Ahórralo.', color: theme.colors.successText },
	{ text: 'Inviértelo.', color: theme.colors.gold },
	{ text: 'Recíbelo.', color: theme.colors.warning },
]

// Contenido de las tres columnas de marquesina: pills de monedas y features.
// Cada columna lleva mezcla distinta para que el patrón no se note repetido.
const MARQUEE_COLUMNS = [
	{
		duration: 26000, reverse: false, items: [
			{ Icon: BtcIcon, label: 'BTC' }, { label: 'P2P' }, { Icon: UsdtIcon, label: 'USDT' },
			{ label: 'Remesas' }, { Icon: SolIcon, label: 'SOL' }, { label: 'Ahorro' },
		]
	},
	{
		duration: 34000, reverse: true, items: [
			{ label: 'Recargas' }, { Icon: EthIcon, label: 'ETH' }, { label: 'Gift Cards' },
			{ Icon: TonIcon, label: 'TON' }, { label: 'Pagos' }, { label: 'USD' },
		]
	},
	{
		duration: 30000, reverse: false, items: [
			{ Icon: BnbIcon, label: 'BNB' }, { label: 'Tienda' }, { label: 'Invest' },
			{ Icon: UsdtIcon, label: 'USDT' }, { label: 'SQP' }, { label: 'Crypto' },
		]
	},
]

const Pill = ({ Icon, label, theme }) => (
	<View style={[
		styles.pill,
		{ backgroundColor: theme.colors.surface },
		theme.mode === 'light' && { borderWidth: 1, borderColor: theme.colors.border },
	]}>
		{Icon && <Icon width={18} height={18} />}
		<Text style={{ color: theme.colors.secondaryText, fontFamily: theme.typography.fontFamily.medium, fontSize: 13 }}>
			{label}
		</Text>
	</View>
)

// Columna de marquesina infinita: el contenido se renderiza DOS veces apilado y
// se desplaza exactamente la altura de una copia — el wrap es invisible. La
// altura se mide con onLayout (no se asume).
const MarqueeColumn = ({ items, duration, reverse, theme, frozen }) => {
	const shift = useSharedValue(0)
	const [copyHeight, setCopyHeight] = useState(0)

	useEffect(() => {
		if (!copyHeight || frozen) {
			return
		}
		shift.value = 0
		shift.value = withRepeat(withTiming(1, { duration, easing: Easing.linear }), -1, false)
		return () => cancelAnimation(shift)
	}, [copyHeight, duration, frozen, shift])

	const style = useAnimatedStyle(() => ({
		transform: [{ translateY: (reverse ? 1 : -1) * shift.value * copyHeight }],
	}))

	// Cada copia repite los items 4 veces: una sola pasada (~330px) no cubre una
	// pantalla alta y el hueco del wrap entraría en cámara
	const copy = (key) => (
		<View key={key} onLayout={key === 'a' ? (e) => setCopyHeight(e.nativeEvent.layout.height) : undefined}>
			{[0, 1, 2, 3].flatMap((rep) =>
				items.map((item, i) => (
					<Pill key={`${rep}-${i}`} {...item} theme={theme} />
				))
			)}
		</View>
	)

	// En reversa el contenido arranca desplazado una copia hacia arriba para que
	// el hueco nunca entre en pantalla
	return (
		<Animated.View style={[reverse && copyHeight ? { marginTop: -copyHeight } : null, style]}>
			{copy('a')}
			{copy('b')}
		</Animated.View>
	)
}

/**
 * Hero del WelcomeScreen ("Kinetic"): la marca arriba (isotipo con halo
 * respirando detrás + nombre plano — BrandMark), tipografía editorial
 * gigante con un verbo rotatorio a color
 * (Envíalo / Ahórralo / Inviértelo / Recíbelo) al estilo Revolut, sobre tres
 * columnas diagonales de marquesina infinita con pills de monedas y features
 * de la app. Un scrim de degradado mantiene legible el texto. Reduced-motion
 * congela las marquesinas y fija el primer verbo.
 */
const WelcomeKinetic = ({ navigation, onSecretLongPress, actions }) => {

	// Theme
	const { theme } = useTheme()
	const { width } = useWindowDimensions()
	const reducedMotion = useReducedMotion()

	const words = kineticWords(theme)
	const [wordIndex, setWordIndex] = useState(0)

	useEffect(() => {
		if (reducedMotion) {
			return
		}
		const cycle = setInterval(() => setWordIndex((prev) => (prev + 1) % words.length), WORD_INTERVAL_MS)
		return () => clearInterval(cycle)
	}, [reducedMotion, words.length])

	const bg = theme.colors.background

	return (
		<View style={[styles.container, { backgroundColor: bg }]}>

			{/* Marquesinas diagonales de fondo */}
			<View style={[styles.marqueeField, { width: width * 1.6, left: -width * 0.3 }]} pointerEvents="none">
				{MARQUEE_COLUMNS.map((column, i) => (
					<View key={i} style={styles.marqueeColumn}>
						<MarqueeColumn {...column} theme={theme} frozen={reducedMotion} />
					</View>
				))}
			</View>

			{/* Scrim: hunde las marquesinas para que el headline mande */}
			<LinearGradient
				colors={[bg + 'F2', bg + '55', bg + '30', bg + 'F7']}
				locations={[0, 0.35, 0.55, 0.85]}
				style={StyleSheet.absoluteFill}
				pointerEvents="none"
			/>

			<SafeAreaView style={styles.safeArea}>

				{/* Marca — isotipo con halo/ping en el trasfondo + nombre plano */}
				<Animated.View entering={FadeInDown.delay(100).duration(700)} style={styles.brandRow}>
					<BrandMark />
				</Animated.View>

				<View style={styles.fill} />

				{/* Headline cinético */}
				<Pressable onLongPress={onSecretLongPress} delayLongPress={3000} style={styles.headlineBlock}>
					<Animated.Text
						entering={FadeInDown.delay(150).duration(700)}
						style={[styles.headline, { color: theme.colors.primaryText, fontFamily: theme.typography.fontFamily.semiBold }]}>
						Tu dinero.
					</Animated.Text>
					<View style={styles.wordSlot}>
						<Animated.Text
							key={wordIndex}
							entering={FadeInDown.duration(450).easing(Easing.out(Easing.cubic))}
							exiting={FadeOutUp.duration(320)}
							style={[styles.headline, styles.kineticWord, { color: words[wordIndex].color, fontFamily: theme.typography.fontFamily.bold }]}>
							{words[wordIndex].text}
						</Animated.Text>
					</View>
				</Pressable>

				<Animated.Text
					entering={FadeInDown.delay(400).duration(700)}
					style={[styles.subtitle, { color: theme.colors.secondaryText, fontFamily: theme.typography.fontFamily.regular, fontSize: theme.typography.fontSize.md }]}>
					Dólares digitales, P2P y crypto para el Caribe.
				</Animated.Text>

				{actions}
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
	},
	fill: {
		flex: 1,
	},
	marqueeField: {
		position: 'absolute',
		top: -80,
		bottom: -80,
		flexDirection: 'row',
		justifyContent: 'space-evenly',
		transform: [{ rotate: '-14deg' }],
		opacity: 0.6,
	},
	marqueeColumn: {
		overflow: 'hidden',
	},
	pill: {
		flexDirection: 'row',
		alignItems: 'center',
		gap: 8,
		paddingHorizontal: 16,
		paddingVertical: 12,
		borderRadius: 22,
		marginVertical: 7,
	},
	brandRow: {
		paddingHorizontal: 24,
		paddingTop: 16,
	},
	headlineBlock: {
		paddingHorizontal: 24,
	},
	headline: {
		fontSize: 46,
		lineHeight: 54,
		letterSpacing: -1.2,
	},
	wordSlot: {
		height: 58,
		justifyContent: 'center',
	},
	kineticWord: {
		position: 'absolute',
	},
	subtitle: {
		paddingHorizontal: 24,
		marginTop: 14,
		marginBottom: 28,
		lineHeight: 23,
	},
})

export default WelcomeKinetic
