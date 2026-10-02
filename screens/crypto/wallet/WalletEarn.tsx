import { useCallback, useMemo, useState } from 'react'
import { ScrollView, StyleSheet, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import FontAwesome6 from '@react-native-vector-icons/fontawesome6'

// Theme
import { useTheme } from '../../../theme/ThemeContext'
import { useContainerStyles, useTextStyles } from '../../../theme/themeUtils'

// Wallet
import { assetPrice } from '../../../wallet/assets'
import type { AssetView } from '../../../wallet/assets'
import { canStakeAction, entryActionFor, isDevBuild, isStakingEntryVisible } from '../../../wallet/staking/capabilities'
import { isStakingKind } from '../../../wallet/staking/types'
import { usePriceMap, useWalletAssets } from './walletQueries'
import { formatUsd } from './walletFormat'

// Settings
import { useSettings } from '../../../settings/SettingsContext'

// UI
import QPFitText from '../../../ui/particles/QPFitText'
import QPPressable from '../../../ui/particles/QPPressable'
import QPAssetIcon from '../../../ui/particles/QPAssetIcon'
import { createHiddenRefreshControl } from '../../../ui/QPRefreshIndicator'

// Navigation
import { ROUTES } from '../../../routes'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import type { RootStackParamList } from '../../../types/navigation'

type Props = NativeStackScreenProps<RootStackParamList, 'WalletEarn'>

/** Valor USD de lo comprometido en staking de un activo (null = sin precio). */
const stakedUsd = (asset: AssetView, price: number | null): number | null =>
	price === null ? null : Number(asset.staked) * price

/**
 * Hub "Ganar": cuánto hay en staking en total y una fila por red con
 * staking (SOL, TRX, STX). Cada fila lleva a la ficha de staking del activo.
 * Los importes salen del mismo saldo que el héroe de la wallet (`staked`),
 * así que el total de aquí y el de la home nunca discrepan.
 */
const WalletEarn = ({ navigation }: Props) => {

	const { t } = useTranslation()
	const { theme } = useTheme()
	const textStyles = useTextStyles(theme)
	const containerStyles = useContainerStyles(theme)

	const { all, refetch } = useWalletAssets()
	const prices = usePriceMap()
	const { getSetting } = useSettings()
	const showBalance = getSetting('privacy', 'showBalance', true) as boolean

	const dev = isDevBuild()
	const stakeable = useMemo(() => all.filter(asset => isStakingEntryVisible(asset, { dev }) || asset.hasStake), [all, dev])
	const total = useMemo(
		() => stakeable.reduce((sum, asset) => sum + (stakedUsd(asset, assetPrice(asset, prices)) ?? 0), 0),
		[stakeable, prices],
	)

	const [refreshing, setRefreshing] = useState(false)
	const onRefresh = useCallback(async () => {
		setRefreshing(true)
		try { await refetch() } finally { setRefreshing(false) }
	}, [refetch])

	return (
		<ScrollView style={containerStyles.subContainer} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false} refreshControl={createHiddenRefreshControl(refreshing, onRefresh)}>

			<View style={styles.hero}>
				<View style={[styles.heroIcon, { backgroundColor: theme.colors.successText + '18' }]}>
					<FontAwesome6 name="seedling" size={26} color={theme.colors.successText} iconStyle="solid" />
				</View>
				<Text style={[textStyles.h2, styles.centered, { color: theme.colors.primaryText }]}>{t('crypto.staking.hub.title')}</Text>
				<Text style={[textStyles.h5, styles.centered, { color: theme.colors.secondaryText }]}>{t('crypto.staking.hub.subtitle')}</Text>
			</View>

			<View style={[styles.totalCard, { backgroundColor: theme.colors.surface }, !theme.isDark && { borderWidth: StyleSheet.hairlineWidth, borderColor: theme.colors.border }]}>
				<Text style={[textStyles.h5, { color: theme.colors.secondaryText }]}>{t('crypto.staking.hub.totalLabel')}</Text>
				<QPFitText style={[textStyles.amount, styles.totalAmount, { color: theme.colors.primaryText }]}>
					{showBalance ? formatUsd(total) : '••••'}
				</QPFitText>
			</View>

			<Text style={[textStyles.h3, styles.sectionTitle, { color: theme.colors.primaryText }]}>{t('crypto.staking.hub.assetsTitle')}</Text>
			<View style={[styles.card, { backgroundColor: theme.colors.surface }, !theme.isDark && { borderWidth: StyleSheet.hairlineWidth, borderColor: theme.colors.border }]}>
				{stakeable.map((asset, index) => {
					const available = isStakingKind(asset.kind) && canStakeAction(asset.kind, entryActionFor(asset.kind))
					const sub = asset.hasStake
						? t('crypto.staking.hub.stakedLine', { amount: showBalance ? asset.stakedLabel : '••••', symbol: asset.symbol })
						: t('crypto.staking.hub.noStake')
					return (
						<QPPressable
							key={asset.id}
							onPress={() => navigation.navigate(ROUTES.WALLET_STAKE, { assetId: asset.id })}
							testID={`earn-asset-${asset.id}`}
							style={[styles.row, index < stakeable.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.colors.border + '60' }]}
							accessibilityRole="button"
						>
							<QPAssetIcon logoTick={asset.logoTick} networkTick={asset.networkTick} size={40} />
							<View style={styles.info}>
								<Text style={[textStyles.h4, { color: theme.colors.primaryText }]} numberOfLines={1}>{asset.symbol} · {asset.chainName}</Text>
								<Text style={{ color: theme.colors.secondaryText, fontFamily: theme.typography.fontFamily.regular, fontSize: theme.typography.fontSize.sm }} numberOfLines={1}>{sub}</Text>
							</View>
							{!available && (
								<View style={[styles.pill, { backgroundColor: theme.colors.elevation }]}>
									<Text style={{ color: theme.colors.secondaryText, fontFamily: theme.typography.fontFamily.medium, fontSize: theme.typography.fontSize.xs }}>{t('crypto.staking.soon')}</Text>
								</View>
							)}
							<FontAwesome6 name="chevron-right" size={12} color={theme.colors.tertiaryText} iconStyle="solid" />
						</QPPressable>
					)
				})}
			</View>

			<Text style={[styles.disclaimer, { color: theme.colors.tertiaryText, fontFamily: theme.typography.fontFamily.regular, fontSize: theme.typography.fontSize.xs }]}>
				{t('crypto.staking.hub.disclaimer')}
			</Text>
		</ScrollView>
	)
}

const styles = StyleSheet.create({
	content: { gap: 12, paddingBottom: 32 },
	hero: { alignItems: 'center', gap: 8, paddingTop: 8, paddingHorizontal: 8 },
	heroIcon: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
	centered: { textAlign: 'center' },
	totalCard: { borderRadius: 14, padding: 16, alignItems: 'center', gap: 4, marginTop: 8 },
	totalAmount: { fontSize: 32 },
	sectionTitle: { marginTop: 8 },
	card: { borderRadius: 14, paddingHorizontal: 12 },
	row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
	info: { flex: 1, minWidth: 0, gap: 2 },
	// Píldora = estado, no acción
	pill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
	disclaimer: { textAlign: 'center', paddingHorizontal: 8, marginTop: 4, lineHeight: 16 },
})

export default WalletEarn
