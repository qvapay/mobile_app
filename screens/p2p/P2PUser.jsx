import { useState, useCallback } from "react"
import { useTranslation } from "react-i18next"
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, Linking, Share, useWindowDimensions } from "react-native"
import FastImage from "@d11/react-native-fast-image"
import LinearGradient from "react-native-linear-gradient"
import { useSafeAreaInsets } from "react-native-safe-area-context"

// Theme
import { useTheme } from "../../theme/ThemeContext"
import { createTextStyles, createContainerStyles } from "../../theme/themeUtils"

// API
import { p2pApi } from "../../api/p2pApi"
import { unwrap } from "../../api/unwrap"
import { useQuery } from "@tanstack/react-query"

// UI
import QPAvatar from "../../ui/particles/QPAvatar"
import QPCoin from "../../ui/particles/QPCoin"
import P2POfferItem from "../../ui/P2POfferItem"
import { createHiddenRefreshControl } from "../../ui/QPRefreshIndicator"

// Icons
import FontAwesome6 from "@react-native-vector-icons/fontawesome6"

// Toast
import { toast } from "sonner-native"

// Routes
import { ROUTES } from "../../routes"

// Helpers
import { displayName } from "../../helpers/displayName"

// i18n — locale de fechas/números acorde al idioma activo
import { getDateLocale } from "../../i18n"

// Cover total (status bar incluido) = 20% del alto de pantalla
const COVER_HEIGHT_RATIO = 0.2
const DEFAULT_COVER = "https://media.qvapay.com/covers/timeline.jpg"
const MEDIA_BASE = "https://media.qvapay.com/"

// Los labels se resuelven con t() en el render (`p2p.user.tabs.*`) — sin copy
// en constantes de módulo
const TABS = [{ id: "offers" }, { id: "reviews" }, { id: "stats" }]

function formatUSD(value) {
	const num = Number(value || 0)
	if (num >= 1_000_000) return `$${(num / 1_000_000).toFixed(2)}M`
	if (num >= 1_000) return `$${(num / 1_000).toFixed(1)}k`
	return `$${num.toFixed(2)}`
}

function formatMinutes(min) {
	if (!min || Number(min) === 0) return "—"
	const m = Number(min)
	if (m < 60) return `${Math.round(m)} min`
	const h = Math.floor(m / 60)
	const rem = Math.round(m % 60)
	return rem > 0 ? `${h}h ${rem}m` : `${h}h`
}

function formatJoinDate(date) {
	if (!date) return "—"
	const d = new Date(date)
	return d.toLocaleDateString(getDateLocale(), { month: "short", year: "numeric" })
}

function formatRatingDate(date) {
	if (!date) return ""
	const d = new Date(date)
	return d.toLocaleDateString(getDateLocale(), { day: "2-digit", month: "short", year: "numeric" })
}

/** Perfil público completo del trader (usuario, stats, ofertas, reseñas). */
const usePeerProfileQuery = (uuid) => useQuery({
	queryKey: ['p2p', 'user', uuid],
	queryFn: async () => unwrap(await p2pApi.peerProfile(uuid)),
	enabled: !!uuid,
	placeholderData: previous => previous,
})

/**
 * Public P2P trader profile: cover photo, stats, active offers and reviews in tabs.
 * Route params: `uuid` (required) and optional `initialTab` ("offers" | "reviews" | "stats").
 * Everything loads in one call via `p2pApi.peerProfile(uuid)` — user, stats, ranking,
 * active offers, received/sent ratings; gold-gated sections trust the server's
 * `viewer_gold` flag rather than any locally-cached value.
 * The native header is disabled: the cover image extends behind the status bar.
 */
const P2PUser = ({ navigation, route }) => {

	const { t } = useTranslation()
	const { uuid, initialTab } = route.params
	const { theme } = useTheme()
	const textStyles = createTextStyles(theme)
	const containerStyles = createContainerStyles(theme)
	const insets = useSafeAreaInsets()

	// Cover extends behind the status bar (header is disabled for this screen).
	// Proportional height: the status bar is part of the 20%.
	const { height: windowHeight } = useWindowDimensions()
	const topOverlay = insets.top
	const totalCoverHeight = Math.round(windowHeight * COVER_HEIGHT_RATIO)

	// Perfil en React Query (clave por uuid: volver a un trader pinta de caché)
	const profileQuery = usePeerProfileQuery(uuid)
	const { data } = profileQuery
	const loading = profileQuery.isPending
	const error = profileQuery.error?.message || null
	const [refreshing, setRefreshing] = useState(false)
	const [activeTab, setActiveTab] = useState(initialTab === "reviews" || initialTab === "stats" ? initialTab : "offers")
	const [reviewMode, setReviewMode] = useState("received")

	const { refetch: fetchProfile } = profileQuery
	const onRefresh = useCallback(async () => {
		setRefreshing(true)
		try {
			const res = await fetchProfile()
			if (res.error) toast.error(res.error.message)
		} finally { setRefreshing(false) }
	}, [fetchProfile])

	// Source of truth is the server. Never trust a locally-cached flag
	// (AsyncStorage may keep stringy/stale values that bypass the gate).
	const viewerGold = data?.viewer_gold === true
	const isSelf = data?.is_self === true
	const user = data?.user
	const stats = data?.stats || {}
	const ranking = data?.ranking
	const activeOffers = data?.activeOffers || []
	const topCoins = data?.topCoins || []
	const received = data?.receivedRatings || { items: [], total: 0, distribution: {} }
	const sent = data?.sentRatings || { items: [], total: 0 }
	const domain = data?.domain

	const coverUri = user?.cover ? `${MEDIA_BASE}${user.cover}` : DEFAULT_COVER

	const offersCount = activeOffers.length
	const reviewsCount = received.total || 0

	// Share the profile — used by both Android header button and iOS native item
	const handleShare = useCallback(async () => {
		if (!user?.username) return
		const url = `https://www.qvapay.com/p2p/user/${uuid}`
		try {
			await Share.share({
				url, // iOS uses this as the payload
				message: t('p2p.user.share.message', { username: user.username, url }), // Android uses message
				title: t('p2p.user.share.title', { username: user.username }),
			})
		} catch (_) { /* cancelled */ }
	}, [uuid, user?.username, t])

	if (loading && !data) {
		return (
			<View style={[containerStyles.container, { justifyContent: "center", alignItems: "center" }]}>
				<FloatingTopBar insets={insets} theme={theme} onBack={() => navigation.goBack()} />
				<ActivityIndicator size="large" color={theme.colors.primary} />
			</View>
		)
	}

	if (error && !data) {
		return (
			<View style={[containerStyles.subContainer, { justifyContent: "center", alignItems: "center" }]}>
				<FloatingTopBar insets={insets} theme={theme} onBack={() => navigation.goBack()} />
				<FontAwesome6 name="circle-exclamation" size={40} color={theme.colors.danger} iconStyle="solid" />
				<Text style={[textStyles.h4, { color: theme.colors.primaryText, marginTop: 12 }]}>{t('p2p.user.notAvailable')}</Text>
				<Text style={[textStyles.h6, { color: theme.colors.secondaryText, marginTop: 4, textAlign: "center" }]}>{String(error)}</Text>
				<Pressable onPress={() => fetchProfile()} style={{ marginTop: 16, paddingHorizontal: 20, paddingVertical: 10, borderRadius: 14, borderCurve: 'continuous', backgroundColor: theme.colors.primary }}>
					<Text style={[textStyles.h6, { color: theme.colors.almostWhite }]}>{t('common.actions.retry')}</Text>
				</Pressable>
			</View>
		)
	}

	return (
		<View style={containerStyles.container}>
			<ScrollView
				contentContainerStyle={{ paddingBottom: 32 }}
				refreshControl={createHiddenRefreshControl(refreshing, onRefresh)}
				showsVerticalScrollIndicator={false}
				contentInsetAdjustmentBehavior="never"
			>
				{/* Cover + Avatar — extends under the transparent header and status bar */}
				<View style={{ height: totalCoverHeight, backgroundColor: theme.colors.surface }}>
					<FastImage source={{ uri: coverUri }} style={StyleSheet.absoluteFill} resizeMode={FastImage.resizeMode.cover} />
					{/* Top gradient: darkens area behind status bar + header for back/share button legibility */}
					<LinearGradient
						colors={["rgba(0,0,0,0.55)", "rgba(0,0,0,0.15)", "transparent"]}
						start={{ x: 0.5, y: 0 }}
						end={{ x: 0.5, y: 1 }}
						style={{ position: "absolute", top: 0, left: 0, right: 0, height: topOverlay + 20 }}
					/>
					{/* Bottom fade into the page background */}
					<LinearGradient
						colors={["transparent", theme.colors.background]}
						start={{ x: 0.5, y: 0.55 }}
						end={{ x: 0.5, y: 1 }}
						style={StyleSheet.absoluteFill}
					/>
					<View style={styles.avatarWrap}>
						<View style={[styles.avatarRing, { borderColor: theme.colors.background }]}>
							<QPAvatar user={user} size={92} />
						</View>
					</View>
				</View>

				{/* Name + verification badges */}
				<View style={{ alignItems: "center", paddingHorizontal: 16, marginTop: 54 }}>
					<View style={{ flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap", justifyContent: "center" }}>
						<Text style={[textStyles.h3, { color: theme.colors.primaryText, fontWeight: "700" }]}>{displayName(user)}</Text>
						{user?.kyc && <FontAwesome6 name="circle-check" size={16} color={theme.colors.primary} iconStyle="solid" />}
						{user?.golden_check && <FontAwesome6 name="crown" size={14} color={theme.colors.gold} iconStyle="solid" />}
						{user?.vip && <FontAwesome6 name="gem" size={14} color={theme.colors.primary} iconStyle="solid" />}
					</View>
					<Text style={[textStyles.h6, { color: theme.colors.secondaryText, marginTop: 2 }]}>@{user?.username}</Text>

					{/* Verification chips */}
					<View style={styles.verifRow}>
						{user?.phone_verified && <VerifChip theme={theme} icon="phone" label={t('p2p.user.chips.phone')} />}
						{user?.telegram_verified && <VerifChip theme={theme} icon="telegram" brand label="Telegram" />}
						{user?.twitter && <VerifChip theme={theme} icon="x-twitter" brand label="X" />}
					</View>

					{user?.bio ? (
						<Text style={[textStyles.body, { color: theme.colors.primaryText, textAlign: "center", marginTop: 12, paddingHorizontal: 8 }]}>
							{user.bio}
						</Text>
					) : null}

					{/* Inline stats row */}
					<View style={styles.inlineStatsRow}>
						<InlineStat theme={theme} icon="star" color={theme.colors.warning} value={Number(stats.averageRating || 0).toFixed(2)} label={t('p2p.user.inline.rating')} />
						<InlineStat theme={theme} icon="handshake" color={theme.colors.primary} value={stats.completedP2P || 0} label={t('p2p.user.inline.ops')} />
						<InlineStat theme={theme} icon="calendar" color={theme.colors.secondaryText} value={formatJoinDate(user?.createdAt)} label={t('p2p.user.inline.since')} />
					</View>

					{/* Social links */}
					{(domain?.website || domain?.twitter || domain?.instagram || domain?.telegram || domain?.whatsapp) ? (
						<View style={styles.socialRow}>
							{domain?.website && <SocialBtn theme={theme} icon="globe" url={domain.website} />}
							{domain?.twitter && <SocialBtn theme={theme} icon="x-twitter" brand url={`https://x.com/${domain.twitter}`} />}
							{domain?.instagram && <SocialBtn theme={theme} icon="instagram" brand url={`https://instagram.com/${domain.instagram}`} />}
							{domain?.telegram && <SocialBtn theme={theme} icon="telegram" brand url={`https://t.me/${domain.telegram}`} />}
							{domain?.whatsapp && <SocialBtn theme={theme} icon="whatsapp" brand url={`https://wa.me/${domain.whatsapp}`} />}
						</View>
					) : null}
				</View>

				{/* Stat cards */}
				<View style={styles.cardsGrid}>
					<StatCard
						theme={theme}
						textStyles={textStyles}
						label={t('p2p.user.cards.operations')}
						value={Number(stats.completedP2P || 0).toLocaleString(getDateLocale())}
						icon="arrows-rotate"
						color={theme.colors.primary}
					/>
					<GoldGateCard
						theme={theme}
						textStyles={textStyles}
						unlocked={viewerGold}
						label={t('p2p.user.cards.volume')}
						message={t('p2p.user.cards.goldOnly')}
						sublabel={t('p2p.user.cards.unlockMetrics')}
						onPressLocked={() => navigation.navigate(ROUTES.GOLD_CHECK)}
						unlockedCard={(
							<StatCard
								theme={theme}
								textStyles={textStyles}
								label={t('p2p.user.cards.volume')}
								value={formatUSD(stats.totalVolume)}
								sublabel={stats.volume30d > 0 ? t('p2p.user.cards.volume30d', { amount: formatUSD(stats.volume30d) }) : null}
								icon="wallet"
								color={theme.colors.gold}
							/>
						)}
					/>
					<StatCard
						theme={theme}
						textStyles={textStyles}
						label={t('p2p.user.cards.completionRate')}
						value={`${stats.completionRate || 0}%`}
						sublabel={stats.total > 0 ? `${stats.completed}/${stats.total}` : t('p2p.user.cards.noOps')}
						icon="circle-check"
						color={theme.colors.successText}
					/>
					<StatCard
						theme={theme}
						textStyles={textStyles}
						label={t('p2p.user.cards.ratings')}
						value={Number(stats.ratersCount || 0).toLocaleString(getDateLocale())}
						sublabel={stats.averageRating > 0 ? `★ ${stats.averageRating}` : t('p2p.user.cards.noData')}
						icon="star"
						color={theme.colors.warning}
					/>
				</View>

				{/* Tabs */}
				<View style={[styles.tabsRow, { borderBottomColor: theme.colors.border }]}>
					{TABS.map((tab) => {
						const count = tab.id === "offers" ? offersCount : tab.id === "reviews" ? reviewsCount : null
						const isActive = activeTab === tab.id
						return (
							<Pressable key={tab.id} onPress={() => setActiveTab(tab.id)} style={[styles.tabButton, isActive && { borderBottomColor: theme.colors.primary }]}>
								{/* Keep fontFamily stable across states — changing weight reflows the
								    label width and looks like the text shrinks when switching tabs. */}
								<Text style={[textStyles.h6, { color: isActive ? theme.colors.primary : theme.colors.secondaryText }]}>
									{t(`p2p.user.tabs.${tab.id}`)}
								</Text>
								{count !== null ? (
									<View style={[styles.tabCount, { backgroundColor: isActive ? theme.colors.primary + "22" : theme.colors.elevation }]}>
										<Text style={[textStyles.h7, { color: isActive ? theme.colors.primary : theme.colors.secondaryText }]}>{count}</Text>
									</View>
								) : null}
							</Pressable>
						)
					})}
				</View>

				{/* Tab content */}
				<View style={{ paddingHorizontal: 12, marginTop: 12 }}>
					{activeTab === "offers" && (
						<OffersTab
							theme={theme}
							textStyles={textStyles}
							offers={activeOffers}
							navigation={navigation}
							username={user?.username}
						/>
					)}

					{activeTab === "reviews" && (
						<ReviewsTab
							theme={theme}
							textStyles={textStyles}
							received={received}
							sent={sent}
							averageRating={stats.averageRating || 0}
							isSelf={isSelf}
							mode={reviewMode}
							setMode={setReviewMode}
							onPressUser={(u) => navigation.push(ROUTES.P2P_USER_SCREEN, { uuid: u.uuid })}
						/>
					)}

					{activeTab === "stats" && (
						<StatsTab
							theme={theme}
							textStyles={textStyles}
							ranking={ranking}
							stats={stats}
							topCoins={topCoins}
							viewerGold={viewerGold}
							onPressUnlock={() => navigation.navigate(ROUTES.GOLD_CHECK)}
						/>
					)}
				</View>
			</ScrollView>

			<FloatingTopBar insets={insets} theme={theme} onBack={() => navigation.goBack()} onShare={user ? handleShare : undefined} />
		</View>
	)
}

// ---------- Subcomponents ----------

// Floating back + share buttons overlaid on the cover (Scan-style top controls)
const FloatingTopBar = ({ insets, theme, onBack, onShare }) => (
	<View style={[styles.floatingTopBar, { top: insets.top + 6 }]} pointerEvents="box-none">
		<Pressable onPress={onBack} style={styles.floatingBtn} hitSlop={10}>
			<FontAwesome6 name="arrow-left" size={18} color="white" iconStyle="solid" />
		</Pressable>
		{onShare ? (
			<Pressable onPress={onShare} style={styles.floatingBtn} hitSlop={10}>
				<FontAwesome6 name="share-nodes" size={18} color="white" iconStyle="solid" />
			</Pressable>
		) : <View style={{ width: 40 }} />}
	</View>
)

const VerifChip = ({ theme, icon, brand, label }) => (
	<View style={{ flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 12, backgroundColor: theme.colors.surface, borderWidth: 0.5, borderColor: theme.colors.border }}>
		<FontAwesome6 name={icon} size={10} color={theme.colors.secondaryText} iconStyle={brand ? "brand" : "solid"} />
		<Text style={{ fontSize: 11, color: theme.colors.secondaryText, fontFamily: "Rubik-Medium" }}>{label}</Text>
	</View>
)

const InlineStat = ({ theme, icon, color, value, label }) => (
	<View style={{ flex: 1, alignItems: "center" }}>
		<View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
			<FontAwesome6 name={icon} size={12} color={color} iconStyle="solid" />
			<Text style={{ fontSize: 14, fontFamily: "Rubik-Bold", color: theme.colors.primaryText }}>{String(value)}</Text>
		</View>
		<Text style={{ fontSize: 10, color: theme.colors.secondaryText, marginTop: 2, textTransform: "uppercase", letterSpacing: 0.5 }}>{label}</Text>
	</View>
)

const SocialBtn = ({ theme, icon, brand, url }) => (
	<Pressable onPress={() => Linking.openURL(url).catch(() => { })} style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: theme.colors.surface, borderWidth: 0.5, borderColor: theme.colors.border, alignItems: "center", justifyContent: "center" }} >
		<FontAwesome6 name={icon} size={14} color={theme.colors.primaryText} iconStyle={brand ? "brand" : "solid"} />
	</Pressable>
)

const StatCard = ({ theme, textStyles, label, value, sublabel, icon, color }) => (
	<View style={[styles.statCard, { backgroundColor: theme.colors.surface, ...(theme.mode === "light" && { borderWidth: 0.5, borderColor: theme.colors.border }) }]}>
		<View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
			<Text style={{ fontSize: 10, color: theme.colors.secondaryText, textTransform: "uppercase", letterSpacing: 0.5, fontFamily: "Rubik-Medium" }}>{label}</Text>
			<View style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: (color || theme.colors.primary) + "22", alignItems: "center", justifyContent: "center" }}>
				<FontAwesome6 name={icon} size={12} color={color || theme.colors.primary} iconStyle="solid" />
			</View>
		</View>
		<Text style={[textStyles.h3, { color: theme.colors.primaryText, fontWeight: "700", marginTop: 6 }]} numberOfLines={1} adjustsFontSizeToFit>{value}</Text>
		{sublabel ? (
			<Text style={[textStyles.h7, { color: theme.colors.tertiaryText, marginTop: 2 }]} numberOfLines={1}>{sublabel}</Text>
		) : null}
	</View>
)

// Yellow "Hazte GOLD →" pill, used inside every GOLD gate.
const HazteGoldPill = ({ theme, onPress, compact = false }) => {
	const { t } = useTranslation()
	return (
		<Pressable
			onPress={onPress}
			style={{
				flexDirection: "row",
				alignItems: "center",
				gap: 6,
				backgroundColor: theme.colors.gold,
				paddingHorizontal: compact ? 10 : 14,
				paddingVertical: compact ? 5 : 7,
				borderRadius: 20,
				alignSelf: "center",
			}}
		>
			<FontAwesome6 name="crown" size={compact ? 10 : 12} color={theme.colors.almostBlack} iconStyle="solid" />
			<Text style={{ color: theme.colors.almostBlack, fontFamily: "Rubik-Bold", fontSize: compact ? 11 : 12 }}>
				{t('p2p.user.goldPill')}
			</Text>
		</Pressable>
	)
}

// Static GOLD-locked stat card — matches the web "Volumen solo para GOLD" card.
const GoldGateCard = ({ theme, textStyles, unlocked, unlockedCard, label, message, sublabel, onPressLocked }) => {
	if (unlocked) return unlockedCard
	return (
		<View style={[styles.statCard, { backgroundColor: theme.colors.surface, ...(theme.mode === "light" && { borderWidth: 1, borderColor: theme.colors.gold + "55" }) }]}>
			<View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
				<Text style={{ fontSize: 10, color: theme.colors.gold, textTransform: "uppercase", letterSpacing: 0.5, fontFamily: "Rubik-Medium" }} numberOfLines={1}>{label}</Text>
				<View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: theme.colors.gold + "22", alignItems: "center", justifyContent: "center" }}>
					<FontAwesome6 name="crown" size={11} color={theme.colors.gold} iconStyle="solid" />
				</View>
			</View>
			<Text style={[textStyles.h6, { color: theme.colors.primaryText, fontWeight: "700", marginTop: 6, textAlign: "center" }]} numberOfLines={2}>
				{message}
			</Text>
			{sublabel ? (
				<Text style={[textStyles.h7, { color: theme.colors.tertiaryText, marginTop: 2, textAlign: "center", fontSize: 10 }]} numberOfLines={2}>
					{sublabel}
				</Text>
			) : null}
			<View style={{ marginTop: 8 }}>
				<HazteGoldPill theme={theme} onPress={onPressLocked} compact />
			</View>
		</View>
	)
}

// Renders `children` dimmed + non-interactive and overlays a GOLD CTA on top —
// mirrors the web's `GoldGate` teaser (opacity-30 blur-sm + centered overlay).
const GoldWall = ({ theme, textStyles, unlocked, children, message, sublabel, onPress, minHeight = 220 }) => {
	if (unlocked) return children
	return (
		<View style={{ position: "relative", minHeight, borderRadius: 12, overflow: "hidden" }}>
			{/* Real content, dimmed + non-interactive */}
			<View pointerEvents="none" style={{ opacity: 0.18 }}>
				{children}
			</View>
			{/* Dark gradient-like overlay */}
			<View style={[StyleSheet.absoluteFill, { backgroundColor: "rgba(14,14,28,0.72)", borderRadius: 12 }]} />
			{/* CTA */}
			<View style={[StyleSheet.absoluteFill, { alignItems: "center", justifyContent: "center", paddingHorizontal: 20 }]}>
				<View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
					<FontAwesome6 name="crown" size={16} color={theme.colors.gold} iconStyle="solid" />
					<Text style={[textStyles.h5, { color: theme.colors.almostWhite, fontWeight: "700", textAlign: "center" }]}>
						{message}
					</Text>
				</View>
				{sublabel ? (
					<Text style={[textStyles.h7, { color: "rgba(255,255,255,0.7)", marginTop: 4, textAlign: "center" }]}>
						{sublabel}
					</Text>
				) : null}
				<View style={{ marginTop: 10 }}>
					<HazteGoldPill theme={theme} onPress={onPress} />
				</View>
			</View>
		</View>
	)
}

const Stars = ({ value, size = 14 }) => {
	const { theme } = useTheme()
	const rounded = Math.round(Number(value) || 0)
	return (
		<View style={{ flexDirection: "row", gap: 2 }}>
			{[1, 2, 3, 4, 5].map((i) => (
				<FontAwesome6
					key={i}
					name="star"
					size={size}
					color={i <= rounded ? theme.colors.warning : theme.colors.border}
					iconStyle="solid"
				/>
			))}
		</View>
	)
}

const OffersTab = ({ theme, textStyles, offers, navigation, username }) => {
	const { t } = useTranslation()
	if (!offers || offers.length === 0) {
		return (
			<View style={[styles.emptyCard, { ...(theme.mode === "light" && { borderWidth: 1, borderColor: theme.colors.border }) }]}>
				<FontAwesome6 name="rectangle-list" size={28} color={theme.colors.secondaryText} iconStyle="solid" />
				<Text style={[textStyles.h6, { color: theme.colors.secondaryText, marginTop: 8, textAlign: "center" }]}>
					{t('p2p.user.offersEmpty', { username })}
				</Text>
			</View>
		)
	}
	return (
		<View style={{ gap: 4 }}>
			{offers.map((o) => (<P2POfferItem key={o.uuid} offer={o} navigation={navigation} />))}
		</View>
	)
}

const Distribution = ({ theme, textStyles, distribution, total }) => {
	return (
		<View style={{ gap: 6 }}>
			{[5, 4, 3, 2, 1].map((r) => {
				const n = distribution?.[r] || 0
				const pct = total > 0 ? (n / total) * 100 : 0
				return (
					<View key={r} style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
						<Text style={[textStyles.h7, { color: theme.colors.secondaryText, width: 20 }]}>{r}★</Text>
						<View style={{ flex: 1, height: 6, backgroundColor: theme.colors.elevation, borderRadius: 3, overflow: "hidden" }}>
							<View style={{ width: `${pct}%`, height: "100%", backgroundColor: theme.colors.warning }} />
						</View>
						<Text style={[textStyles.h7, { color: theme.colors.tertiaryText, width: 28, textAlign: "right" }]}>{n}</Text>
					</View>
				)
			})}
		</View>
	)
}

const RatingRow = ({ theme, textStyles, rating, date, user, onPress }) => {
	const { t } = useTranslation()
	return (
		<Pressable
			disabled={!user || !onPress}
			onPress={() => user && onPress && onPress(user)}
			style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 10 }}
		>
			<View style={{ flexDirection: "row", alignItems: "center", gap: 10, flex: 1 }}>
				{user ? (
					<>
						<QPAvatar user={user} size={32} />
						<View style={{ flex: 1 }}>
							<Text style={[textStyles.h6, { color: theme.colors.primaryText, fontWeight: "600" }]} numberOfLines={1}>{displayName(user)}</Text>
							<Text style={[textStyles.h7, { color: theme.colors.secondaryText }]} numberOfLines={1}>@{user.username}</Text>
						</View>
					</>
				) : (
					<>
						<View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: theme.colors.elevation }} />
						<Text style={[textStyles.h7, { color: theme.colors.secondaryText }]}>{t('p2p.user.reviews.deletedUser')}</Text>
					</>
				)}
			</View>
			<View style={{ alignItems: "flex-end" }}>
				<Stars value={rating} size={12} />
				<Text style={[textStyles.h7, { color: theme.colors.tertiaryText, marginTop: 2, fontSize: 10 }]}>{formatRatingDate(date)}</Text>
			</View>
		</Pressable>
	)
}

const ReviewsTab = ({ theme, textStyles, received, sent, averageRating, isSelf, mode, setMode, onPressUser }) => {

	const { t } = useTranslation()
	const avg = Number(averageRating) || 0

	return (
		<View style={{ gap: 12 }}>

			{/* Mode switcher */}
			<View style={{ flexDirection: "row", gap: 8 }}>
				<Pressable onPress={() => setMode("received")} style={[styles.modePill, { backgroundColor: mode === "received" ? theme.colors.primary : theme.colors.surface, ...(theme.mode === "light" && { borderWidth: 0.5, borderColor: theme.colors.border }) }]}>
					<Text style={[textStyles.h7, { color: mode === "received" ? theme.colors.almostWhite : theme.colors.primaryText, fontWeight: "600" }]}>{t('p2p.user.reviews.received', { total: received.total || 0 })}</Text>
				</Pressable>
				<Pressable onPress={() => setMode("sent")} style={[styles.modePill, { backgroundColor: mode === "sent" ? theme.colors.primary : theme.colors.surface, ...(theme.mode === "light" && { borderWidth: 0.5, borderColor: theme.colors.border }) }]}>
					<Text style={[textStyles.h7, { color: mode === "sent" ? theme.colors.almostWhite : theme.colors.primaryText, fontWeight: "600" }]}>{t('p2p.user.reviews.sent', { total: sent.total || 0 })}</Text>
				</Pressable>
			</View>

			{mode === "received" ? (
				<>
					{received.total > 0 ? (
						<View style={[styles.sectionCard, { backgroundColor: theme.colors.surface, ...(theme.mode === "light" && { borderWidth: 0.5, borderColor: theme.colors.border }) }]}>
							<View style={{ flexDirection: "row", gap: 16, alignItems: "center" }}>
								<View style={{ alignItems: "center", paddingRight: 14, borderRightWidth: 0.5, borderRightColor: theme.colors.border }}>
									<Text style={[textStyles.h1, { color: theme.colors.primaryText, fontWeight: "800" }]}>{avg.toFixed(2)}</Text>
									<Stars value={avg} size={16} />
									<Text style={[textStyles.h7, { color: theme.colors.secondaryText, marginTop: 4 }]}>
										{t('p2p.user.reviews.count', { count: received.total })}
									</Text>
								</View>
								<View style={{ flex: 1 }}>
									<Distribution theme={theme} textStyles={textStyles} distribution={received.distribution} total={received.total} />
								</View>
							</View>
						</View>
					) : (
						<View style={[styles.emptyCard, { ...(theme.mode === "light" && { borderWidth: 1, borderColor: theme.colors.border }) }]}>
							<Text style={[textStyles.h6, { color: theme.colors.secondaryText, textAlign: "center" }]}>
								{t('p2p.user.reviews.none')}
							</Text>
						</View>
					)}

					<View style={[styles.sectionCard, { backgroundColor: theme.colors.surface, ...(theme.mode === "light" && { borderWidth: 0.5, borderColor: theme.colors.border }) }]}>
						<Text style={[textStyles.h5, { color: theme.colors.primaryText, fontWeight: "700" }]}>{t('p2p.user.reviews.latestTitle')}</Text>
						<Text style={[textStyles.h7, { color: theme.colors.secondaryText, marginTop: 2 }]}>
							{t('p2p.user.reviews.scoreOnly')}
						</Text>
						<View style={{ marginTop: 6 }}>
							{received.items?.length > 0 ? (
								received.items.map((r) => (
									<View key={r.id} style={{ borderTopWidth: 0.5, borderTopColor: theme.colors.border }}>
										{isSelf
											? <RatingRow theme={theme} textStyles={textStyles} rating={r.rating} date={r.created_at} user={r.rater} onPress={onPressUser} />
											: <AnonymousRatingRow theme={theme} textStyles={textStyles} rating={r.rating} date={r.created_at} />}
									</View>
								))
							) : (
								<Text style={[textStyles.h7, { color: theme.colors.secondaryText, textAlign: "center", paddingVertical: 16 }]}>{t('p2p.user.reviews.emptyList')}</Text>
							)}
						</View>
					</View>
				</>
			) : (
				<View style={[styles.sectionCard, { backgroundColor: theme.colors.surface, ...(theme.mode === "light" && { borderWidth: 0.5, borderColor: theme.colors.border }) }]}>
					<Text style={[textStyles.h5, { color: theme.colors.primaryText, fontWeight: "700" }]}>{t('p2p.user.reviews.sentTitle')}</Text>
					<View style={{ marginTop: 6 }}>
						{sent.items?.length > 0 ? (
							sent.items.map((r) => (
								<View key={r.id} style={{ borderTopWidth: 0.5, borderTopColor: theme.colors.border }}>
									{isSelf
										? <RatingRow theme={theme} textStyles={textStyles} rating={r.rating} date={r.created_at} user={r.rated} onPress={onPressUser} />
										: <AnonymousRatingRow theme={theme} textStyles={textStyles} rating={r.rating} date={r.created_at} />}
								</View>
							))
						) : (
							<Text style={[textStyles.h7, { color: theme.colors.secondaryText, textAlign: "center", paddingVertical: 16 }]}>{t('p2p.user.reviews.sentEmpty')}</Text>
						)}
					</View>
				</View>
			)}
		</View>
	)
}

const AnonymousRatingRow = ({ theme, textStyles, rating, date }) => {
	const { t } = useTranslation()
	return (
		<View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 10 }}>
			<View style={{ flexDirection: "row", alignItems: "center", gap: 10, flex: 1 }}>
				<View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: theme.colors.elevation, alignItems: "center", justifyContent: "center" }}>
					<FontAwesome6 name="lock" size={12} color={theme.colors.secondaryText} iconStyle="solid" />
				</View>
				<Text style={[textStyles.h7, { color: theme.colors.secondaryText, fontStyle: "italic" }]}>{t('p2p.user.reviews.privateUser')}</Text>
			</View>
			<View style={{ alignItems: "flex-end" }}>
				<Stars value={rating} size={12} />
				<Text style={[textStyles.h7, { color: theme.colors.tertiaryText, marginTop: 2, fontSize: 10 }]}>{formatRatingDate(date)}</Text>
			</View>
		</View>
	)
}

const StatsTab = ({ theme, textStyles, ranking, stats, topCoins, viewerGold, onPressUnlock }) => {

	const { t } = useTranslation()
	const maxCount = topCoins?.[0]?.count || 1

	return (
		<View style={{ gap: 12 }}>

			<View style={[styles.cardsGrid, { paddingHorizontal: 0, marginTop: 0 }]}>
				<MiniCard theme={theme} textStyles={textStyles} label={t('p2p.user.stats.uniquePeers')} value={Number(ranking?.unique_peers || 0).toLocaleString(getDateLocale())} icon="users" />
				<MiniCard theme={theme} textStyles={textStyles} label={t('p2p.user.stats.avgClose')} value={formatMinutes(ranking?.avg_completion_time)} icon="stopwatch" />
				<MiniCard theme={theme} textStyles={textStyles} label={t('p2p.user.stats.ops30d')} value={Number(stats.operations30d || 0).toLocaleString(getDateLocale())} icon="chart-line" />
				<MiniCard theme={theme} textStyles={textStyles} label={t('p2p.user.stats.cancellation')} value={`${stats.cancellationRate || 0}%`} icon="ban" color={theme.colors.danger} />
			</View>

			<GoldWall
				theme={theme}
				textStyles={textStyles}
				unlocked={viewerGold}
				message={t('p2p.user.stats.coinsGoldMessage')}
				sublabel={t('p2p.user.stats.coinsGoldSublabel')}
				onPress={onPressUnlock}
				minHeight={300}
			>
				<View style={[styles.sectionCard, { backgroundColor: theme.colors.surface, ...(theme.mode === "light" && { borderWidth: 0.5, borderColor: theme.colors.border }) }]}>
					<Text style={[textStyles.h5, { color: theme.colors.primaryText, fontWeight: "700" }]}>{t('p2p.user.stats.topCoinsTitle')}</Text>
					<Text style={[textStyles.h7, { color: theme.colors.secondaryText, marginTop: 2, marginBottom: 8 }]}>
						{t('p2p.user.stats.topCoinsSubtitle')}
					</Text>
					{topCoins.length > 0 ? topCoins.map((c) => {
						const pct = (c.count / maxCount) * 100
						return (
							<View key={c.tick} style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 8, borderTopWidth: 0.5, borderTopColor: theme.colors.border }}>
								<QPCoin coin={c.logo || c.tick} size={28} />
								<View style={{ flex: 1 }}>
									<View style={{ flexDirection: "row", justifyContent: "space-between" }}>
										<Text style={[textStyles.h6, { color: theme.colors.primaryText, fontWeight: "600" }]} numberOfLines={1}>{c.name}</Text>
										<Text style={[textStyles.h7, { color: theme.colors.secondaryText }]}>{t('p2p.user.stats.coinMeta', { ops: c.count, volume: formatUSD(c.volume) })}</Text>
									</View>
									<View style={{ height: 5, backgroundColor: theme.colors.elevation, borderRadius: 3, marginTop: 4, overflow: "hidden" }}>
										<View style={{ width: `${pct}%`, height: "100%", backgroundColor: theme.colors.primary }} />
									</View>
								</View>
							</View>
						)
					}) : (
						<Text style={[textStyles.h7, { color: theme.colors.secondaryText, textAlign: "center", paddingVertical: 12 }]}>
							{t('p2p.user.stats.noCompletedOps')}
						</Text>
					)}
				</View>
			</GoldWall>
		</View>
	)
}

const MiniCard = ({ theme, textStyles, label, value, icon, color }) => (
	<View style={[styles.statCard, { backgroundColor: theme.colors.surface, ...(theme.mode === "light" && { borderWidth: 0.5, borderColor: theme.colors.border }) }]}>
		<View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
			<Text style={{ fontSize: 10, color: theme.colors.secondaryText, textTransform: "uppercase", letterSpacing: 0.5, fontFamily: "Rubik-Medium" }} numberOfLines={1}>{label}</Text>
			<FontAwesome6 name={icon} size={12} color={color || theme.colors.secondaryText} iconStyle="solid" />
		</View>
		<Text style={[textStyles.h4, { color: theme.colors.primaryText, fontWeight: "700", marginTop: 4 }]} numberOfLines={1} adjustsFontSizeToFit>{value}</Text>
	</View>
)

const styles = StyleSheet.create({
	avatarWrap: {
		position: "absolute",
		bottom: -46,
		left: 0,
		right: 0,
		alignItems: "center",
	},
	avatarRing: {
		width: 104,
		height: 104,
		borderRadius: 52,
		borderWidth: 4,
		alignItems: "center",
		justifyContent: "center",
	},
	verifRow: {
		flexDirection: "row",
		gap: 6,
		marginTop: 8,
		flexWrap: "wrap",
		justifyContent: "center",
	},
	inlineStatsRow: {
		flexDirection: "row",
		marginTop: 16,
		paddingVertical: 10,
		width: "100%",
		gap: 4,
	},
	socialRow: {
		flexDirection: "row",
		gap: 8,
		marginTop: 12,
	},
	cardsGrid: {
		flexDirection: "row",
		flexWrap: "wrap",
		gap: 8,
		paddingHorizontal: 12,
		marginTop: 16,
	},
	statCard: {
		flexBasis: "48%",
		flexGrow: 1,
		minWidth: 140,
		borderRadius: 12,
		padding: 12,
	},
	tabsRow: {
		flexDirection: "row",
		marginTop: 18,
		marginHorizontal: 12,
		borderBottomWidth: 0.5,
	},
	tabButton: {
		flexDirection: "row",
		alignItems: "center",
		gap: 6,
		paddingVertical: 12,
		paddingHorizontal: 4,
		marginRight: 20,
		borderBottomWidth: 2,
		borderBottomColor: "transparent",
	},
	tabCount: {
		paddingHorizontal: 8,
		paddingVertical: 1,
		borderRadius: 10,
	},
	emptyCard: {
		borderStyle: "dashed",
		borderRadius: 12,
		padding: 24,
		alignItems: "center",
		justifyContent: "center",
	},
	sectionCard: {
		borderRadius: 12,
		padding: 14,
	},
	modePill: {
		paddingHorizontal: 12,
		paddingVertical: 6,
		borderRadius: 16,
	},
	floatingTopBar: {
		position: "absolute",
		left: 16,
		right: 16,
		flexDirection: "row",
		justifyContent: "space-between",
		alignItems: "center",
	},
	floatingBtn: {
		width: 40,
		height: 40,
		borderRadius: 16,
		borderCurve: 'continuous',
		backgroundColor: "rgba(0,0,0,0.4)",
		justifyContent: "center",
		alignItems: "center",
	},
})

export default P2PUser
