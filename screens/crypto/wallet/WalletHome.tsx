import { useCallback, useEffect, useRef } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner-native'
import FontAwesome6 from '@react-native-vector-icons/fontawesome6'
import { useNavigation } from '@react-navigation/native'
import type { NavigationProp } from '@react-navigation/native'

// Theme
import { useTheme } from '../../../theme/ThemeContext'
import type { Theme } from '../../../theme/ThemeContext'

// Wallet
import { useWallet } from '../../../wallet/WalletContext'
import { assetPrice } from '../../../wallet/assets'
import type { AssetView } from '../../../wallet/assets'
import { usePriceMap, useWalletAssets } from './walletQueries'
import { formatUsd } from './walletFormat'

// Settings
import { useSettings } from '../../../settings/SettingsContext'

// Auth: sin sesión (modo wallet) se ocultan swap y P2P, que viven en el backend
import { useAuth } from '../../../auth/AuthContext'

// UI
import QPPressable from '../../../ui/particles/QPPressable'
import QPSkeleton from '../../../ui/particles/QPSkeleton'
import WalletCard from './WalletCard'
import WalletBalanceCard from './components/WalletBalanceCard'
import type { WalletAction } from './components/WalletBalanceCard'
import WalletAssetRow from './components/WalletAssetRow'
import { isDevBuild, isStakingHubEnabled } from '../../../wallet/staking/capabilities'

// Navigation
import { ROUTES } from '../../../routes'
import type { MainTabParamList, RootStackParamList } from '../../../types/navigation'

type Nav = NavigationProp<RootStackParamList & MainTabParamList>

const SKELETON_ROWS = 4

const AssetSkeleton = ({ theme }: { theme: Theme }) => (
	<View style={[styles.skeletonRow, { borderBottomColor: theme.colors.border + '60' }]}>
		<QPSkeleton width={40} height={40} borderRadius={20} />
		<View style={styles.skeletonText}>
			<QPSkeleton width={90} height={14} />
			<QPSkeleton width={60} height={12} />
		</View>
		<View style={styles.skeletonAmounts}>
			<QPSkeleton width={70} height={14} />
			<QPSkeleton width={50} height={12} />
		</View>
	</View>
)

/**
 * Home de la wallet self-custody en el tab Crypto (patrón Trust/SafePal):
 * total USD + botonera, lista de activos por red y acceso a "Gestionar
 * activos". Sin wallet o con el backup a medias, cede el sitio a WalletCard.
 *
 * `refreshSignal`: flanco de subida del pull-to-refresh del tab (mismo
 * contrato que BalanceCard en el Home), para revalidar saldos on-chain que no
 * cuelgan de la raíz `['crypto']`.
 */
const WalletHome = ({ refreshSignal = false }: { refreshSignal?: boolean }) => {

	const { t } = useTranslation()
	const { theme } = useTheme()
	const navigation = useNavigation<Nav>()

	const { isReady, hasWallet, isBackedUp } = useWallet()
	const { isAuthenticated } = useAuth()
	const { visible, total, isLoading, isHydrating, isError, failedChains, hasBalances, refetch } = useWalletAssets()
	const prices = usePriceMap()

	const { getSetting, updateSetting } = useSettings()
	const showBalance = getSetting('privacy', 'showBalance', true) as boolean
	const toggleBalance = useCallback(() => { updateSetting('privacy', 'showBalance', !showBalance) }, [showBalance, updateSetting])

	useEffect(() => { if (refreshSignal && hasWallet) refetch() }, [refreshSignal, hasWallet, refetch])

	// Toast de error solo sin nada que pintar (convención de la app)
	const errorShownRef = useRef(false)
	useEffect(() => {
		if (isError && !errorShownRef.current) toast.error(t('crypto.wallet.home.loadError'))
		errorShownRef.current = isError
	}, [isError, t])

	const openAsset = useCallback((asset: AssetView) => {
		navigation.navigate(ROUTES.WALLET_ASSET, { assetId: asset.id })
	}, [navigation])

	// Hasta hidratar la wallet y sembrar la foto de disco (milisegundos): nada antes que un skeleton de un frame
	if (!isReady || (hasWallet && isHydrating)) return null
	if (!hasWallet) return <WalletCard />

	// Recibir exige el backup confirmado: sin él, perder el teléfono = perder lo recibido
	const requireBackup = (next: () => void) => () => (isBackedUp ? next() : navigation.navigate(ROUTES.WALLET_BACKUP))

	// Swap y P2P son del backend (exigen sesión): el modo wallet no los muestra
	const accountActions: WalletAction[] = [
		// Swap saldo ↔ QUSD: mueve saldo custodial a la wallet, así que exige el backup igual que Recibir
		{ icon: 'arrows-rotate', testID: 'wallet-action-swap', label: t('crypto.wallet.home.actions.swap'), onPress: requireBackup(() => navigation.navigate(ROUTES.WALLET_SWAP, undefined)) },
		{ icon: 'arrow-right-arrow-left', testID: 'wallet-action-p2p', label: t('crypto.wallet.home.actions.p2p'), onPress: () => navigation.navigate(ROUTES.P2P_SCREEN) },
	]

	const actions: WalletAction[] = [
		{ icon: 'paper-plane', testID: 'wallet-action-send', label: t('crypto.wallet.home.actions.send'), onPress: requireBackup(() => navigation.navigate(ROUTES.WALLET_SEND, undefined)) },
		{ icon: 'qrcode', testID: 'wallet-action-receive', label: t('crypto.wallet.home.actions.receive'), onPress: requireBackup(() => navigation.navigate(ROUTES.WALLET_RECEIVE, undefined)) },
		...(isAuthenticated ? accountActions : []),
	]

	// Sin sesión se entra DIRECTO al panel de la wallet: el menú de Ajustes que
	// quedaría debajo (initial:false) es el de la cuenta y cuelga del usuario
	const openSecurity = () => navigation.navigate(ROUTES.SETTINGS_STACK, { screen: ROUTES.WALLET_SETTINGS, initial: !isAuthenticated })

	// Staking: la tarjeta solo existe cuando alguna red ya sabe firmarlo (o en desarrollo)
	const showEarn = isStakingHubEnabled({ dev: isDevBuild() })
	const stakedTotal = visible.reduce((sum, asset) => {
		const price = asset.hasStake ? assetPrice(asset, prices) : null
		return price === null ? sum : sum + Number(asset.staked) * price
	}, 0)

	const notice = failedChains.length > 0 && hasBalances
		? t('crypto.wallet.home.staleChains', { count: failedChains.length })
		: null

	return (
		<View style={styles.container}>
			<WalletBalanceCard
				total={total}
				showBalance={showBalance}
				onToggleBalance={toggleBalance}
				loading={isLoading}
				actions={actions}
			/>

			{/* Ganar: justo bajo la botonera, a la vista sin bajar hasta el final de la lista */}
			{showEarn && (
				<QPPressable
					onPress={() => navigation.navigate(ROUTES.WALLET_EARN)}
					testID="wallet-home-earn"
					style={[styles.earnCard, { backgroundColor: theme.colors.surface }, !theme.isDark && { borderWidth: StyleSheet.hairlineWidth, borderColor: theme.colors.border }]}
					accessibilityRole="button"
				>
					<View style={[styles.earnIcon, { backgroundColor: theme.colors.successText + '18' }]}>
						<FontAwesome6 name="seedling" size={16} color={theme.colors.successText} iconStyle="solid" />
					</View>
					<View style={styles.earnInfo}>
						<Text style={{ color: theme.colors.primaryText, fontFamily: theme.typography.fontFamily.semiBold, fontSize: theme.typography.fontSize.md }}>{t('crypto.staking.hub.homeCardTitle')}</Text>
						<Text style={{ color: theme.colors.secondaryText, fontFamily: theme.typography.fontFamily.regular, fontSize: theme.typography.fontSize.sm }} numberOfLines={1}>
							{stakedTotal > 0 && showBalance
								? t('crypto.staking.hub.homeCardStaked', { amount: formatUsd(stakedTotal) })
								: t('crypto.staking.hub.homeCardSubtitle')}
						</Text>
					</View>
					<FontAwesome6 name="chevron-right" size={12} color={theme.colors.tertiaryText} iconStyle="solid" />
				</QPPressable>
			)}

			{!isBackedUp && <WalletCard />}

			{/* Aviso fuera del héroe: el bloque saldo + botonera mide lo mismo que en el Home */}
			{!!notice && (
				<Text style={[styles.notice, { color: theme.colors.warning, fontFamily: theme.typography.fontFamily.regular, fontSize: theme.typography.fontSize.xs }]}>
					{notice}
				</Text>
			)}

			<View style={[styles.assetsCard, { backgroundColor: theme.colors.surface }, !theme.isDark && { borderWidth: StyleSheet.hairlineWidth, borderColor: theme.colors.border }]}>
				{isLoading
					? Array.from({ length: SKELETON_ROWS }, (_, i) => <AssetSkeleton key={i} theme={theme} />)
					: visible.map((asset, index) => (
						<WalletAssetRow
							key={asset.id}
							asset={asset}
							prices={prices}
							showBalance={showBalance}
							isLast={index === visible.length - 1}
							onPress={openAsset}
						/>
					))}

				<View style={[styles.footerRow, { borderTopColor: theme.colors.border + '60' }]}>
					<QPPressable onPress={() => navigation.navigate(ROUTES.WALLET_MANAGE_ASSETS)} testID="wallet-home-manage" style={styles.manage} accessibilityRole="button">
						<FontAwesome6 name="sliders" size={13} color={theme.colors.primary} iconStyle="solid" />
						<Text style={{ color: theme.colors.primary, fontFamily: theme.typography.fontFamily.medium, fontSize: theme.typography.fontSize.sm }}>
							{t('crypto.wallet.home.manageAssets')}
						</Text>
					</QPPressable>
					<View style={[styles.footerDivider, { backgroundColor: theme.colors.border + '60' }]} />
					<QPPressable onPress={openSecurity} testID="wallet-home-security" style={styles.manage} accessibilityRole="button">
						<FontAwesome6 name="shield-halved" size={13} color={theme.colors.primary} iconStyle="solid" />
						<Text style={{ color: theme.colors.primary, fontFamily: theme.typography.fontFamily.medium, fontSize: theme.typography.fontSize.sm }}>
							{t('crypto.wallet.home.security')}
						</Text>
					</QPPressable>
				</View>
			</View>

		</View>
	)
}

const styles = StyleSheet.create({
	container: { gap: 12 },
	notice: { textAlign: 'center', paddingHorizontal: 20 },
	assetsCard: { borderRadius: 14, paddingHorizontal: 12, paddingTop: 2 },
	footerRow: { flexDirection: 'row', alignItems: 'stretch', borderTopWidth: StyleSheet.hairlineWidth },
	footerDivider: { width: StyleSheet.hairlineWidth, marginVertical: 10 },
	manage: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14 },
	skeletonRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
	skeletonText: { flex: 1, gap: 6 },
	skeletonAmounts: { alignItems: 'flex-end', gap: 6 },
	earnCard: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 14, padding: 14 },
	earnIcon: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
	earnInfo: { flex: 1, minWidth: 0, gap: 2 },
})

export default WalletHome
