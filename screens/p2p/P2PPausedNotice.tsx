import { View, Text, StyleSheet } from "react-native"
import { useTranslation } from "react-i18next"
import FontAwesome6 from "@react-native-vector-icons/fontawesome6"

import { getDateLocale } from "../../i18n"
import { scaleType } from "../../theme/themeUtils"
import { pauseResumesAt } from "./p2pPause"

import type { Theme } from "../../theme/ThemeContext"
import type { TextStyles } from "../../theme/themeUtils"
import type { P2POfferPause } from "../../types/domain"

type P2PPausedNoticeProps = {
	pause: P2POfferPause
	/** Por rango con órdenes vivas: la pausa solo frena las nuevas. */
	hasLiveOrders?: boolean
	theme: Theme
	textStyles: TextStyles
}

/**
 * Lo que ve el dueño de una oferta en pausa, en el lugar de la animación de
 * búsqueda: ya no se está buscando a nadie. Reactivarla es el botón de la barra.
 */
const P2PPausedNotice = ({ pause, hasLiveOrders = false, theme, textStyles }: P2PPausedNoticeProps) => {

	const { t } = useTranslation()

	const resumesAt = pauseResumesAt(pause)
	const body = resumesAt
		? t('p2p.offer.paused.takerLeft', { time: new Date(resumesAt).toLocaleTimeString(getDateLocale(), { hour: "2-digit", minute: "2-digit" }) })
		: t('p2p.offer.paused.body')

	return (
		<View style={styles.wrap} testID="p2p-paused-notice">
			<View style={[styles.glyph, { backgroundColor: theme.colors.warning + "1A" }]}>
				<FontAwesome6 name="pause" size={22} color={theme.colors.warning} iconStyle="solid" />
			</View>
			<Text style={[textStyles.h5, { color: theme.colors.primaryText, textAlign: "center" }]}>{t('p2p.offer.paused.title')}</Text>
			<Text style={[textStyles.h6, { color: theme.colors.secondaryText, textAlign: "center", lineHeight: scaleType(theme, 20) }]}>
				{hasLiveOrders ? `${body} ${t('p2p.offer.paused.ordersContinue')}` : body}
			</Text>
		</View>
	)
}

const styles = StyleSheet.create({
	wrap: {
		flex: 1,
		alignItems: "center",
		justifyContent: "center",
		gap: 8,
		paddingVertical: 12,
		paddingHorizontal: 24,
	},
	glyph: {
		width: 56,
		height: 56,
		borderRadius: 28,
		alignItems: "center",
		justifyContent: "center",
		marginBottom: 4,
	},
})

export default P2PPausedNotice
