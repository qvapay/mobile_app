import { useMemo } from 'react'
import { ScrollView, StyleSheet, Switch, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'

// Theme
import { useTheme } from '../../../theme/ThemeContext'
import { useContainerStyles, useTextStyles } from '../../../theme/themeUtils'

// Wallet
import { isAssetVisible } from '../../../wallet/assets'
import type { AssetView } from '../../../wallet/assets'
import { useWalletAssets } from './walletQueries'

// Settings
import { useSettings } from '../../../settings/SettingsContext'

// UI
import AssetIcon from './components/AssetIcon'

/**
 * "Gestionar activos": un switch por activo de TODO el registry, agrupado por
 * red. Encender/apagar guarda solo lo que el usuario toca
 * (`crypto.visibleAssets`); lo no tocado sigue la regla por defecto (lista
 * base + cualquiera con saldo), así un token nuevo del registry con fondos
 * aparece solo.
 */
const WalletManageAssets = () => {

	const { t } = useTranslation()
	const { theme } = useTheme()
	const textStyles = useTextStyles(theme)
	const containerStyles = useContainerStyles(theme)

	const { all, prefs, setAssetVisible } = useWalletAssets()
	const { getSetting, updateSetting } = useSettings()
	const hideDust = getSetting('crypto', 'hideDust', true) as boolean

	const groups = useMemo(() => {
		const byChain = new Map<string, AssetView[]>()
		all.forEach(asset => byChain.set(asset.chainKey, [...(byChain.get(asset.chainKey) ?? []), asset]))
		return [...byChain.values()]
	}, [all])

	return (
		<ScrollView style={containerStyles.subContainer} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
			<Text style={[textStyles.h5, { color: theme.colors.secondaryText }]}>{t('crypto.wallet.manage.subtitle')}</Text>

			{/* Dust: entradas de menos de $0.01 (spam / address poisoning) fuera de la actividad */}
			<View style={[styles.card, styles.dustCard, { backgroundColor: theme.colors.surface }, !theme.isDark && { borderWidth: StyleSheet.hairlineWidth, borderColor: theme.colors.border }]}>
				<View style={styles.info}>
					<Text style={[textStyles.h4, { color: theme.colors.primaryText }]}>{t('crypto.wallet.manage.hideDust')}</Text>
					<Text style={{ color: theme.colors.secondaryText, fontFamily: theme.typography.fontFamily.regular, fontSize: theme.typography.fontSize.sm }}>{t('crypto.wallet.manage.hideDustHint')}</Text>
				</View>
				<Switch value={hideDust} onValueChange={value => { updateSetting('crypto', 'hideDust', value) }} trackColor={{ false: theme.colors.tertiaryText, true: theme.colors.primary }} />
			</View>

			{groups.map(group => (
				<View key={group[0].chainKey} style={styles.group}>
					<Text style={[styles.groupTitle, { color: theme.colors.secondaryText, fontFamily: theme.typography.fontFamily.medium, fontSize: theme.typography.fontSize.xs }]}>
						{group[0].chainName.toUpperCase()}
					</Text>
					<View style={[styles.card, { backgroundColor: theme.colors.surface }, !theme.isDark && { borderWidth: StyleSheet.hairlineWidth, borderColor: theme.colors.border }]}>
						{group.map((asset, index) => (
							<View key={asset.id} style={[styles.row, index < group.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.colors.border + '60' }]}>
								<AssetIcon logoTick={asset.logoTick} networkTick={asset.networkTick} size={34} />
								<View style={styles.info}>
									<Text style={[textStyles.h4, { color: theme.colors.primaryText }]}>{asset.symbol}</Text>
									{asset.hasBalance && (
										<Text style={{ color: theme.colors.secondaryText, fontFamily: theme.typography.fontFamily.regular, fontSize: theme.typography.fontSize.sm }}>{asset.amountLabel}</Text>
									)}
								</View>
								<Switch
									value={isAssetVisible(asset, prefs)}
									onValueChange={value => setAssetVisible(asset.id, value)}
									trackColor={{ false: theme.colors.tertiaryText, true: theme.colors.primary }}
									accessibilityLabel={`${asset.symbol} ${asset.chainName}`}
								/>
							</View>
						))}
					</View>
				</View>
			))}
		</ScrollView>
	)
}

const styles = StyleSheet.create({
	content: { gap: 16, paddingBottom: 40 },
	group: { gap: 6 },
	groupTitle: { letterSpacing: 0.6, marginLeft: 4 },
	card: { borderRadius: 14, paddingHorizontal: 12 },
	dustCard: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
	row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
	info: { flex: 1 },
})

export default WalletManageAssets
