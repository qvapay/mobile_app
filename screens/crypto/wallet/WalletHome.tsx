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
import type { AssetView } from '../../../wallet/assets'
import { usePriceMap, useWalletAssets } from './walletQueries'

// Settings
import { useSettings } from '../../../settings/SettingsContext'

// UI
import QPPressable from '../../../ui/particles/QPPressable'
import QPSkeleton from '../../../ui/particles/QPSkeleton'
import WalletCard from './WalletCard'
import WalletBalanceCard from './components/WalletBalanceCard'
import type { WalletAction } from './components/WalletBalanceCard'
import WalletAssetRow from './components/WalletAssetRow'

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
	const { visible, total, isLoading, isError, failedChains, hasBalances, refetch } = useWalletAssets()
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

	if (!isReady) return null
	if (!hasWallet) return <WalletCard />

	// Recibir exige el backup confirmado: sin él, perder el teléfono = perder lo recibido
	const requireBackup = (next: () => void) => () => (isBackedUp ? next() : navigation.navigate(ROUTES.WALLET_BACKUP))

	const actions: WalletAction[] = [
		{ icon: 'paper-plane', label: t('crypto.wallet.home.actions.send'), dimmed: true, onPress: () => toast(t('crypto.wallet.home.sendSoon')) },
		{ icon: 'qrcode', label: t('crypto.wallet.home.actions.receive'), onPress: requireBackup(() => navigation.navigate(ROUTES.WALLET_RECEIVE, undefined)) },
		{ icon: 'arrow-right-arrow-left', label: t('crypto.wallet.home.actions.p2p'), onPress: () => navigation.navigate(ROUTES.P2P_SCREEN) },
	]

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

				<QPPressable onPress={() => navigation.navigate(ROUTES.WALLET_MANAGE_ASSETS)} style={[styles.manage, { borderTopColor: theme.colors.border + '60' }]} accessibilityRole="button">
					<FontAwesome6 name="sliders" size={13} color={theme.colors.primary} iconStyle="solid" />
					<Text style={{ color: theme.colors.primary, fontFamily: theme.typography.fontFamily.medium, fontSize: theme.typography.fontSize.sm }}>
						{t('crypto.wallet.home.manageAssets')}
					</Text>
				</QPPressable>
			</View>
		</View>
	)
}

const styles = StyleSheet.create({
	container: { gap: 12 },
	notice: { textAlign: 'center', paddingHorizontal: 20 },
	assetsCard: { borderRadius: 14, paddingHorizontal: 12, paddingTop: 2 },
	manage: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, borderTopWidth: StyleSheet.hairlineWidth },
	skeletonRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
	skeletonText: { flex: 1, gap: 6 },
	skeletonAmounts: { alignItems: 'flex-end', gap: 6 },
})

export default WalletHome
