import { useEffect } from 'react'
import type { ComponentProps, ReactElement } from 'react'
import { useSharedValue } from 'react-native-reanimated'
import { useTranslation } from 'react-i18next'
import useContentPadding from '../../hooks/useContentPadding'
import { View, Text, StyleSheet, ScrollView, Pressable, Linking, Platform } from 'react-native'
import type { PlatformIOSStatic, RefreshControlProps } from 'react-native'

// Auth Context
import { useAuth } from '../../auth/AuthContext'

// Theme Context
import { useTheme } from '../../theme/ThemeContext'
import { useContainerStyles, useTextStyles } from '../../theme/themeUtils'

// Home feed data (profile, transactions, quick-pay, blog, watchlist, promo, aviso)
import useHomeFeed from './useHomeFeed'

// UI Particles
import QPTransaction from '../../ui/particles/QPTransaction'
import BalanceCard from '../../ui/BalanceCard'
import ActionButtons from '../../ui/ActionButtons'
import QPAvatar from '../../ui/particles/QPAvatar'
import BlogPostCard from '../../ui/BlogPostCard'
import QPSectionHeader from '../../ui/particles/QPSectionHeader'
import WatchlistCard from '../../ui/WatchlistCard'
import PromoBanner from '../../ui/PromoBanner'
import AnnouncementBanner from '../../ui/AnnouncementBanner'
import CashDeliveryCard from '../../ui/CashDeliveryCard'
import TransactionSkeleton from '../../ui/TransactionSkeleton'
import EmptyTransactions from '../../ui/EmptyTransactions'

// Icons
import FontAwesome6 from '@react-native-vector-icons/fontawesome6'

// Routes
import { ROUTES } from '../../routes'

// Online Status
import { useOnlineStatus } from '../../hooks/OnlineStatusContext'

// Pull-to-refresh
import { createHiddenRefreshControl } from '../../ui/QPRefreshIndicator'

// Push prompt
import usePushPrompt from '../../hooks/usePushPrompt'
import useKycPrompt from '../../hooks/useKycPrompt'

// Update prompt
import UpdatePromptModal from '../../ui/UpdatePromptModal'

// Tipos
import type { CompositeScreenProps, NavigationProp } from '@react-navigation/native'
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import type { MainTabParamList, RootStackParamList } from '../../types/navigation'
import type { Theme } from '../../theme/ThemeContext'
import type { EnrichedCoin } from '../../types/domain'
import type { FontAwesome6SolidIconName } from '@react-native-vector-icons/fontawesome6'

/**
 * Home vive dentro de los tabs de MainStack pero navega a rutas del stack raíz
 * (Send, Transactions, Add…): de ahí el prop compuesto.
 */
type HomeProps = CompositeScreenProps<
	BottomTabScreenProps<MainTabParamList, 'Home'>,
	NativeStackScreenProps<RootStackParamList>
>

type HomeNavigation = HomeProps['navigation']

/**
 * Los componentes compartidos (BalanceCard, QPTransaction, EmptyTransactions,
 * CashDeliveryCard) declaran `NavigationProp<RootStackParamList>`. El prop
 * compuesto de un tab NO es asignable a ese tipo (React Navigation ata el
 * genérico del `dispatch` al state del navigator), aunque en runtime sea
 * exactamente el mismo objeto: de ahí el cast en cada call site.
 */
type RootNav = NavigationProp<RootStackParamList>

type ServiceCardProps = {
	icon: FontAwesome6SolidIconName
	title: string
	iconColor: string
	onPress: () => void
	theme: Theme
}

// Service Card Component
const ServiceCard = ({ icon, title, iconColor, onPress, theme }: ServiceCardProps) => (
	<Pressable
		onPress={onPress}
		style={({ pressed }) => [
			styles.serviceCard,
			{
				backgroundColor: theme.colors.surface,
				transform: [{ scale: pressed ? 0.97 : 1 }]
			},
			themeMode(theme) === 'light' && {
				borderWidth: 1,
				borderColor: theme.colors.border,
			}
		]}
	>
		<View style={[styles.serviceCardIcon, { backgroundColor: iconColor + '20' }]}>
			<FontAwesome6 name={icon} size={22} color={iconColor} iconStyle="solid" />
		</View>
		<Text style={[styles.serviceCardTitle, { color: theme.colors.primaryText, fontSize: theme.typography.fontSize.sm, fontFamily: theme.typography.fontFamily.medium }]}>{title}</Text>
	</Pressable>
)

/**
 * OJO (pre-existente, NO tocado): el theme expone `isDark`, no `mode`, así que
 * la comparación contra 'light' es siempre falsa en runtime y el borde de las
 * cards claras nunca se pinta. Se conserva tal cual con un cast local.
 */
const themeMode = (theme: Theme) => (theme as Theme & { mode?: 'light' | 'dark' }).mode

type KycPromptBannerProps = {
	theme: Theme
	navigation: HomeNavigation
	prompt: ReturnType<typeof useKycPrompt>
}

// Empuje sutil a verificar la identidad — mismo layout que el banner de push,
// gobernado por useKycPrompt (descartes + cooldown + gracia post-sesión Didit)
const KycPromptBanner = ({ theme, navigation, prompt }: KycPromptBannerProps) => {
	const { t } = useTranslation()
	const { shouldShowBanner, dismissBanner } = prompt
	if (!shouldShowBanner) return null
	return (
		<View style={[styles.pushBanner, { backgroundColor: theme.colors.surface }, themeMode(theme) === 'light' && { borderWidth: 1, borderColor: theme.colors.border }]}>
			<View style={[styles.pushBannerIcon, { backgroundColor: theme.colors.primary + '20' }]}>
				<FontAwesome6 name="shield-halved" size={16} color={theme.colors.primary} iconStyle="solid" />
			</View>
			<View style={{ flex: 1 }}>
				<Text style={[styles.pushBannerText, { color: theme.colors.primaryText, fontSize: theme.typography.fontSize.sm, fontFamily: theme.typography.fontFamily.regular }]}>{t('home.banners.kyc.text')}</Text>
			</View>
			<Pressable
				onPress={() => navigation.navigate(ROUTES.SETTINGS_STACK, { screen: ROUTES.KYC, initial: false })}
				style={[styles.pushBannerButton, { backgroundColor: theme.colors.primary }]}
			>
				<Text style={[styles.pushBannerButtonText, { color: theme.colors.almostWhite, fontSize: theme.typography.fontSize.sm, fontFamily: theme.typography.fontFamily.medium }]}>{t('home.banners.kyc.action')}</Text>
			</Pressable>
			<Pressable onPress={dismissBanner} hitSlop={8}>
				<FontAwesome6 name="xmark" size={14} color={theme.colors.tertiaryText} iconStyle="solid" />
			</Pressable>
		</View>
	)
}

// Invitación a activar las push — se auto-oculta según usePushPrompt
const PushPromptBanner = ({ theme }: { theme: Theme }) => {
	const { t } = useTranslation()
	const { shouldShowBanner, enablePush, dismissBanner } = usePushPrompt()
	if (!shouldShowBanner) return null
	return (
		<View style={[styles.pushBanner, { backgroundColor: theme.colors.surface }, themeMode(theme) === 'light' && { borderWidth: 1, borderColor: theme.colors.border }]}>
			<View style={[styles.pushBannerIcon, { backgroundColor: theme.colors.primary + '20' }]}>
				<FontAwesome6 name="bell" size={16} color={theme.colors.primary} iconStyle="solid" />
			</View>
			<View style={{ flex: 1 }}>
				<Text style={[styles.pushBannerText, { color: theme.colors.primaryText, fontSize: theme.typography.fontSize.sm, fontFamily: theme.typography.fontFamily.regular }]}>{t('home.banners.push.text')}</Text>
			</View>
			<Pressable
				onPress={() => { enablePush(); dismissBanner() }}
				style={[styles.pushBannerButton, { backgroundColor: theme.colors.primary }]}
			>
				<Text style={[styles.pushBannerButtonText, { color: theme.colors.almostWhite, fontSize: theme.typography.fontSize.sm, fontFamily: theme.typography.fontFamily.medium }]}>{t('home.banners.push.action')}</Text>
			</Pressable>
			<Pressable onPress={dismissBanner} hitSlop={8}>
				<FontAwesome6 name="xmark" size={14} color={theme.colors.tertiaryText} iconStyle="solid" />
			</Pressable>
		</View>
	)
}

/**
 * Home Screen — main dashboard with balance, quick actions and a personalized feed.
 * All data fetching lives in `useHomeFeed` (fans out independent fetches on mount,
 * pull-to-refresh re-runs everything plus the store-update check, which can surface
 * `UpdatePromptModal`). Quick-pay users are tracked for live online status
 * (OnlineStatusContext).
 */
const Home = ({ navigation }: HomeProps) => {

	// User Context
	const { user } = useAuth()

	// Idioma activo
	const { t } = useTranslation()

	// Context
	const { theme } = useTheme()
	const containerStyles = useContainerStyles(theme)
	const textStyles = useTextStyles(theme)
	const contentPadding = useContentPadding(20)

	// Online status
	const { trackUsers, untrackUsers, isUserOnline } = useOnlineStatus()

	// Nudge de verificación de identidad (prioridad sobre el banner de push:
	// solo uno a la vez para no apilar avisos)
	const kycPrompt = useKycPrompt()

	// Progreso continuo del pager del BalanceCard (0 = cuenta, 1 = ahorros) —
	// lo escribe el scroll del card y lo consume ActionButtons para morphear
	// la botonera al ritmo del dedo
	const balancePageProgress = useSharedValue(0)

	// Feed data + refresh
	const {
		latestTransactions,
		latestSentTransfersUsers,
		latestBlogPosts,
		watchlistData,
		promo,
		announcement,
		updateInfo,
		txLoading,
		txError,
		refreshing,
		onRefresh,
		dismissUpdate,
	} = useHomeFeed()

	// Track quick-pay users for online status
	useEffect(() => {
		const ids = latestSentTransfersUsers.map(u => u.uuid).filter(Boolean)
		if (ids.length) trackUsers(ids)
		return () => { if (ids.length) untrackUsers(ids) }
	}, [latestSentTransfersUsers, trackUsers, untrackUsers])

	return (
		<View style={[containerStyles.subContainer]}>
			{/* Cast del refreshControl: `createHiddenRefreshControl` declara
			    `ReactElement` (props `unknown`) y ScrollView pide
			    `ReactElement<RefreshControlProps>` — el elemento ES un RefreshControl */}
			<ScrollView style={styles.scrollView} contentContainerStyle={contentPadding} showsVerticalScrollIndicator={false} refreshControl={createHiddenRefreshControl(refreshing, onRefresh) as ReactElement<RefreshControlProps>}>

				{/* Aviso global del panel admin (misma fuente que la barra del
				    dashboard web). Va ENCIMA de la promo y es otra cosa: esto es
				    comunicación operativa y se descarta; la promo es una oferta */}
				<AnnouncementBanner announcement={announcement} navigation={navigation as unknown as RootNav} />

				{/* `promo` viaja como `unknown` desde promoApi (el endpoint no está
				    tipado): se estrecha aquí a la forma que lee el banner */}
				<PromoBanner promo={promo as ComponentProps<typeof PromoBanner>['promo']} />

				{/* `user` y `balance` son opcionales en el tipo pero esta pantalla solo
				    se monta autenticada (MainStack corta si no hay user): aserción, sin
				    tocar el runtime */}
				<BalanceCard balance={user!.balance!} navigation={navigation as unknown as RootNav} refreshing={refreshing} pageProgress={balancePageProgress} />

				<ActionButtons navigation={navigation} pageProgress={balancePageProgress} />

				{kycPrompt.shouldShowBanner
					? <KycPromptBanner theme={theme} navigation={navigation} prompt={kycPrompt} />
					: <PushPromptBanner theme={theme} />}

				<View style={styles.section}>
					<QPSectionHeader title={t('home.sections.quickPay')} subtitle={t('common.actions.seeAll')} iconName="arrow-right" onPress={() => navigation.navigate(ROUTES.SEND)} />
					<ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 0 }}>
						<View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
							<Pressable onPress={() => navigation.navigate(ROUTES.SEND)} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
								<View style={{ backgroundColor: theme.colors.elevation, height: 56, width: 56, borderRadius: 28, justifyContent: 'center', alignItems: 'center' }}>
									<FontAwesome6 name="plus" size={24} color={theme.colors.primary} iconStyle="solid" />
								</View>
								{latestSentTransfersUsers.length === 0 && (
									<Text style={{ color: theme.colors.secondaryText, fontSize: theme.typography.fontSize.sm, fontFamily: theme.typography.fontFamily.regular }}>{t('home.quickPay.sendFirst')}</Text>
								)}
							</Pressable>
							{latestSentTransfersUsers.map((transferUser) => (
								<Pressable key={transferUser.uuid} onPress={() => navigation.navigate(ROUTES.SEND, { user_uuid: transferUser.uuid, send_amount: '0.00' })}>
									<QPAvatar user={transferUser} size={56} isOnline={isUserOnline(transferUser.uuid)} />
								</Pressable>
							))}
						</View>
					</ScrollView>
				</View>

				<View style={styles.section}>
					<View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
						<Text style={[textStyles.h5, { color: theme.colors.tertiaryText }]}>{t('home.sections.latestTransactions')}</Text>
						{latestTransactions.length > 0 && (
							<Pressable onPress={() => navigation.navigate(ROUTES.TRANSACTIONS, { showSearch: true })} hitSlop={8}>
								<FontAwesome6 name="magnifying-glass" size={16} color={theme.colors.tertiaryText} iconStyle="solid" />
							</Pressable>
						)}
					</View>
					{latestTransactions.length > 0 ? (
						<>
							<View>
								{latestTransactions.map((transaction, index) => (
									<QPTransaction key={transaction.uuid} transaction={transaction} navigation={navigation as unknown as RootNav} index={index} totalItems={latestTransactions.length} />
								))}
							</View>
							<Pressable onPress={() => navigation.navigate(ROUTES.TRANSACTIONS)} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }} >
								<Text style={{ color: theme.colors.primary, fontSize: theme.typography.fontSize.sm, fontFamily: theme.typography.fontFamily.medium }}>{t('common.actions.seeAll')}</Text>
								<FontAwesome6 name="chevron-right" size={12} color={theme.colors.primary} iconStyle="solid" />
							</Pressable>
						</>
					) : txLoading || txError ? (
						// txError sin datos (sin conexión y sin cache): skeletons en vez del
						// empty state — "no tienes transacciones" sería mentira
						<View>
							{[0, 1, 2].map(i => (
								<TransactionSkeleton key={i} index={i} totalItems={3} />
							))}
						</View>
					) : (
						<EmptyTransactions navigation={navigation as unknown as RootNav} />
					)}
				</View>

				{/* Cash Delivery Card: con KYC solo desde balance >= 200; sin KYC
				    se muestra siempre, sombreada y gateada (invita a verificarse) */}
				{(!user!.kyc || Number(user!.balance) >= 200) && (<CashDeliveryCard navigation={navigation as unknown as RootNav} />)}

				{/* Service Cards */}
				<View style={styles.section}>
					<QPSectionHeader title={t('home.sections.services')} subtitle={t('common.actions.seeAll')} iconName="arrow-right" onPress={() => navigation.navigate(ROUTES.STORE_SCREEN)} />
					<View style={styles.serviceCardsContainer}>
						<ServiceCard
							icon="mobile-screen"
							title={t('home.services.topups')}
							iconColor="#10B981"
							onPress={() => navigation.navigate(ROUTES.PHONE_TOPUP_INDEX)}
							theme={theme}
						/>
						{Platform.OS !== 'ios' && (
							<ServiceCard
								icon="gift"
								title={t('home.services.giftCards')}
								iconColor="#8B5CF6"
								onPress={() => navigation.navigate(ROUTES.STORE_SCREEN)}
								theme={theme}
							/>
						)}
						<ServiceCard
							icon="chart-line"
							title={t('home.services.invest')}
							iconColor="#F59E0B"
							onPress={() => navigation.navigate(ROUTES.INVEST_SCREEN)}
							theme={theme}
						/>
						<ServiceCard
							icon="building-columns"
							title={t('home.services.p2p')}
							iconColor={theme.colors.primary}
							onPress={() => navigation.navigate(ROUTES.P2P_SCREEN)}
							theme={theme}
						/>
					</View>
				</View>

				{watchlistData.length > 0 && (
					<View style={styles.section}>
						<QPSectionHeader title={t('home.sections.watchlist')} subtitle={t('home.watchlist.seeAll')} iconName="arrow-right" onPress={() => navigation.navigate(ROUTES.INVEST_SCREEN)} />
						<View style={styles.watchlistGrid}>
							{watchlistData.map(coin => (
								<WatchlistCard
									key={coin.tick}
									coin={coin}
									// La fila ya trae precio, cambio 24h e historial: se pasan
									// como initialData para que el detalle pinte al instante
									// La fila de la watchlist NO es una Coin del catálogo
									// (solo tick/precio/cambio/histórico), pero es lo que
									// CoinDetail recibe hoy como initialData — cast local,
									// el dato viaja igual que antes
									onPress={() => navigation.navigate(ROUTES.COIN_DETAIL_SCREEN, {
										tick: coin.tick,
										name: coin.tick,
										initialData: coin as unknown as EnrichedCoin,
									})}
								/>
							))}
						</View>
					</View>
				)}

				<View style={styles.section}>
					<QPSectionHeader title={t('home.sections.news')} subtitle={t('common.actions.seeAll')} iconName="arrow-right" onPress={() => Linking.openURL('https://qvapay.blog')} />
					<View style={(Platform as PlatformIOSStatic).isPad ? styles.blogGrid : undefined}>
						{latestBlogPosts.map((post, index) => (
							<BlogPostCard key={post.id} post={post} index={index} totalItems={latestBlogPosts.length} iPad={(Platform as PlatformIOSStatic).isPad} />
						))}
					</View>
				</View>

			</ScrollView>

			<UpdatePromptModal
				visible={!!updateInfo?.needsUpdate}
				currentVersion={updateInfo?.currentVersion}
				latestVersion={updateInfo?.latestVersion}
				storeUrl={updateInfo?.storeUrl}
				onDismiss={dismissUpdate}
			/>
		</View>
	)
}

const styles = StyleSheet.create({
	scrollView: {
		flex: 1,
	},
	section: {
		marginVertical: 10,
		gap: 8,
	},
	// Service Cards
	watchlistGrid: {
		flexDirection: 'row',
		flexWrap: 'wrap',
		gap: 10,
	},
	serviceCardsContainer: {
		flexDirection: 'row',
		flexWrap: 'wrap',
		gap: 10,
	},
	serviceCard: {
		flexBasis: (Platform as PlatformIOSStatic).isPad ? '22%' : '46%',
		flexGrow: 1,
		borderRadius: 12,
		padding: 14,
		alignItems: 'center',
		gap: 10,
	},
	serviceCardIcon: {
		width: 48,
		height: 48,
		borderRadius: 24,
		justifyContent: 'center',
		alignItems: 'center',
	},
	serviceCardTitle: {},
	blogGrid: {
		flexDirection: 'row',
		flexWrap: 'wrap',
		gap: 12,
	},
	// Push banner
	pushBanner: {
		flexDirection: 'row',
		alignItems: 'center',
		borderRadius: 12,
		padding: 12,
		marginVertical: 10,
		gap: 10,
	},
	pushBannerIcon: {
		width: 36,
		height: 36,
		borderRadius: 18,
		justifyContent: 'center',
		alignItems: 'center',
	},
	pushBannerText: {},
	pushBannerButton: {
		borderRadius: 8,
		paddingHorizontal: 12,
		paddingVertical: 6,
	},
	pushBannerButtonText: {},
})

export default Home
