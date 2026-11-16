import { useEffect, useMemo, useState } from 'react'
import { View, Text, ScrollView, StyleSheet, useWindowDimensions } from 'react-native'
import type { StyleProp, ViewStyle } from 'react-native'
import { useTranslation } from 'react-i18next'
import type { NavigationProp } from '@react-navigation/native'
import ReactNativeHapticFeedback from 'react-native-haptic-feedback'

import { useTheme } from '../../theme/ThemeContext'
import { useTextStyles } from '../../theme/themeUtils'
import { ROUTES } from '../../routes'
import QPPressable from '../../ui/particles/QPPressable'
import QPSectionHeader from '../../ui/particles/QPSectionHeader'
import MiniAppIcon from '../miniapps/MiniAppIcon'
import MiniAppActionsSheet from '../miniapps/MiniAppActionsSheet'
import useMiniAppFavorites from '../miniapps/useMiniAppFavorites'
import { useMiniAppsList } from '../miniapps/miniappsQueries'
import { homeMiniAppsGrid, pickHomeMiniApps, splitHomeMiniApps } from '../miniapps/miniappsCatalog'
import { quickActionFavorites } from '../miniapps/miniappFavorites'
import { setMiniAppQuickActions } from '../../helpers/miniAppShortcuts'

import type { MiniApp } from '../../types/domain'
import type { RootStackParamList } from '../../types/navigation'

const ICON_SIZE = 56
/** Ancho del nombre bajo el icono: un poco más que el icono para que quepa algo más de texto. */
const ITEM_WIDTH = 64
/** Hueco entre iconos en una fila con scroll, y entre las dos filas. */
const ROW_GAP = 14
/** Hueco mínimo entre iconos al repartirlos por el ancho en dos filas. */
const MIN_GAP = 8
const HAPTIC_OPTS = { enableVibrateFallback: true, ignoreAndroidSystemSettings: false }

type HomeMiniAppsProps = {
	navigation: NavigationProp<RootStackParamList>
	/** «Ver todas»: el catálogo (`ROUTES.MINIAPPS`). */
	onSeeAll: () => void
	style?: StyleProp<ViewStyle>
}

/**
 * Mini-apps del Home, debajo de las últimas transacciones: las favoritas del
 * usuario y luego las destacadas (`pickHomeMiniApps`), que abren la mini-app en
 * el acto, como la fila de pago rápido. En un teléfono pequeño es una fila de
 * hasta seis con scroll; en una pantalla razonable, dos filas que llenan el
 * ancho (`homeMiniAppsGrid`, la misma idea que las filas de tiendas). Mantener
 * pulsada una abre su menú (favorita, acceso directo, compartir). Comparte la
 * query del catálogo (`['miniapps','list']`), así que no cuesta una petición
 * extra. Sin apps (cargando sin caché, error o solo borradores) no ocupa nada.
 *
 * También publica las favoritas como accesos rápidos del icono de QvaPay: el
 * Home está montado durante toda la sesión. Fuera de foco está congelado, así
 * que al marcar una favorita en otra pantalla los publica `useMiniAppFavorites`.
 */
const HomeMiniApps = ({ navigation, onSeeAll, style }: HomeMiniAppsProps) => {

	const { t } = useTranslation()
	const { theme } = useTheme()
	const textStyles = useTextStyles(theme)

	const { data } = useMiniAppsList()
	const { favorites, ready } = useMiniAppFavorites()
	// Ancho útil = ventana menos los márgenes del Home (`containerStyles.subContainer`)
	const { width, height } = useWindowDimensions()
	const grid = useMemo(
		() => homeMiniAppsGrid({ width: width - 2 * theme.spacing.md, height, itemWidth: ITEM_WIDTH, minGap: MIN_GAP, rowGap: ROW_GAP }),
		[width, height, theme.spacing.md],
	)
	const apps = useMemo(() => pickHomeMiniApps(data, { favorites, limit: grid.limit }), [data, favorites, grid.limit])
	const rows = useMemo(() => splitHomeMiniApps(apps, grid), [apps, grid])
	const [menuApp, setMenuApp] = useState<MiniApp | null>(null)

	// Sin directorio o sin haber leído las favoritas del disco no se toca nada:
	// en el arranque vaciarlos para rellenarlos al instante sería ruido
	const quickActions = useMemo(() => data && ready ? quickActionFavorites(data, favorites) : null, [data, favorites, ready])
	useEffect(() => {
		if (quickActions) setMiniAppQuickActions(quickActions)
	}, [quickActions])

	if (apps.length === 0) return null

	const openMenu = (app: MiniApp) => {
		ReactNativeHapticFeedback.trigger('impactMedium', HAPTIC_OPTS)
		setMenuApp(app)
	}

	return (
		<View style={style} testID="home-miniapps">
			<QPSectionHeader title={t('home.sections.miniApps')} subtitle={t('common.actions.seeAll')} iconName="arrow-right" onPress={onSeeAll} />
			<ScrollView horizontal showsHorizontalScrollIndicator={false}>
				<View style={styles.rows}>
					{rows.map((row, index) => (
						<View key={row[0].slug} style={[styles.row, { gap: rows.length > 1 ? grid.gap : ROW_GAP }]} testID={`home-miniapps-row-${index}`}>
							{row.map(app => (
								<QPPressable
									key={app.slug}
									onPress={() => navigation.navigate(ROUTES.MINIAPP_HOST, { slug: app.slug, name: app.name, icon: app.icon })}
									onLongPress={() => openMenu(app)}
									variant="scale"
									style={styles.item}
									accessibilityRole="button"
									accessibilityLabel={app.name}
									accessibilityHint={t('miniapps.actions.longPressHint')}
									testID={`home-miniapp-${app.slug}`}
								>
									<MiniAppIcon app={app} size={ICON_SIZE} />
									<Text style={[textStyles.caption, styles.name, { color: theme.colors.secondaryText }]} numberOfLines={1}>{app.name}</Text>
								</QPPressable>
							))}
						</View>
					))}
				</View>
			</ScrollView>
			<MiniAppActionsSheet app={menuApp} onClose={() => setMenuApp(null)} />
		</View>
	)
}

const styles = StyleSheet.create({
	rows: { gap: ROW_GAP },
	row: { flexDirection: 'row' },
	item: { alignItems: 'center', gap: 6, width: ITEM_WIDTH },
	name: { width: ITEM_WIDTH, textAlign: 'center' },
})

export default HomeMiniApps
