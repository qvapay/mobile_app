import { StyleSheet, Text, View } from 'react-native'
import FontAwesome6 from '@react-native-vector-icons/fontawesome6'

// Theme
import { useTheme } from '../../../../../theme/ThemeContext'

// Model
import type { SwapNotice, SwapNoticeTone } from '../../swapView'

/**
 * Pila de avisos de la pantalla de Swap (patrocinio del gas, par deshabilitado, wallet sin
 * registrar, error de carga…). Qué avisos salen lo decide `swapView.ts`; aquí solo se
 * resuelve el color del tono contra el tema y se apilan.
 */
const SwapNotices = ({ notices }: { notices: SwapNotice[] }) => {

	const { theme } = useTheme()
	const color: Record<SwapNoticeTone, string> = { primary: theme.colors.primary, warning: theme.colors.warning, danger: theme.colors.danger }

	return (
		<>
			{notices.map(notice => (
				<View key={notice.key} style={[styles.notice, { backgroundColor: color[notice.tone] + '12' }]}>
					<FontAwesome6 name={notice.icon} size={13} color={color[notice.tone]} iconStyle="solid" style={styles.icon} />
					<Text style={[styles.text, { color: theme.colors.primaryText, fontFamily: theme.typography.fontFamily.regular, fontSize: theme.typography.fontSize.sm }]}>{notice.text}</Text>
				</View>
			))}
		</>
	)
}

const styles = StyleSheet.create({
	notice: { flexDirection: 'row', gap: 10, padding: 12, borderRadius: 12, alignItems: 'flex-start' },
	icon: { marginTop: 2 },
	text: { flex: 1 },
})

export default SwapNotices
