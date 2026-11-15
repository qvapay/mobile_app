import { useMemo } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { useNavigation } from '@react-navigation/native'
import FontAwesome6 from '@react-native-vector-icons/fontawesome6'

// Theme
import { useTheme } from '../../../../theme/ThemeContext'
import { useTextStyles } from '../../../../theme/themeUtils'

// Wallet
import { useAuth } from '../../../../auth/AuthContext'
import { useSettings } from '../../../../settings/SettingsContext'
import { useRegistry } from '../../../../wallet/registry/useRegistry'
import { customRpcChains } from '../../../../wallet/registry/customRpcs'
import type { CustomRpcMap } from '../../../../wallet/registry/customRpcs'

// UI
import QPPressable from '../../../../ui/particles/QPPressable'

// Routes
import { ROUTES } from '../../../../routes'

const NO_CUSTOM: CustomRpcMap = {}

/** Cadenas cuyas lecturas pasan primero por un nodo que añadió el usuario. */
export const useCustomNodeChains = (): string[] => {
	const registry = useRegistry()
	const { getSetting } = useSettings()
	const custom = getSetting('crypto', 'customRpcs', NO_CUSTOM) as CustomRpcMap
	return useMemo(() => customRpcChains(registry, custom), [registry, custom])
}

/**
 * Insignia fija junto a los saldos cuando los dice un nodo del USUARIO (R-03).
 *
 * Un nodo propio contesta lo que quiera, también un saldo que no existe. Es la estafa del
 * «cambia el nodo»: a quien vende le hacen añadir uno «para que le aparezca el pago», ve
 * el dinero y entrega lo suyo. El aviso no se puede descartar: dura lo que dure el nodo.
 *
 * @param props.chains - Nombres de las redes de ESTA pantalla que leen de un nodo propio.
 */
const CustomNodeNotice = ({ chains }: { chains: string[] }) => {

	const { t } = useTranslation()
	const { theme } = useTheme()
	const textStyles = useTextStyles(theme)
	const navigation = useNavigation()
	const { isAuthenticated } = useAuth()

	if (chains.length === 0) { return null }

	return (
		<View testID="custom-node-notice" style={[styles.card, { backgroundColor: theme.colors.warning + '1A' }]}>
			<FontAwesome6 name="server" size={14} color={theme.colors.warning} iconStyle="solid" style={styles.icon} />
			<View style={styles.texts}>
				<Text style={[textStyles.h5, { color: theme.colors.primaryText, fontFamily: theme.typography.fontFamily.semiBold }]}>{t('crypto.wallet.customNode.title')}</Text>
				<Text style={[textStyles.h6, { color: theme.colors.primaryText }]}>{t('crypto.wallet.customNode.body', { chains: chains.join(', ') })}</Text>
				<QPPressable onPress={() => navigation.navigate(ROUTES.SETTINGS_STACK, { screen: ROUTES.RPC_NODES, initial: !isAuthenticated })} accessibilityRole="link" hitSlop={8}>
					<Text style={[textStyles.h6, { color: theme.colors.primary, fontFamily: theme.typography.fontFamily.medium }]}>{t('crypto.wallet.customNode.action')}</Text>
				</QPPressable>
			</View>
		</View>
	)
}

const styles = StyleSheet.create({
	card: { flexDirection: 'row', gap: 10, padding: 12, borderRadius: 14 },
	icon: { marginTop: 3 },
	texts: { flex: 1, gap: 4 },
})

export default CustomNodeNotice
