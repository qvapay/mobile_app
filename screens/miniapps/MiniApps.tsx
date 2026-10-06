import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ReactElement } from 'react'
import { View, Text, StyleSheet, ScrollView } from 'react-native'
import type { RefreshControlProps } from 'react-native'
import { FlashList } from '@shopify/flash-list'
import { useTranslation } from 'react-i18next'
import FontAwesome6 from '@react-native-vector-icons/fontawesome6'
import { toast } from 'sonner-native'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'

import QPPressable from '../../ui/particles/QPPressable'
import QPLoader from '../../ui/particles/QPLoader'
import { createHiddenRefreshControl } from '../../ui/QPRefreshIndicator'
import useContentPadding from '../../hooks/useContentPadding'
import { useTheme } from '../../theme/ThemeContext'
import { useTextStyles, useContainerStyles } from '../../theme/themeUtils'
import { ROUTES } from '../../routes'

import MiniAppIcon from './MiniAppIcon'
import { useMiniAppsList } from './miniappsQueries'
import type { MiniApp } from '../../types/domain'
import type { RootStackParamList } from '../../types/navigation'

type Props = NativeStackScreenProps<RootStackParamList, 'MiniApps'>

/**
 * Directorio de mini-apps: destacadas en un carrusel arriba y el resto en
 * lista. Todo lo que aparece aquí lo aprobó QvaPay (alta manual por admin).
 */
const MiniApps = ({ navigation }: Props) => {

	const { t } = useTranslation()
	const { theme, isDark } = useTheme()
	const textStyles = useTextStyles(theme)
	const containerStyles = useContainerStyles(theme)
	const contentPadding = useContentPadding(24)

	const { data, isPending, isError, error, refetch } = useMiniAppsList()
	const [refreshing, setRefreshing] = useState(false)

	useEffect(() => {
		if (isError && !data) toast.error(t('miniapps.errors.loadList'), { description: error?.message })
	}, [isError, data, error, t])

	const apps = useMemo(() => data ?? [], [data])
	const featured = useMemo(() => apps.filter(a => a.featured), [apps])
	const rest = useMemo(() => apps.filter(a => !a.featured), [apps])

	const open = useCallback((app: MiniApp) => {
		navigation.navigate(ROUTES.MINIAPP_HOST, { slug: app.slug, name: app.name, icon: app.icon })
	}, [navigation])

	const onRefresh = useCallback(async () => {
		setRefreshing(true)
		try { await refetch() } finally { setRefreshing(false) }
	}, [refetch])

	if (isPending) {
		return <View style={[containerStyles.subContainer, styles.center]}><QPLoader /></View>
	}

	// Tarjetas de superficie: borde solo en claro (en oscuro, sin bordes)
	const cardBorder = !isDark && { borderWidth: 1, borderColor: theme.colors.border }

	const header = (
		<View>
			<Text style={[textStyles.h6, { color: theme.colors.secondaryText, marginBottom: 16 }]}>{t('miniapps.directory.subtitle')}</Text>
			{featured.length > 0 ? (
				<ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.featuredRow}>
					{featured.map(app => (
						<QPPressable key={app.slug} onPress={() => open(app)} style={[styles.featuredCard, { backgroundColor: theme.colors.surface }, cardBorder]}>
							<MiniAppIcon app={app} size={56} />
							<Text style={[textStyles.h5, { color: theme.colors.primaryText, marginTop: 12 }]} numberOfLines={1}>{app.name}</Text>
							{app.tagline ? <Text style={[textStyles.h7, { color: theme.colors.secondaryText, marginTop: 4 }]} numberOfLines={2}>{app.tagline}</Text> : null}
						</QPPressable>
					))}
				</ScrollView>
			) : null}
			{rest.length > 0 && featured.length > 0 ? (
				<Text style={[textStyles.h5, { color: theme.colors.primaryText, marginTop: 24, marginBottom: 8 }]}>{t('miniapps.directory.all')}</Text>
			) : null}
		</View>
	)

	return (
		<View style={containerStyles.subContainer}>
			<FlashList
				data={rest}
				keyExtractor={item => item.slug}
				contentContainerStyle={contentPadding}
				showsVerticalScrollIndicator={false}
				refreshControl={createHiddenRefreshControl(refreshing, onRefresh) as ReactElement<RefreshControlProps>}
				ListHeaderComponent={header}
				renderItem={({ item }) => (
					<QPPressable onPress={() => open(item)} style={styles.row}>
						<MiniAppIcon app={item} size={48} />
						<View style={styles.rowText}>
							<Text style={[textStyles.h5, { color: theme.colors.primaryText }]} numberOfLines={1}>{item.name}</Text>
							<Text style={[textStyles.h7, { color: theme.colors.secondaryText, marginTop: 2 }]} numberOfLines={1}>
								{item.tagline || item.merchant.name}
							</Text>
						</View>
						<FontAwesome6 name="chevron-right" size={12} color={theme.colors.tertiaryText} iconStyle="solid" />
					</QPPressable>
				)}
				ListEmptyComponent={featured.length === 0 ? (
					<View style={[styles.empty, { backgroundColor: theme.colors.surface }, cardBorder]}>
						<FontAwesome6 name="puzzle-piece" size={28} color={theme.colors.tertiaryText} iconStyle="solid" />
						<Text style={[textStyles.h6, { color: theme.colors.tertiaryText, textAlign: 'center', marginTop: 10 }]}>{t('miniapps.directory.empty')}</Text>
					</View>
				) : null}
			/>
		</View>
	)
}

const styles = StyleSheet.create({
	center: { justifyContent: 'center', alignItems: 'center' },
	featuredRow: { gap: 12, paddingRight: 8 },
	featuredCard: { width: 160, borderRadius: 16, borderCurve: 'continuous', padding: 14 },
	row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10 },
	rowText: { flex: 1, marginHorizontal: 12 },
	empty: { borderRadius: 16, padding: 28, alignItems: 'center', marginTop: 8 },
})

export default MiniApps
