import { useMemo } from 'react'
import { View, Text, ScrollView, StyleSheet } from 'react-native'
import type { StyleProp, ViewStyle } from 'react-native'
import { useTranslation } from 'react-i18next'
import type { NavigationProp } from '@react-navigation/native'

import { useTheme } from '../../theme/ThemeContext'
import { useTextStyles } from '../../theme/themeUtils'
import { ROUTES } from '../../routes'
import QPPressable from '../../ui/particles/QPPressable'
import QPSectionHeader from '../../ui/particles/QPSectionHeader'
import MiniAppIcon from '../miniapps/MiniAppIcon'
import { useMiniAppsList } from '../miniapps/miniappsQueries'
import { pickHomeMiniApps } from '../miniapps/miniappsCatalog'

import type { RootStackParamList } from '../../types/navigation'

const ICON_SIZE = 56
/** Ancho del nombre bajo el icono: un poco más que el icono para que quepa algo más de texto. */
const ITEM_WIDTH = 64

type HomeMiniAppsProps = {
	navigation: NavigationProp<RootStackParamList>
	/** «Ver todas»: el catálogo (`ROUTES.MINIAPPS`). */
	onSeeAll: () => void
	style?: StyleProp<ViewStyle>
}

/**
 * Fila de mini-apps del Home, debajo de las últimas transacciones: seis iconos
 * (destacadas primero, `pickHomeMiniApps`) que abren la mini-app en el acto,
 * como la fila de pago rápido. Comparte la query del catálogo
 * (`['miniapps','list']`), así que no cuesta una petición extra. Sin apps
 * (cargando sin caché, error o solo borradores) no ocupa nada.
 */
const HomeMiniApps = ({ navigation, onSeeAll, style }: HomeMiniAppsProps) => {

	const { t } = useTranslation()
	const { theme } = useTheme()
	const textStyles = useTextStyles(theme)

	const { data } = useMiniAppsList()
	const apps = useMemo(() => pickHomeMiniApps(data), [data])
	if (apps.length === 0) return null

	return (
		<View style={style} testID="home-miniapps">
			<QPSectionHeader title={t('home.sections.miniApps')} subtitle={t('common.actions.seeAll')} iconName="arrow-right" onPress={onSeeAll} />
			<ScrollView horizontal showsHorizontalScrollIndicator={false}>
				<View style={styles.row}>
					{apps.map(app => (
						<QPPressable
							key={app.slug}
							onPress={() => navigation.navigate(ROUTES.MINIAPP_HOST, { slug: app.slug, name: app.name, icon: app.icon })}
							variant="scale"
							style={styles.item}
							accessibilityRole="button"
							accessibilityLabel={app.name}
							testID={`home-miniapp-${app.slug}`}
						>
							<MiniAppIcon app={app} size={ICON_SIZE} />
							<Text style={[textStyles.caption, styles.name, { color: theme.colors.secondaryText }]} numberOfLines={1}>{app.name}</Text>
						</QPPressable>
					))}
				</View>
			</ScrollView>
		</View>
	)
}

const styles = StyleSheet.create({
	row: { flexDirection: 'row', gap: 14 },
	item: { alignItems: 'center', gap: 6, width: ITEM_WIDTH },
	name: { width: ITEM_WIDTH, textAlign: 'center' },
})

export default HomeMiniApps
