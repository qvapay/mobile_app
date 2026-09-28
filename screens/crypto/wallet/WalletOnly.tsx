import { useCallback, useEffect, useState } from 'react'
import type { ReactElement } from 'react'
import { Image, ScrollView, StyleSheet, Text, View } from 'react-native'
import type { RefreshControlProps } from 'react-native'
import { useTranslation } from 'react-i18next'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

// Theme
import { useTheme } from '../../../theme/ThemeContext'
import { useContainerStyles } from '../../../theme/themeUtils'

// Wallet
import { useWallet } from '../../../wallet/WalletContext'
import WalletHome from './WalletHome'
import AccountUpsellCard from './components/AccountUpsellCard'

// UI
import QPPressable from '../../../ui/particles/QPPressable'
import { createHiddenRefreshControl } from '../../../ui/QPRefreshIndicator'

// Navigation
import { ROUTES } from '../../../routes'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import type { RootStackParamList } from '../../../types/navigation'

type Props = NativeStackScreenProps<RootStackParamList, 'WalletOnly'>

/** El pull-to-refresh solo da el flanco a WalletHome; la barra se retira sola. */
const REFRESH_PULSE_MS = 800

/**
 * Raíz del "modo wallet": sin sesión QvaPay pero con la wallet self-custody en
 * el teléfono (creada desde Welcome o que sobrevivió a un logout). Reutiliza
 * WalletHome tal cual — ella ya oculta lo que exige cuenta — con una cabecera
 * mínima para iniciar sesión y la invitación a registrarse. Al iniciar sesión,
 * la reconciliación de useAppNavigation lleva a MainStack y la misma wallet
 * aparece en el tab Crypto.
 */
const WalletOnly = ({ navigation }: Props) => {

	const { t } = useTranslation()
	const { theme } = useTheme()
	const containerStyles = useContainerStyles(theme)
	const insets = useSafeAreaInsets()

	const { isReady, hasWallet } = useWallet()

	// Wallet borrada desde sus ajustes: sin nada que enseñar, de vuelta al Welcome
	useEffect(() => {
		if (isReady && !hasWallet) navigation.reset({ index: 0, routes: [{ name: ROUTES.WELCOME_SCREEN }] })
	}, [isReady, hasWallet, navigation])

	const [refreshing, setRefreshing] = useState(false)
	const onRefresh = useCallback(() => {
		setRefreshing(true)
		setTimeout(() => setRefreshing(false), REFRESH_PULSE_MS)
	}, [])

	const logo = theme.isDark ? require('../../../assets/images/ui/qvapay-logo-white.png') : require('../../../assets/images/ui/logo-qvapay.png')

	return (
		<View testID="wallet-only" style={[containerStyles.subContainer, { paddingTop: insets.top }]}>
			<View style={styles.header}>
				<Image source={logo} style={styles.logo} resizeMode="contain" accessibilityIgnoresInvertColors />
				<QPPressable onPress={() => navigation.navigate(ROUTES.LOGIN_SCREEN)} testID="wallet-only-signin" style={styles.signIn} accessibilityRole="button">
					<Text style={{ color: theme.colors.primary, fontFamily: theme.typography.fontFamily.medium, fontSize: theme.typography.fontSize.md }}>
						{t('crypto.wallet.guest.signIn')}
					</Text>
				</QPPressable>
			</View>

			<ScrollView
				contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}
				showsVerticalScrollIndicator={false}
				refreshControl={createHiddenRefreshControl(refreshing, onRefresh) as ReactElement<RefreshControlProps>}
			>
				<WalletHome refreshSignal={refreshing} />
				<AccountUpsellCard />
			</ScrollView>
		</View>
	)
}

const styles = StyleSheet.create({
	header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 10 },
	logo: { width: 32, height: 32 },
	signIn: { paddingVertical: 8, paddingLeft: 12 },
	content: { gap: 16, paddingTop: 8 },
})

export default WalletOnly
