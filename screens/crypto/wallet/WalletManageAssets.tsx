import { useMemo, useState } from 'react'
import { Pressable, StyleSheet, Switch, Text, View } from 'react-native'
// ScrollView de Gesture Handler: coordina su scroll con el pan de las asas de orden
import { ScrollView } from 'react-native-gesture-handler'
import FontAwesome6 from '@react-native-vector-icons/fontawesome6'
import { useTranslation } from 'react-i18next'

// Theme
import { useTheme } from '../../../theme/ThemeContext'
import { useContainerStyles, useTextStyles } from '../../../theme/themeUtils'

// Wallet
import { isAssetVisible, isHouseToken } from '../../../wallet/assets'
import type { AssetView } from '../../../wallet/assets'
import { useWalletAssets } from './walletQueries'

// Settings
import { useSettings } from '../../../settings/SettingsContext'

// UI
import QPAssetIcon from '../../../ui/particles/QPAssetIcon'
import AssetOrderList, { ASSET_ORDER_ROW_HEIGHT } from './components/AssetOrderList'

/**
 * "Gestionar activos": un switch por activo de TODO el registry, agrupado por
 * red. Encender/apagar guarda solo lo que el usuario toca
 * (`crypto.visibleAssets`); lo no tocado sigue la regla por defecto (lista
 * base + cualquiera con saldo), así un token nuevo del registry con fondos
 * aparece solo.
 *
 * Arriba, el ORDEN de la home: los activos visibles se arrastran desde su asa
 * (`crypto.assetOrder`). QUSD queda fijo el primero (decisión de producto) y
 * "Volver a automático" borra el orden manual.
 */
const WalletManageAssets = () => {

	const { t } = useTranslation()
	const { theme } = useTheme()
	const textStyles = useTextStyles(theme)
	const containerStyles = useContainerStyles(theme)

	const { all, visible, prefs, setAssetVisible, order, setAssetOrder } = useWalletAssets()
	// Mientras se arrastra, el scroll se bloquea para que no compita con el gesto
	const [dragging, setDragging] = useState(false)
	const house = visible.find(isHouseToken)
	const orderable = useMemo(() => visible.filter(asset => !isHouseToken(asset)), [visible])
	const { getSetting, updateSetting } = useSettings()
	const hideDust = getSetting('crypto', 'hideDust', true) as boolean

	const groups = useMemo(() => {
		const byChain = new Map<string, AssetView[]>()
		all.forEach(asset => byChain.set(asset.chainKey, [...(byChain.get(asset.chainKey) ?? []), asset]))
		return [...byChain.values()]
	}, [all])

	return (
		<ScrollView style={containerStyles.subContainer} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false} scrollEnabled={!dragging}>
			<Text style={[textStyles.h5, { color: theme.colors.secondaryText }]}>{t('crypto.wallet.manage.subtitle')}</Text>

			{/* Dust: entradas de menos de $0.01 (spam / address poisoning) fuera de la actividad */}
			<View style={[styles.card, styles.dustCard, { backgroundColor: theme.colors.surface }, !theme.isDark && { borderWidth: StyleSheet.hairlineWidth, borderColor: theme.colors.border }]}>
				<View style={styles.info}>
					<Text style={[textStyles.h4, { color: theme.colors.primaryText }]}>{t('crypto.wallet.manage.hideDust')}</Text>
					<Text style={{ color: theme.colors.secondaryText, fontFamily: theme.typography.fontFamily.regular, fontSize: theme.typography.fontSize.sm }}>{t('crypto.wallet.manage.hideDustHint')}</Text>
				</View>
				<Switch value={hideDust} onValueChange={value => { updateSetting('crypto', 'hideDust', value) }} trackColor={{ false: theme.colors.tertiaryText, true: theme.colors.primary }} />
			</View>

			{/* Orden de la home de la wallet */}
			{orderable.length > 1 && (
				<View style={styles.group}>
					<View style={styles.orderHeader}>
						<Text style={[styles.groupTitle, { color: theme.colors.secondaryText, fontFamily: theme.typography.fontFamily.medium, fontSize: theme.typography.fontSize.xs }]}>
							{t('crypto.wallet.manage.orderTitle').toUpperCase()}
						</Text>
						{order.length > 0 ? (
							<Pressable onPress={() => setAssetOrder([])} hitSlop={8} accessibilityRole="button" testID="wallet-manage-order-reset">
								<Text style={{ color: theme.colors.primary, fontFamily: theme.typography.fontFamily.medium, fontSize: theme.typography.fontSize.xs }}>{t('crypto.wallet.manage.orderReset')}</Text>
							</Pressable>
						) : (
							<Text style={{ color: theme.colors.tertiaryText, fontFamily: theme.typography.fontFamily.regular, fontSize: theme.typography.fontSize.xs }}>{t('crypto.wallet.manage.orderAuto')}</Text>
						)}
					</View>
					<View style={[styles.orderCard, { backgroundColor: theme.colors.surface }, !theme.isDark && { borderWidth: StyleSheet.hairlineWidth, borderColor: theme.colors.border }]}>
						{!!house && (
							<View style={styles.pinnedRow} accessible accessibilityLabel={`${house.symbol} · ${t('crypto.wallet.manage.orderPinned')}`}>
								<QPAssetIcon logoTick={house.logoTick} networkTick={house.networkTick} size={34} />
								<View style={styles.info}>
									<Text style={{ color: theme.colors.primaryText, fontFamily: theme.typography.fontFamily.medium, fontSize: theme.typography.fontSize.md }}>{house.symbol}</Text>
									<Text style={{ color: theme.colors.secondaryText, fontFamily: theme.typography.fontFamily.regular, fontSize: theme.typography.fontSize.xs }}>{t('crypto.wallet.manage.orderPinned')}</Text>
								</View>
								<View style={styles.pin}>
									<FontAwesome6 name="thumbtack" size={13} color={theme.colors.tertiaryText} iconStyle="solid" />
								</View>
							</View>
						)}
						<AssetOrderList assets={orderable} onReorder={setAssetOrder} onDraggingChange={setDragging} />
					</View>
					<Text style={[styles.orderHint, { color: theme.colors.tertiaryText, fontFamily: theme.typography.fontFamily.regular, fontSize: theme.typography.fontSize.xs }]}>
						{t('crypto.wallet.manage.orderHint')}
					</Text>
				</View>
			)}

			{groups.map(group => (
				<View key={group[0].chainKey} style={styles.group}>
					<Text style={[styles.groupTitle, { color: theme.colors.secondaryText, fontFamily: theme.typography.fontFamily.medium, fontSize: theme.typography.fontSize.xs }]}>
						{group[0].chainName.toUpperCase()}
					</Text>
					<View style={[styles.card, { backgroundColor: theme.colors.surface }, !theme.isDark && { borderWidth: StyleSheet.hairlineWidth, borderColor: theme.colors.border }]}>
						{group.map((asset, index) => (
							<View key={asset.id} style={[styles.row, index < group.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.colors.border + '60' }]}>
								<QPAssetIcon logoTick={asset.logoTick} networkTick={asset.networkTick} size={34} />
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
	orderHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginRight: 4 },
	orderCard: { borderRadius: 14, borderCurve: 'continuous' },
	pinnedRow: { height: ASSET_ORDER_ROW_HEIGHT, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 12 },
	pin: { width: 40, alignItems: 'center' },
	orderHint: { marginLeft: 4 },
})

export default WalletManageAssets
