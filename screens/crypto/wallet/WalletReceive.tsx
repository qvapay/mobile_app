import { useCallback, useMemo } from 'react'
import { ScrollView, Share, StyleSheet, Text, useWindowDimensions, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner-native'
import Clipboard from '@react-native-clipboard/clipboard'
import QRCodeStyled from 'react-native-qrcode-styled'
import FontAwesome6 from '@react-native-vector-icons/fontawesome6'

// Theme
import { useTheme } from '../../../theme/ThemeContext'
import { useContainerStyles, useTextStyles } from '../../../theme/themeUtils'

// Wallet
import { useWallet } from '../../../wallet/WalletContext'
import { addressForKind, findCoinForAsset, isDefaultAsset, isHouseToken } from '../../../wallet/assets'
import useCoins from '../../../hooks/useCoins'
import { ROUTES } from '../../../routes'
import type { WalletAsset } from '../../../wallet/assets'
import { useAssetCatalog } from './walletQueries'

// UI
import QPButton from '../../../ui/particles/QPButton'
import QPPressable from '../../../ui/particles/QPPressable'
import AssetIcon from './components/AssetIcon'

// Navigation
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import type { RootStackParamList } from '../../../types/navigation'

type Props = NativeStackScreenProps<RootStackParamList, 'WalletReceive'>

/** Nombre del estándar del token por familia, para el aviso de red ("USDT (TRC-20)"). */
const TOKEN_STANDARD: Record<string, string> = { tron: 'TRC-20', bsc: 'BEP-20', ethereum: 'ERC-20', stacks: 'SIP-010', solana: 'SPL' }

/**
 * Recibir en la wallet self-custody. Sin `assetId` lista los activos (qué
 * quieres recibir); con él pinta QR + dirección de ESA red y un aviso claro de
 * red: mandar USDT-BEP20 a la dirección TRON es la pérdida de fondos más común.
 * La dirección EVM es la misma en ETH/BNB Chain/Base/Polygon y se dice.
 */
const WalletReceive = ({ navigation, route }: Props) => {

	const assetId = route.params?.assetId
	const { t } = useTranslation()
	const { theme } = useTheme()
	const textStyles = useTextStyles(theme)
	const containerStyles = useContainerStyles(theme)
	const { width } = useWindowDimensions()
	const qrSize = Math.min(width - 120, 240)

	const { addresses } = useWallet()
	const catalog = useAssetCatalog()
	const asset = useMemo(() => catalog.find(a => a.id === assetId), [catalog, assetId])

	// Lista del selector: primero la base (lo que se usa), luego el resto del registry
	const pickerAssets = useMemo(
		() => [...catalog.filter(isDefaultAsset), ...catalog.filter(a => !isDefaultAsset(a))],
		[catalog],
	)

	const address = asset && addresses ? addressForKind(addresses, asset.kind) : null

	// Puente con el saldo QvaPay: si la moneda existe en el catálogo de retiros,
	// "Desde tu saldo QvaPay" abre el retiro con esta dirección ya escrita
	const { coins: withdrawCoins } = useCoins('out')
	const bridgeCoin = useMemo(() => (asset ? findCoinForAsset(withdrawCoins, catalog, asset) : null), [withdrawCoins, catalog, asset])
	const assetLabel = asset ? (asset.contract && TOKEN_STANDARD[asset.chainKey] ? `${asset.symbol} (${TOKEN_STANDARD[asset.chainKey]})` : asset.symbol) : ''

	const copy = useCallback(() => {
		if (!address) return
		Clipboard.setString(address)
		toast.success(t('crypto.wallet.card.copied'))
	}, [address, t])

	const share = useCallback(async () => {
		if (!address || !asset) return
		try {
			await Share.share({ message: t('crypto.wallet.receive.shareMessage', { asset: assetLabel, network: asset.chainName, address }) })
		} catch { /* cancelado */ }
	}, [address, asset, assetLabel, t])

	if (!asset || !address) {
		return (
			<ScrollView style={containerStyles.subContainer} contentContainerStyle={styles.pickerContent} showsVerticalScrollIndicator={false}>
				<Text style={[textStyles.h2, { color: theme.colors.primaryText }]}>{t('crypto.wallet.receive.pickTitle')}</Text>
				<View style={[styles.pickerCard, { backgroundColor: theme.colors.surface }, !theme.isDark && { borderWidth: StyleSheet.hairlineWidth, borderColor: theme.colors.border }]}>
					{pickerAssets.map((item: WalletAsset, index) => (
						<QPPressable
							key={item.id}
							onPress={() => navigation.setParams({ assetId: item.id })}
							style={[styles.pickerRow, index < pickerAssets.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.colors.border + '60' }]}
						>
							<AssetIcon logoTick={item.logoTick} networkTick={item.networkTick} size={36} />
							<View style={styles.pickerInfo}>
								<Text style={[textStyles.h4, { color: theme.colors.primaryText }]}>{item.symbol}</Text>
								<Text style={{ color: theme.colors.secondaryText, fontFamily: theme.typography.fontFamily.regular, fontSize: theme.typography.fontSize.sm }}>{item.chainName}</Text>
							</View>
							<FontAwesome6 name="chevron-right" size={12} color={theme.colors.tertiaryText} iconStyle="solid" />
						</QPPressable>
					))}
				</View>
			</ScrollView>
		)
	}

	return (
		<ScrollView style={containerStyles.subContainer} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>

			<QPPressable onPress={() => navigation.setParams({ assetId: undefined })} style={[styles.assetChip, { backgroundColor: theme.colors.surface }]} accessibilityRole="button" accessibilityLabel={t('crypto.wallet.receive.change')}>
				<AssetIcon logoTick={asset.logoTick} networkTick={asset.networkTick} size={28} />
				<Text style={[textStyles.h4, { color: theme.colors.primaryText }]}>{assetLabel}</Text>
				<Text style={{ color: theme.colors.secondaryText, fontFamily: theme.typography.fontFamily.regular, fontSize: theme.typography.fontSize.sm }}>{asset.chainName}</Text>
				<FontAwesome6 name="chevron-down" size={11} color={theme.colors.secondaryText} iconStyle="solid" />
			</QPPressable>

			<QPPressable onPress={copy} style={styles.qrCard} accessibilityRole="button" accessibilityLabel={t('crypto.wallet.receive.copy')}>
				<QRCodeStyled
					data={address}
					style={styles.qrInner}
					size={qrSize}
					padding={8}
					{...{ pieceSize: 7, errorCorrectionLevel: 'M', backgroundColor: '#FFFFFF' }}
					isPiecesGlued
					pieceBorderRadius={2}
					pieceCornerType={'cut'}
					color={'#000000'}
					outerEyesOptions={{ borderRadius: 2, color: theme.colors.primary }}
				/>
			</QPPressable>

			<Text selectable style={[styles.address, { color: theme.colors.primaryText, fontFamily: theme.typography.fontFamily.medium, fontSize: theme.typography.fontSize.md }]}>
				{address}
			</Text>

			<View style={[styles.warning, { backgroundColor: theme.colors.warning + '14' }]}>
				<FontAwesome6 name="triangle-exclamation" size={14} color={theme.colors.warning} iconStyle="solid" style={styles.warningIcon} />
				<View style={styles.warningTexts}>
					<Text style={[textStyles.h5, { color: theme.colors.primaryText }]}>
						{t('crypto.wallet.receive.warning', { asset: assetLabel, network: asset.chainName })}
					</Text>
					{asset.kind === 'evm' && (
						<Text style={[textStyles.h6, { color: theme.colors.secondaryText }]}>{t('crypto.wallet.receive.evmNote')}</Text>
					)}
				</View>
			</View>

			{(!!bridgeCoin || isHouseToken(asset)) && !!address && (
				<QPPressable
					// QUSD: el swap (1:1, sin comisión, sin teclear direcciones) sustituye al retiro genérico
					onPress={() => (isHouseToken(asset) ? navigation.navigate(ROUTES.WALLET_SWAP, { direction: 'out' }) : navigation.navigate(ROUTES.WITHDRAW, { preselectedCoin: bridgeCoin!.tick, prefillAddress: address }))}
					style={[styles.bridge, { backgroundColor: theme.colors.surface }, !theme.isDark && { borderWidth: StyleSheet.hairlineWidth, borderColor: theme.colors.border }]}
					accessibilityRole="button"
				>
					<View style={[styles.bridgeIcon, { backgroundColor: theme.colors.primary + '15' }]}>
						<FontAwesome6 name="building-columns" size={15} color={theme.colors.primary} iconStyle="solid" />
					</View>
					<View style={styles.bridgeTexts}>
						<Text style={[textStyles.h5, { color: theme.colors.primaryText }]}>{t('crypto.wallet.receive.fromQvaPay')}</Text>
						<Text style={[textStyles.h6, { color: theme.colors.secondaryText }]}>{t('crypto.wallet.receive.fromQvaPayHint', { symbol: assetLabel })}</Text>
					</View>
					<FontAwesome6 name="chevron-right" size={12} color={theme.colors.tertiaryText} iconStyle="solid" />
				</QPPressable>
			)}

			<View style={styles.spacer} />

			<View style={styles.buttons}>
				<View style={styles.button}><QPButton title={t('crypto.wallet.receive.copy')} icon="copy" onPress={copy} /></View>
				<View style={styles.button}><QPButton title={t('crypto.wallet.receive.share')} icon="share-nodes" onPress={share} outlined /></View>
			</View>
		</ScrollView>
	)
}

const styles = StyleSheet.create({
	pickerContent: { gap: 14, paddingBottom: 40 },
	pickerCard: { borderRadius: 14, paddingHorizontal: 12 },
	pickerRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
	pickerInfo: { flex: 1 },
	content: { alignItems: 'center', gap: 16, paddingTop: 8, paddingBottom: 24, flexGrow: 1 },
	spacer: { flex: 1 },
	assetChip: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8, paddingHorizontal: 14, borderRadius: 20 },
	qrCard: { borderRadius: 16, padding: 10, backgroundColor: '#FFFFFF', overflow: 'hidden' },
	qrInner: { backgroundColor: '#FFFFFF' },
	address: { textAlign: 'center', paddingHorizontal: 12, letterSpacing: 0.3 },
	warning: { flexDirection: 'row', gap: 10, padding: 12, borderRadius: 12, alignSelf: 'stretch' },
	warningIcon: { marginTop: 3 },
	warningTexts: { flex: 1, gap: 4 },
	bridge: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 14, alignSelf: 'stretch' },
	bridgeIcon: { width: 36, height: 36, borderRadius: 12, borderCurve: 'continuous', alignItems: 'center', justifyContent: 'center' },
	bridgeTexts: { flex: 1, gap: 2 },
	buttons: { flexDirection: 'row', gap: 10, alignSelf: 'stretch' },
	button: { flex: 1 },
})

export default WalletReceive
