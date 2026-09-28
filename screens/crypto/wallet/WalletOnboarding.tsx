import { useEffect, useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import FontAwesome6 from '@react-native-vector-icons/fontawesome6'

// Theme
import { useTheme } from '../../../theme/ThemeContext'
import { createTextStyles, createContainerStyles } from '../../../theme/themeUtils'

// Bloqueo (el PIN protege la seed: WalletAuthModal)
import { hasAppLockPin } from '../../../api/client'

// UI
import QPButton from '../../../ui/particles/QPButton'
import WalletPinSetup from './components/WalletPinSetup'

// Navigation
import { ROUTES } from '../../../routes'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import type { RootStackParamList } from '../../../types/navigation'

type Props = NativeStackScreenProps<RootStackParamList, 'WalletOnboarding'>

const POINTS = [
	{ icon: 'mobile-screen', key: 'crypto.wallet.onboarding.point1' },
	{ icon: 'eye-slash', key: 'crypto.wallet.onboarding.point2' },
	{ icon: 'triangle-exclamation', key: 'crypto.wallet.onboarding.point3' },
] as const

/**
 * Puerta de entrada a la wallet self-custody: deja claro el modelo (llaves
 * solo en el dispositivo, QvaPay no puede recuperar nada) antes de crear o
 * importar. Crear lleva a WalletBackup (que genera la seed él mismo).
 *
 * `guest` (alta sin cuenta desde Welcome): sin PIN de bloqueo, elegir crear o
 * importar pide antes el PIN aquí mismo — el camino normal (Ajustes → Bloqueo)
 * cuelga de la cuenta, y sin PIN no habría gate para leer la seed.
 */
const WalletOnboarding = ({ navigation, route }: Props) => {

	const { t } = useTranslation()
	const { theme } = useTheme()
	const textStyles = createTextStyles(theme)
	const containerStyles = createContainerStyles(theme)

	// El cuerpo escala con el ajuste de tamaño de fuente, así que ni el interlineado
	// ni el icono se fijan en píxeles: se derivan del tipo (h4 = fontSize.lg).
	const iconSize = theme.typography.fontSize.lg
	const lineHeight = Math.round(iconSize * 1.35)

	const guest = route.params?.guest === true
	const [hasPin, setHasPin] = useState<boolean | null>(guest ? null : true)
	/** Destino elegido mientras se crea el PIN. */
	const [pending, setPending] = useState<typeof ROUTES.WALLET_BACKUP | typeof ROUTES.WALLET_IMPORT | null>(null)

	useEffect(() => {
		if (!guest) return
		let cancelled = false
		hasAppLockPin().then(exists => { if (!cancelled) setHasPin(exists) }).catch(() => { if (!cancelled) setHasPin(false) })
		return () => { cancelled = true }
	}, [guest])

	const go = (target: typeof ROUTES.WALLET_BACKUP | typeof ROUTES.WALLET_IMPORT) => {
		if (hasPin === false) { setPending(target); return }
		navigation.replace(target)
	}

	if (pending) {
		return (
			<View style={[containerStyles.subContainer, styles.container, styles.pinStep]}>
				<WalletPinSetup onDone={() => navigation.replace(pending)} />
			</View>
		)
	}

	return (
		<View style={[containerStyles.subContainer, styles.container]}>

			<View style={styles.hero}>
				<View style={[styles.heroIcon, { backgroundColor: theme.colors.primary + '15' }]}>
					<FontAwesome6 name="key" size={28} color={theme.colors.primary} iconStyle="solid" />
				</View>
				<Text style={[textStyles.h1, styles.centered]}>{t('crypto.wallet.onboarding.title')}</Text>
			</View>

			<View style={styles.points}>
				{POINTS.map(point => (
					<View key={point.key} style={styles.point}>
						<View style={[styles.pointIcon, { height: lineHeight }]}>
							<FontAwesome6 name={point.icon} size={iconSize} color={theme.colors.secondaryText} iconStyle="solid" />
						</View>
						<Text style={[textStyles.h4, styles.pointText, { lineHeight, color: theme.colors.secondaryText }]}>{t(point.key)}</Text>
					</View>
				))}
			</View>

			<View style={styles.actions}>
				<QPButton testID="wallet-onboarding-create" title={t('crypto.wallet.onboarding.create')} onPress={() => go(ROUTES.WALLET_BACKUP)} disabled={hasPin === null} />
				<QPButton testID="wallet-onboarding-import" outlined title={t('crypto.wallet.onboarding.import')} onPress={() => go(ROUTES.WALLET_IMPORT)} disabled={hasPin === null} />
			</View>
		</View>
	)
}

const styles = StyleSheet.create({
	container: { paddingBottom: 30 },
	pinStep: { paddingTop: 40 },
	hero: { alignItems: 'center', gap: 14, marginTop: 20, marginBottom: 30 },
	heroIcon: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center' },
	centered: { textAlign: 'center' },
	points: { gap: 18, flex: 1 },
	point: { flexDirection: 'row', gap: 12, alignItems: 'flex-start', paddingRight: 10 },
	// Caja de ancho FIJO para el icono: los glifos de FA6 no miden lo mismo
	// (mobile-screen estrecho, triangle-exclamation ancho) y sin ella las tres
	// líneas de texto arrancan en x distintas. El alto = interlineado de la
	// primera línea, para que el icono quede centrado CON ESA línea y no con el
	// bloque entero (que es de 1 o 2 líneas según el punto).
	pointIcon: { width: 24, alignItems: 'center', justifyContent: 'center' },
	pointText: { flex: 1 },
	actions: { gap: 10 },
})

export default WalletOnboarding
