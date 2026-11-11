import { View, Text, StyleSheet } from 'react-native'
import { useTranslation } from 'react-i18next'
import FontAwesome6 from '@react-native-vector-icons/fontawesome6'

import { useTheme } from '../../theme/ThemeContext'
import { useTextStyles, hexToRgba } from '../../theme/themeUtils'
import type { PreviewRole } from './miniappTesting'

/**
 * Aviso fijo de una mini-app sin publicar, entre la barra y el WebView. Es
 * nativo y vive FUERA de la web: la mini-app no lo puede tapar, mover ni quitar
 * (ni con `ui.colors.set`), y el usuario tampoco lo cierra. QvaPay aún no la
 * ha revisado, y para un tester es la única defensa ante un formulario que
 * imite el login de QvaPay.
 *
 * El dueño ve un recordatorio de que es su vista previa y que no cobra; el
 * tester, la advertencia.
 */
const MiniAppPreviewBanner = ({ role }: { role: PreviewRole }) => {

	const { t } = useTranslation()
	const { theme } = useTheme()
	const textStyles = useTextStyles(theme)

	return (
		<View
			style={[styles.banner, { backgroundColor: hexToRgba(theme.colors.warning, 0.14), borderBottomColor: hexToRgba(theme.colors.warning, 0.3) }]}
			accessibilityRole="alert"
			testID="miniapp-preview-banner"
		>
			<FontAwesome6 name="flask" size={13} color={theme.colors.warning} iconStyle="solid" style={styles.icon} />
			<Text style={[textStyles.caption, styles.text, { color: theme.colors.primaryText }]}>
				<Text style={{ fontFamily: theme.typography.fontFamily.medium }}>
					{role === 'tester' ? t('miniapps.testing.bannerTesterTitle') : t('miniapps.testing.bannerOwnerTitle')}
				</Text>
				{' · '}
				{role === 'tester' ? t('miniapps.testing.bannerTesterBody') : t('miniapps.testing.bannerOwnerBody')}
			</Text>
		</View>
	)
}

const styles = StyleSheet.create({
	banner: { flexDirection: 'row', alignItems: 'flex-start', paddingHorizontal: 16, paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth },
	icon: { marginTop: 2, marginRight: 8 },
	text: { flex: 1 },
})

export default MiniAppPreviewBanner
