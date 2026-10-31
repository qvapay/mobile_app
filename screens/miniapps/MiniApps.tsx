import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ReactElement } from 'react'
import { View, Text, StyleSheet, ScrollView, Linking, useWindowDimensions } from 'react-native'
import type { RefreshControlProps } from 'react-native'
import { FlashList } from '@shopify/flash-list'
import LinearGradient from 'react-native-linear-gradient'
import FastImage from '@d11/react-native-fast-image'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import FontAwesome6 from '@react-native-vector-icons/fontawesome6'
import ReactNativeHapticFeedback from 'react-native-haptic-feedback'
import { toast } from 'sonner-native'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'

import QPInput from '../../ui/particles/QPInput'
import QPPressable from '../../ui/particles/QPPressable'
import QPLoader from '../../ui/particles/QPLoader'
import { createHiddenRefreshControl } from '../../ui/QPRefreshIndicator'
import useContentPadding from '../../hooks/useContentPadding'
import { useTheme } from '../../theme/ThemeContext'
import { useTextStyles, useContainerStyles, hexToRgba } from '../../theme/themeUtils'
import { ROUTES } from '../../routes'

import MiniAppIcon from './MiniAppIcon'
import MiniAppActionsSheet from './MiniAppActionsSheet'
import useMiniAppFavorites from './useMiniAppFavorites'
import { useMiniAppsList } from './miniappsQueries'
import { CATEGORY_META, SEARCH_MIN_APPS, buildCatalogView, categoryOf, coverOf, normalizeSearch, presentCategories } from './miniappsCatalog'
import type { MiniAppCategory } from './miniappsCatalog'
import type { MiniApp } from '../../types/domain'
import type { RootStackParamList } from '../../types/navigation'

type Props = NativeStackScreenProps<RootStackParamList, 'MiniApps'>

/** Panel de desarrollador donde cualquiera da de alta su mini-app. */
const PUBLISH_URL = 'https://www.qvapay.com/dev/app'

const FEATURED_GAP = 12

// Sobre una portada el texto va en blanco fijo (en claro y en oscuro): el velo lo garantiza
const COVER_SCRIM = ['rgba(0,0,0,0)', 'rgba(0,0,0,0.8)']
const COVER_TAG_BG = 'rgba(0,0,0,0.4)'
const COVER_TEXT = '#FFFFFF'
const COVER_TEXT_SOFT = 'rgba(255,255,255,0.82)'
const COVER_TEXT_FAINT = 'rgba(255,255,255,0.62)'

/** Etiquetas de categoría como llamadas literales (las comprueba `npm run i18n:usage`). */
const categoryLabel = (t: TFunction, category: MiniAppCategory): string => ({
	shopping: t('miniapps.directory.categories.shopping'),
	games: t('miniapps.directory.categories.games'),
	finance: t('miniapps.directory.categories.finance'),
	services: t('miniapps.directory.categories.services'),
	social: t('miniapps.directory.categories.social'),
	tools: t('miniapps.directory.categories.tools'),
	other: t('miniapps.directory.categories.other'),
})[category]

/** Autor que se enseña: nada si coincide con el nombre de la app (sería repetirlo). */
const authorOf = (app: MiniApp): string | null => {
	const author = app.merchant?.name?.trim()
	if (!author || normalizeSearch(author) === normalizeSearch(app.name)) return null
	return author
}

/**
 * Catálogo de mini-apps: las publica la comunidad desde el panel de
 * desarrollador. Destacadas en un carrusel, filtro por categoría, buscador
 * cuando hay muchas y, debajo, la invitación a publicar la tuya.
 */
const MiniApps = ({ navigation }: Props) => {

	const { t } = useTranslation()
	const { theme, isDark } = useTheme()
	const textStyles = useTextStyles(theme)
	const containerStyles = useContainerStyles(theme)
	const contentPadding = useContentPadding(24)
	const { width } = useWindowDimensions()

	const { data, isPending, isError, error, refetch } = useMiniAppsList()
	const [refreshing, setRefreshing] = useState(false)
	const [query, setQuery] = useState('')
	const [category, setCategory] = useState<MiniAppCategory | null>(null)
	const [menuApp, setMenuApp] = useState<MiniApp | null>(null)
	const { favorites, isFavorite } = useMiniAppFavorites()

	useEffect(() => {
		if (isError && !data) toast.error(t('miniapps.errors.loadList'), { description: error?.message })
	}, [isError, data, error, t])

	const apps = useMemo(() => data ?? [], [data])
	const categories = useMemo(() => presentCategories(apps), [apps])
	const showSearch = apps.length >= SEARCH_MIN_APPS
	// Una categoría que desaparece tras un refresco deja de filtrar
	const activeCategory = category && categories.includes(category) ? category : null
	const view = useMemo(() => buildCatalogView(apps, { query: showSearch ? query : '', category: activeCategory }), [apps, query, showSearch, activeCategory])

	const featuredWidth = Math.min(340, width - theme.spacing.md * 2 - 36)

	const open = useCallback((app: MiniApp) => {
		navigation.navigate(ROUTES.MINIAPP_HOST, { slug: app.slug, name: app.name, icon: app.icon })
	}, [navigation])

	// Mantener pulsada una app = su menú (favorita, acceso directo, compartir) sin entrar en ella
	const openMenu = useCallback((app: MiniApp) => {
		ReactNativeHapticFeedback.trigger('impactMedium', { enableVibrateFallback: true, ignoreAndroidSystemSettings: false })
		setMenuApp(app)
	}, [])

	const onRefresh = useCallback(async () => {
		setRefreshing(true)
		try { await refetch() } finally { setRefreshing(false) }
	}, [refetch])

	// Tarjetas de superficie: borde solo en claro (en oscuro, sin bordes)
	const cardBorder = useMemo(() => !isDark ? { borderWidth: 1, borderColor: theme.colors.border } : null, [isDark, theme])

	// Antes del return temprano: un hook después de él cambiaría el orden de hooks entre renders
	const renderApp = useCallback(({ item }: { item: MiniApp }) => {
		const cat = categoryOf(item)
		const author = authorOf(item)
		return (
			<QPPressable onPress={() => open(item)} onLongPress={() => openMenu(item)} accessibilityHint={t('miniapps.actions.longPressHint')} style={styles.row}>
				<MiniAppIcon app={item} size={56} />
				<View style={styles.rowText}>
					<View style={styles.nameRow}>
						<Text style={[textStyles.h5, styles.shrink, { color: theme.colors.primaryText }]} numberOfLines={1}>{item.name}</Text>
						{isFavorite(item.slug) ? (
							<FontAwesome6 name="star" size={11} color={theme.colors.warning} iconStyle="solid" style={styles.ml5} accessibilityLabel={t('miniapps.actions.favoriteBadge')} />
						) : null}
						{item.preview ? <PreviewBadge label={t('miniapps.directory.preview')} /> : null}
					</View>
					{item.tagline ? (
						<Text style={[textStyles.caption, styles.mt2]} numberOfLines={2}>{item.tagline}</Text>
					) : null}
					<View style={styles.metaRow}>
						<FontAwesome6 name={CATEGORY_META[cat].icon} size={10} color={CATEGORY_META[cat].color} iconStyle="solid" />
						<Text style={[textStyles.h7, styles.shrink, styles.ml5, { color: theme.colors.tertiaryText }]} numberOfLines={1}>
							{author ? `${categoryLabel(t, cat)} · ${t('miniapps.directory.by', { name: author })}` : categoryLabel(t, cat)}
						</Text>
					</View>
				</View>
			</QPPressable>
		)
	}, [open, openMenu, isFavorite, theme, textStyles, t])

	if (isPending) {
		return <View style={[containerStyles.subContainer, styles.center]}><QPLoader /></View>
	}

	const header = (
		<View>
			{view.featured.length > 0 ? (
				<>
					<Text style={[textStyles.h4, styles.sectionTitle]}>{t('miniapps.directory.featured')}</Text>
					<ScrollView
						horizontal
						showsHorizontalScrollIndicator={false}
						decelerationRate="fast"
						snapToInterval={featuredWidth + FEATURED_GAP}
						snapToAlignment="start"
						style={{ marginHorizontal: -theme.spacing.md }}
						contentContainerStyle={[styles.featuredRow, { paddingHorizontal: theme.spacing.md }]}
					>
						{view.featured.map(app => (
							<FeaturedCard key={app.slug} app={app} width={featuredWidth} cardBorder={cardBorder} onPress={() => open(app)} onLongPress={() => openMenu(app)} />
						))}
					</ScrollView>
				</>
			) : null}

			{categories.length > 1 ? (
				<ScrollView
					horizontal
					showsHorizontalScrollIndicator={false}
					style={[{ marginHorizontal: -theme.spacing.md }, view.featured.length > 0 && styles.mt24]}
					contentContainerStyle={[styles.chipsRow, { paddingHorizontal: theme.spacing.md }]}
				>
					<CategoryChip label={t('miniapps.directory.all')} active={activeCategory == null} onPress={() => setCategory(null)} />
					{categories.map(c => (
						<CategoryChip key={c} label={categoryLabel(t, c)} icon={CATEGORY_META[c].icon} active={activeCategory === c} onPress={() => setCategory(activeCategory === c ? null : c)} />
					))}
				</ScrollView>
			) : null}

			{/* "Más apps" solo separa la lista del carrusel; con un filtro la lista ya es el resultado */}
			{!view.filtering && view.featured.length > 0 && view.list.length > 0 ? (
				<Text style={[textStyles.h4, styles.sectionTitle, categories.length > 1 ? styles.mt20 : styles.mt28]}>{t('miniapps.directory.more')}</Text>
			) : <View style={styles.spacer8} />}
		</View>
	)

	const empty = view.filtering ? (
		<View style={styles.noResults}>
			<FontAwesome6 name="magnifying-glass" size={22} color={theme.colors.tertiaryText} iconStyle="solid" />
			<Text style={[textStyles.h6, styles.emptyText, { color: theme.colors.tertiaryText }]}>{t('miniapps.directory.noResults')}</Text>
		</View>
	) : view.featured.length === 0 ? (
		<View style={[styles.empty, { backgroundColor: theme.colors.surface }, cardBorder]}>
			<FontAwesome6 name="puzzle-piece" size={28} color={theme.colors.tertiaryText} iconStyle="solid" />
			<Text style={[textStyles.h6, styles.emptyText, { color: theme.colors.tertiaryText }]}>{t('miniapps.directory.empty')}</Text>
		</View>
	) : null

	// La invitación a publicar acompaña al catálogo, no a un resultado de búsqueda
	const footer = view.filtering ? null : (
		<QPPressable onPress={() => { Linking.openURL(PUBLISH_URL).catch(() => {}) }} style={[styles.publish, { backgroundColor: theme.colors.surface }, cardBorder]}>
			<View style={[styles.publishIcon, { backgroundColor: hexToRgba(theme.colors.primary, 0.15) }]}>
				<FontAwesome6 name="code" size={16} color={theme.colors.primary} iconStyle="solid" />
			</View>
			<View style={styles.rowText}>
				<Text style={[textStyles.h5, { color: theme.colors.primaryText }]}>{t('miniapps.directory.publishTitle')}</Text>
				<Text style={[textStyles.caption, styles.mt2]}>{t('miniapps.directory.publishBody')}</Text>
			</View>
			<FontAwesome6 name="arrow-up-right-from-square" size={12} color={theme.colors.tertiaryText} iconStyle="solid" />
		</QPPressable>
	)

	return (
		<View style={containerStyles.subContainer}>
			{showSearch ? (
				<View style={styles.search}>
					<QPInput
						value={query}
						onChangeText={setQuery}
						placeholder={t('miniapps.directory.searchPlaceholder')}
						prefixIconName="magnifying-glass"
						autoCapitalize="none"
						autoCorrect={false}
						returnKeyType="search"
						clearButtonMode="while-editing"
					/>
				</View>
			) : null}
			<FlashList
				data={view.list}
				keyExtractor={item => item.slug}
				contentContainerStyle={contentPadding}
				showsVerticalScrollIndicator={false}
				keyboardDismissMode="on-drag"
				keyboardShouldPersistTaps="handled"
				refreshControl={createHiddenRefreshControl(refreshing, onRefresh) as ReactElement<RefreshControlProps>}
				ListHeaderComponent={header}
				renderItem={renderApp}
				extraData={favorites}
				ListEmptyComponent={empty}
				ListFooterComponent={footer}
			/>
			<MiniAppActionsSheet app={menuApp} onClose={() => setMenuApp(null)} />
		</View>
	)
}

/**
 * Tarjeta grande del carrusel. Con portada, la imagen a sangre con un velo
 * oscuro abajo y el texto en blanco encima; sin ella (o si no carga), teñida
 * con el color de su categoría. El degradado va siempre debajo: es lo que se
 * ve mientras la portada carga.
 */
const FeaturedCard = ({ app, width, cardBorder, onPress, onLongPress }: { app: MiniApp, width: number, cardBorder: object | null, onPress: () => void, onLongPress: () => void }) => {

	const { t } = useTranslation()
	const { theme } = useTheme()
	const textStyles = useTextStyles(theme)
	const cat = categoryOf(app)
	const { color, icon } = CATEGORY_META[cat]
	const author = authorOf(app)
	const cover = coverOf(app)
	const [coverFailed, setCoverFailed] = useState(false)
	const withCover = !!cover && !coverFailed

	return (
		<QPPressable onPress={onPress} onLongPress={onLongPress} accessibilityHint={t('miniapps.actions.longPressHint')} style={[styles.featuredCard, { width, backgroundColor: theme.colors.surface }, cardBorder]}>
			<LinearGradient
				colors={[hexToRgba(color, 0.32), hexToRgba(color, 0.04)]}
				start={{ x: 0, y: 0 }}
				end={{ x: 1, y: 1 }}
				style={StyleSheet.absoluteFill}
			/>
			{withCover ? (
				<>
					<FastImage source={{ uri: cover }} style={StyleSheet.absoluteFill} resizeMode={FastImage.resizeMode.cover} onError={() => setCoverFailed(true)} />
					<LinearGradient colors={COVER_SCRIM} locations={[0.3, 1]} style={StyleSheet.absoluteFill} />
				</>
			) : null}

			<View style={withCover ? styles.featuredTopEnd : styles.featuredTop}>
				{withCover ? null : <MiniAppIcon app={app} size={64} />}
				<View style={[styles.categoryTag, { backgroundColor: withCover ? COVER_TAG_BG : hexToRgba(color, 0.18) }]}>
					<FontAwesome6 name={icon} size={10} color={withCover ? COVER_TEXT : color} iconStyle="solid" />
					<Text style={[textStyles.h7, styles.ml5, { color: withCover ? COVER_TEXT : theme.colors.primaryText }]}>{categoryLabel(t, cat)}</Text>
				</View>
			</View>

			{withCover ? (
				<View style={styles.coverBody}>
					<MiniAppIcon app={app} size={44} />
					<View style={styles.rowText}>
						<View style={styles.nameRow}>
							<Text style={[textStyles.h4, styles.shrink, { color: COVER_TEXT }]} numberOfLines={1}>{app.name}</Text>
							{app.preview ? <PreviewBadge label={t('miniapps.directory.preview')} /> : null}
						</View>
						{app.tagline ? <Text style={[textStyles.caption, styles.mt2, { color: COVER_TEXT_SOFT }]} numberOfLines={1}>{app.tagline}</Text> : null}
						{author ? <Text style={[textStyles.h7, styles.mt2, { color: COVER_TEXT_FAINT }]} numberOfLines={1}>{t('miniapps.directory.by', { name: author })}</Text> : null}
					</View>
				</View>
			) : (
				<View style={styles.featuredBody}>
					<View style={styles.nameRow}>
						<Text style={[textStyles.h3, styles.shrink, { color: theme.colors.primaryText }]} numberOfLines={1}>{app.name}</Text>
						{app.preview ? <PreviewBadge label={t('miniapps.directory.preview')} /> : null}
					</View>
					{app.tagline ? <Text style={[textStyles.caption, styles.mt4, { color: theme.colors.secondaryText }]} numberOfLines={2}>{app.tagline}</Text> : null}
					{author ? <Text style={[textStyles.h7, styles.mt8, { color: theme.colors.tertiaryText }]} numberOfLines={1}>{t('miniapps.directory.by', { name: author })}</Text> : null}
				</View>
			)}
		</QPPressable>
	)
}

/** Chip de filtro: sin marcar transparente con borde (en oscuro, superficie sin borde); marcado primario + blanco. */
const CategoryChip = ({ label, icon, active, onPress }: { label: string, icon?: typeof CATEGORY_META[MiniAppCategory]['icon'], active: boolean, onPress: () => void }) => {

	const { theme, isDark } = useTheme()
	const textStyles = useTextStyles(theme)
	const fg = active ? theme.colors.almostWhite : theme.colors.primaryText

	return (
		<QPPressable
			onPress={onPress}
			style={[
				styles.chip,
				active
					? { backgroundColor: theme.colors.primary }
					: isDark ? { backgroundColor: theme.colors.surface } : [styles.chipOutline, { borderColor: theme.colors.border }],
			]}
		>
			{icon ? <FontAwesome6 name={icon} size={11} color={fg} iconStyle="solid" style={styles.chipIcon} /> : null}
			<Text style={[textStyles.h6, { color: fg }]}>{label}</Text>
		</QPPressable>
	)
}

/** Solo la ve el autor de la mini-app mientras no está publicada. */
const PreviewBadge = ({ label }: { label: string }) => {
	const { theme } = useTheme()
	const textStyles = useTextStyles(theme)
	return (
		<View style={[styles.previewBadge, { backgroundColor: hexToRgba(theme.colors.warning, 0.18) }]}>
			<Text style={[textStyles.h7, { color: theme.colors.warning }]}>{label}</Text>
		</View>
	)
}

const styles = StyleSheet.create({
	center: { justifyContent: 'center', alignItems: 'center' },
	search: { paddingTop: 4, paddingBottom: 8 },
	sectionTitle: { marginTop: 8, marginBottom: 12 },
	featuredRow: { gap: FEATURED_GAP },
	featuredCard: { height: 196, borderRadius: 20, borderCurve: 'continuous', padding: 16, overflow: 'hidden', justifyContent: 'space-between' },
	featuredTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
	featuredTopEnd: { flexDirection: 'row', justifyContent: 'flex-end' },
	coverBody: { flexDirection: 'row', alignItems: 'center' },
	featuredBody: { marginTop: 12 },
	categoryTag: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999 },
	chipsRow: { gap: 8 },
	chip: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999 },
	row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10 },
	rowText: { flex: 1, marginHorizontal: 12 },
	nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
	metaRow: { flexDirection: 'row', alignItems: 'center', marginTop: 4 },
	shrink: { flexShrink: 1 },
	previewBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
	publish: { flexDirection: 'row', alignItems: 'center', borderRadius: 16, borderCurve: 'continuous', padding: 14, marginTop: 24 },
	publishIcon: { width: 36, height: 36, borderRadius: 10, borderCurve: 'continuous', alignItems: 'center', justifyContent: 'center' },
	noResults: { alignItems: 'center', paddingVertical: 40 },
	empty: { borderRadius: 16, padding: 28, alignItems: 'center', marginTop: 8 },
	emptyText: { textAlign: 'center', marginTop: 10 },
	chipOutline: { borderWidth: 1 },
	chipIcon: { marginRight: 6 },
	spacer8: { height: 8 },
	ml5: { marginLeft: 5 },
	mt2: { marginTop: 2 },
	mt4: { marginTop: 4 },
	mt8: { marginTop: 8 },
	mt20: { marginTop: 20 },
	mt24: { marginTop: 24 },
	mt28: { marginTop: 28 },
})

export default MiniApps
