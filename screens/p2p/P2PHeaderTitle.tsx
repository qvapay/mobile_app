import { View, Text, StyleSheet, useWindowDimensions } from "react-native"
import { useTranslation } from "react-i18next"
import FontAwesome6 from "@react-native-vector-icons/fontawesome6"

import { useTheme } from "../../theme/ThemeContext"
import { createTextStyles } from "../../theme/themeUtils"

import QPCoin from "../../ui/particles/QPCoin"
import P2PHeaderTimer from "./P2PHeaderTimer"

import type { TFunction } from "i18next"
import type { P2PStatus } from "../../types/domain"
import type { TradeHeaderModel } from "./p2pTradeRoom"

/** Lo que ocupan el botón de atrás y el avatar, con sus márgenes: el título nunca los empuja. */
const HEADER_SIDES = 136

const statusLabel = (status: P2PStatus, t: TFunction): string => {
	switch (status) {
		case "open": return t("common.status.open")
		case "processing": return t("common.status.processing")
		case "paid": return t("common.status.paid")
		case "completed": return t("common.status.completed")
		case "cancelled": return t("common.status.cancelled")
		case "revision": return t("common.status.revision")
	}
}

type P2PHeaderTitleProps = TradeHeaderModel & {
	status: P2PStatus
	/** ISO del fin de la ventana de pago: con ella, la cuenta atrás ocupa el lugar del estado. */
	expiresAt?: string | null
	/** Oferta en pausa: sigue `open`, pero «Abierta» sería mentira. */
	paused?: boolean
}

/**
 * Título del detalle de oferta: la moneda con un sello de compra/venta, el monto
 * y debajo el lado del trato con su estado o la cuenta atrás de la ventana de
 * pago. Los colores son los del mercado: Comprar rojo, Vender verde.
 */
const P2PHeaderTitle = ({ side, amount, coinLogo, coinName, status, expiresAt, paused = false }: P2PHeaderTitleProps) => {

	const { t } = useTranslation()
	const { theme } = useTheme()
	const textStyles = createTextStyles(theme)
	const { width } = useWindowDimensions()

	const buying = side === "buy"
	const sideLabel = buying ? t("common.p2pType.buy") : t("common.p2pType.sell")
	const stateLabel = paused ? t("common.status.paused") : statusLabel(status, t)

	return (
		<View
			style={[styles.row, { maxWidth: width - HEADER_SIDES }]}
			accessible
			accessibilityRole="header"
			accessibilityLabel={`${sideLabel}, ${amount} ${coinName}, ${stateLabel}`}
		>
			<View style={styles.glyph}>
				<QPCoin coin={coinLogo} size={32} />
				<View style={[styles.seal, { backgroundColor: buying ? theme.colors.danger : theme.colors.successFill, borderColor: theme.colors.background }]}>
					<FontAwesome6 name={buying ? "arrow-down" : "arrow-up"} size={8} color={buying ? theme.colors.almostWhite : theme.colors.successFillText} iconStyle="solid" />
				</View>
			</View>

			<View style={styles.text}>
				<View style={styles.line}>
					<Text style={[textStyles.h5, styles.amount, { color: theme.colors.primaryText, fontFamily: theme.typography.fontFamily.semiBold }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
						{amount}
					</Text>
					<Text style={[textStyles.h6, styles.coinName, { color: theme.colors.secondaryText }]} numberOfLines={1}>{coinName}</Text>
				</View>
				<View style={styles.line}>
					<Text style={[textStyles.h7, { color: buying ? theme.colors.dangerText : theme.colors.successText, fontFamily: theme.typography.fontFamily.medium }]} numberOfLines={1}>{sideLabel}</Text>
					<Text style={[textStyles.h7, { color: theme.colors.tertiaryText }]}>·</Text>
					{expiresAt
						? <P2PHeaderTimer expiresAt={expiresAt} />
						: <Text style={[textStyles.h7, { color: paused ? theme.colors.warning : theme.colors.secondaryText }]} numberOfLines={1}>{stateLabel}</Text>}
				</View>
			</View>
		</View>
	)
}

const styles = StyleSheet.create({
	row: {
		flexDirection: "row",
		alignItems: "center",
		gap: 10,
	},
	glyph: {
		width: 32,
		height: 32,
	},
	seal: {
		position: "absolute",
		right: -4,
		bottom: -3,
		width: 16,
		height: 16,
		borderRadius: 8,
		borderWidth: 2,
		alignItems: "center",
		justifyContent: "center",
	},
	text: {
		flexShrink: 1,
	},
	line: {
		flexDirection: "row",
		alignItems: "center",
		gap: 4,
	},
	amount: {
		flexShrink: 1,
	},
	coinName: {
		flexShrink: 0,
		maxWidth: 96,
	},
})

export default P2PHeaderTitle
