import { Linking, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import FastImage from '@d11/react-native-fast-image'
import FontAwesome6 from '@react-native-vector-icons/fontawesome6'

// Theme
import { useTheme } from '../../theme/ThemeContext'
import { useTextStyles } from '../../theme/themeUtils'

// UI
import QPSheet from '../../ui/QPSheet'
import QPPressable from '../../ui/particles/QPPressable'

// Data
import { bundledContributors, useContributorsQuery } from './settingsQueries'
import { avatarUrl, CONTRIBUTORS_REPO_URL } from './contributors'
import type { GithubContributor } from './contributors'

const AVATAR = 44

/**
 * Easter egg del pie de Ajustes: agradecimiento y la lista de personas que han
 * contribuido código a la app (GitHub), cada una con su avatar y su usuario. Tocar
 * una fila abre su perfil. La query solo corre con la hoja abierta.
 */
const ContributorsSheet = ({ visible, onClose }: { visible: boolean, onClose: () => void }) => {

	const { t } = useTranslation()
	const { theme } = useTheme()
	const textStyles = useTextStyles(theme)
	// Con la red caída (o GitHub sin cuota) la query queda en error y sin datos:
	// se enseña la foto empaquetada antes que una hoja vacía.
	const { data } = useContributorsQuery(visible)
	const contributors: GithubContributor[] = data ?? bundledContributors

	return (
		<QPSheet visible={visible} title={t('settings.contributors.title')} onClose={onClose}>
			<ScrollView bounces={false} showsVerticalScrollIndicator={false}>
				<Text style={[textStyles.body, { color: theme.colors.secondaryText }]}>{t('settings.contributors.message')}</Text>

				<View style={styles.list}>
					{contributors.map((c, index) => (
						<QPPressable key={c.login} onPress={() => Linking.openURL(c.html_url)} style={[styles.row, index > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.colors.border }]}>
							<FastImage source={{ uri: avatarUrl(c, AVATAR * 3), cache: FastImage.cacheControl.web }} style={[styles.avatar, { backgroundColor: theme.colors.surface }]} resizeMode={FastImage.resizeMode.cover} />
							<Text style={[textStyles.h5, styles.login, { color: theme.colors.primaryText }]} numberOfLines={1}>@{c.login}</Text>
							<FontAwesome6 name="arrow-up-right-from-square" size={14} color={theme.colors.secondaryText} iconStyle="solid" />
						</QPPressable>
					))}
				</View>

				<QPPressable onPress={() => Linking.openURL(CONTRIBUTORS_REPO_URL)} style={styles.footer}>
					<FontAwesome6 name="github" size={14} color={theme.colors.secondaryText} iconStyle="brand" />
					<Text style={[textStyles.h7, styles.footerText, { color: theme.colors.secondaryText }]}>{t('settings.contributors.footer')}</Text>
				</QPPressable>
			</ScrollView>
		</QPSheet>
	)
}

const styles = StyleSheet.create({
	list: { marginTop: 12 },
	row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, gap: 14 },
	avatar: { width: AVATAR, height: AVATAR, borderRadius: AVATAR / 2 },
	login: { flex: 1 },
	footer: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8, paddingVertical: 10 },
	footerText: { flex: 1 },
})

export default ContributorsSheet
