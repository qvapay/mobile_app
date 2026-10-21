import { useMemo } from 'react'
import { Linking, StyleSheet, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner-native'
import FontAwesome6 from '@react-native-vector-icons/fontawesome6'

// Theme
import { useTheme } from '../../../../theme/ThemeContext'
import { useTextStyles } from '../../../../theme/themeUtils'

// Wallet
import { useWallet } from '../../../../wallet/WalletContext'
import { useEffectiveRegistry } from '../../../../wallet/registry/appRpcRouter'
import { explorerAddressUrl } from '../../../../wallet/assets'

// UI
import QPAddress from '../../../../ui/particles/QPAddress'
import QPPressable from '../../../../ui/particles/QPPressable'

/**
 * Aviso de cuenta TRON cuyo permiso de dueño es de OTRA dirección (ver
 * `wallet/tron/control.ts`): la frase ve el saldo pero no puede moverlo, y lo
 * que entre se lo queda quien la controla. Lleva al explorador, donde se ven
 * los permisos, para que no haya que fiarse solo de la app.
 *
 * @param props.controllers - Direcciones que firman en lugar de la frase.
 * @param [props.variant] - `receive`: el cuerpo habla de no recibir nada aquí.
 */
const TronControlWarning = ({ controllers, variant = 'account' }: { controllers: string[], variant?: 'account' | 'receive' }) => {

	const { t } = useTranslation()
	const { theme } = useTheme()
	const textStyles = useTextStyles(theme)

	const { addresses } = useWallet()
	const registry = useEffectiveRegistry()
	const explorerUrl = useMemo(() => {
		const chain = Object.values(registry.chains).find(c => c.kind === 'tron')
		return addresses?.tron ? explorerAddressUrl(chain, addresses.tron) : null
	}, [registry, addresses?.tron])

	const openExplorer = () => {
		if (!explorerUrl) return
		Linking.openURL(explorerUrl).catch(() => toast.error(t('crypto.wallet.asset.explorerFailed')))
	}

	return (
		<View testID="tron-control-warning" style={[styles.card, { backgroundColor: theme.colors.danger + '1A' }]}>
			<FontAwesome6 name="triangle-exclamation" size={16} color={theme.colors.dangerText} iconStyle="solid" style={styles.icon} />
			<View style={styles.texts}>
				<Text style={[textStyles.h5, { color: theme.colors.dangerText, fontFamily: theme.typography.fontFamily.semiBold }]}>{t('crypto.wallet.tronControl.title')}</Text>
				<Text style={[textStyles.h6, { color: theme.colors.primaryText }]}>
					{t(variant === 'receive' ? 'crypto.wallet.tronControl.receiveBody' : 'crypto.wallet.tronControl.body')}
				</Text>
				{controllers.length > 0 && (
					<View style={styles.controllers}>
						<Text style={[textStyles.h6, { color: theme.colors.secondaryText }]}>{t('crypto.wallet.tronControl.controlledBy')}</Text>
						{controllers.map(address => (
							<QPAddress key={address} address={address} visible={{ head: 8, tail: 8 }} highlight={false} style={[textStyles.h6, { color: theme.colors.secondaryText }]} numberOfLines={1} />
						))}
					</View>
				)}
				{!!explorerUrl && (
					<QPPressable onPress={openExplorer} accessibilityRole="link" hitSlop={8}>
						<Text style={[textStyles.h6, { color: theme.colors.primary, fontFamily: theme.typography.fontFamily.medium }]}>{t('crypto.wallet.tronControl.explorer')}</Text>
					</QPPressable>
				)}
			</View>
		</View>
	)
}

const styles = StyleSheet.create({
	card: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, padding: 14, borderRadius: 14 },
	icon: { marginTop: 2 },
	texts: { flex: 1, gap: 6 },
	controllers: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
})

export default TronControlWarning
