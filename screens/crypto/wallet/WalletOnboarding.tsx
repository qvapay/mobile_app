import { StyleSheet, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import FontAwesome6 from '@react-native-vector-icons/fontawesome6'

// Theme
import { useTheme } from '../../../theme/ThemeContext'
import { createTextStyles, createContainerStyles } from '../../../theme/themeUtils'

// UI
import QPButton from '../../../ui/particles/QPButton'

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
 */
const WalletOnboarding = ({ navigation }: Props) => {

	const { t } = useTranslation()
	const { theme } = useTheme()
	const textStyles = createTextStyles(theme)
	const containerStyles = createContainerStyles(theme)

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
						<FontAwesome6 name={point.icon} size={18} color={theme.colors.secondaryText} iconStyle="solid" />
						<Text style={[textStyles.h4, styles.pointText, { color: theme.colors.secondaryText }]}>{t(point.key)}</Text>
					</View>
				))}
			</View>

			<View style={styles.actions}>
				<QPButton title={t('crypto.wallet.onboarding.create')} onPress={() => navigation.replace(ROUTES.WALLET_BACKUP)} />
				<QPButton outlined title={t('crypto.wallet.onboarding.import')} onPress={() => navigation.replace(ROUTES.WALLET_IMPORT)} />
			</View>
		</View>
	)
}

const styles = StyleSheet.create({
	container: { paddingBottom: 30 },
	hero: { alignItems: 'center', gap: 14, marginTop: 20, marginBottom: 30 },
	heroIcon: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center' },
	centered: { textAlign: 'center' },
	points: { gap: 18, flex: 1 },
	point: { flexDirection: 'row', gap: 12, alignItems: 'flex-start', paddingRight: 10 },
	pointText: { flex: 1, lineHeight: 21 },
	actions: { gap: 10 },
})

export default WalletOnboarding
