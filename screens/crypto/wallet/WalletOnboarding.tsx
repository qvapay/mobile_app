import { useEffect, useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner-native'
import FontAwesome6 from '@react-native-vector-icons/fontawesome6'

// Theme
import { useTheme } from '../../../theme/ThemeContext'
import { createTextStyles, createContainerStyles } from '../../../theme/themeUtils'

// Bloqueo (el PIN protege la seed: WalletAuthModal)
import { appLockPinStatus } from '../../../api/client'

// Wallet
import { useWallet } from '../../../wallet/WalletContext'
import { useAuth } from '../../../auth/AuthContext'
import { finishWalletSetup } from './finishWalletSetup'

// UI
import QPButton from '../../../ui/particles/QPButton'
import QPPressable from '../../../ui/particles/QPPressable'
import QPAddress from '../../../ui/particles/QPAddress'
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
 * Sin PIN de bloqueo, elegir crear o importar pide antes el PIN aquí mismo,
 * CON CUENTA O SIN ELLA: ese PIN es el gate para leer la seed
 * (`WalletAuthModal`), y una wallet que nace sin él queda a merced de quien
 * tenga el teléfono desbloqueado. Se crea antes que la wallet a propósito:
 * todavía no hay nada que proteger, así que no hace falta más prueba que
 * elegirlo.
 *
 * Con una wallet en `recovery` (está en el teléfono pero sus llaves no se
 * pueden usar: `WalletContext`) esta pantalla NO ofrece crear ni importar:
 * explica qué pasa y deja restaurarla con su frase, reintentar la lectura o ir
 * a eliminarla. Ahí el PIN sí protege algo que ya existe, así que crearlo pide
 * la prueba de dueño del dispositivo (lo decide `enableAppLock`); un PIN que
 * tampoco se deja leer (viajó cifrado, sin su clave) cuenta como «sin PIN».
 */
const WalletOnboarding = ({ navigation }: Props) => {

	const { t } = useTranslation()
	const { theme } = useTheme()
	const textStyles = createTextStyles(theme)
	const containerStyles = createContainerStyles(theme)

	// El cuerpo escala con el ajuste de tamaño de fuente, así que ni el interlineado
	// ni el icono se fijan en píxeles: se derivan del tipo (h4 = fontSize.lg).
	const iconSize = theme.typography.fontSize.lg
	const lineHeight = Math.round(iconSize * 1.35)

	const { recovery, recheckKeys } = useWallet()
	const { isAuthenticated } = useAuth()
	const [retrying, setRetrying] = useState(false)

	/** null = aún no se sabe: los botones esperan, para no dejar pasar sin PIN por una carrera. */
	const [hasPin, setHasPin] = useState<boolean | null>(null)
	/** Destino elegido mientras se crea el PIN. */
	const [pending, setPending] = useState<typeof ROUTES.WALLET_BACKUP | typeof ROUTES.WALLET_IMPORT | null>(null)

	useEffect(() => {
		let cancelled = false
		// Solo vale un PIN que se deje LEER: uno ilegible no protege nada y se sustituye
		appLockPinStatus().then(status => { if (!cancelled) setHasPin(status === 'set') }).catch(() => { if (!cancelled) setHasPin(false) })
		return () => { cancelled = true }
	}, [])

	// Un fallo de lectura puede ser pasajero: si las llaves vuelven, la wallet ya está
	const retry = async () => {
		if (retrying) return
		setRetrying(true)
		try {
			if (await recheckKeys()) finishWalletSetup(navigation, isAuthenticated)
			else toast.error(t('crypto.wallet.recovery.stillUnreadable'))
		} finally { setRetrying(false) }
	}

	const go = (target: typeof ROUTES.WALLET_BACKUP | typeof ROUTES.WALLET_IMPORT) => {
		if (hasPin === false) { setPending(target); return }
		navigation.replace(target)
	}

	if (pending) {
		return (
			<View style={[containerStyles.subContainer, styles.container, styles.pinStep]}>
				<WalletPinSetup onDone={() => navigation.replace(pending)} ownerProof={recovery !== null} />
			</View>
		)
	}

	if (recovery) {
		return (
			<View testID="wallet-recovery" style={[containerStyles.subContainer, styles.container]}>

				<View style={styles.hero}>
					<View style={[styles.heroIcon, { backgroundColor: theme.colors.warning + '20' }]}>
						<FontAwesome6 name="key" size={28} color={theme.colors.warning} iconStyle="solid" />
					</View>
					<Text style={[textStyles.h1, styles.centered]}>{t('crypto.wallet.recovery.title')}</Text>
				</View>

				<View style={styles.points}>
					<Text style={[textStyles.h4, { lineHeight, color: theme.colors.secondaryText }]}>
						{t(recovery.reason === 'unknown' ? 'crypto.wallet.recovery.unknown' : 'crypto.wallet.recovery.unreadable')}
					</Text>
					{recovery.addresses && (
						<View style={[styles.addressChip, { backgroundColor: theme.colors.surface }]}>
							<QPAddress address={recovery.addresses.evm} visible={{ head: 10, tail: 8 }} style={[textStyles.h5, { color: theme.colors.primaryText }]} numberOfLines={1} />
						</View>
					)}
					<Text style={[textStyles.h4, { lineHeight, color: theme.colors.secondaryText }]}>
						{t(recovery.addresses ? 'crypto.wallet.recovery.restoreHint' : 'crypto.wallet.recovery.noAddresses')}
					</Text>
				</View>

				<View style={styles.actions}>
					{/* Sin sus direcciones no hay con qué comprobar la frase: solo reintentar o eliminar */}
					{recovery.addresses && (
						<QPButton testID="wallet-recovery-restore" title={t('crypto.wallet.recovery.restore')} onPress={() => go(ROUTES.WALLET_IMPORT)} disabled={hasPin === null} />
					)}
					<QPButton testID="wallet-recovery-retry" outlined title={t('crypto.wallet.recovery.retry')} onPress={retry} loading={retrying} />
					<QPPressable
						testID="wallet-recovery-remove"
						onPress={() => navigation.navigate(ROUTES.SETTINGS_STACK, { screen: ROUTES.WALLET_SETTINGS, initial: !isAuthenticated })}
						style={styles.remove}
						accessibilityRole="button"
					>
						<Text style={[textStyles.h5, { color: theme.colors.dangerText }]}>{t('crypto.wallet.recovery.remove')}</Text>
					</QPPressable>
				</View>
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
	addressChip: { alignSelf: 'flex-start', borderRadius: 10, paddingVertical: 8, paddingHorizontal: 12 },
	remove: { alignSelf: 'center', paddingVertical: 10 },
})

export default WalletOnboarding
