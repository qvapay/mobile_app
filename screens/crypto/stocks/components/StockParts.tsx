/**
 * Piezas comunes de la sección de acciones (estilo Robinhood): logo, fila con píldora de
 * precio, línea de variación y la hoja de riesgos. Verde y rojo son TINTA (`successText` /
 * `dangerText`); el fondo de la píldora es esa tinta con alfa, nunca `success` sólido con texto.
 */
import { memo } from 'react'
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import FastImage from '@d11/react-native-fast-image'
import FontAwesome6 from '@react-native-vector-icons/fontawesome6'

import QPButton from '../../../../ui/particles/QPButton'
import QPPressable from '../../../../ui/particles/QPPressable'
import { useContainerStyles } from '../../../../theme/themeUtils'
import { displayAmount } from '../../../../wallet/chains/units'
import type { Theme } from '../../../../theme/ThemeContext'
import type { XStock } from '../../../../wallet/xstocks'
import type { XStockPosition } from '../xstocksModel'

/** Logo oficial del emisor (mismo que enseña su metadata on-chain). */
export const stockLogoUrl = (stock: XStock) => `https://xstocks-metadata.backed.fi/logos/tokens/${stock.symbol}.png`

export const formatUsd = (value: number | null | undefined, digits = 2): string => {
	if (value === null || value === undefined || !Number.isFinite(value)) return '—'
	const abs = Math.abs(value).toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits })
	return `${value < 0 ? '-' : ''}$${abs}`
}

export const formatSignedUsd = (value: number): string => `${value >= 0 ? '+' : '-'}${formatUsd(Math.abs(value))}`

export const formatPct = (value: number): string => `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`

/** Tinta de tendencia: plano o desconocido cuenta como subida (como Robinhood). */
export const trendInk = (theme: Theme, change: number | null | undefined) =>
	(change ?? 0) < 0 ? theme.colors.dangerText : theme.colors.successText

export const StockLogo = memo(({ stock, size = 40 }: { stock: XStock, size?: number }) => (
	<FastImage source={{ uri: stockLogoUrl(stock) }} style={{ width: size, height: size, borderRadius: size / 2 }} resizeMode={FastImage.resizeMode.cover} />
))

/** "▲ $1.23 (0.45%) Hoy" — la línea bajo el héroe. */
export const ChangeLine = ({ amount, pct, label, theme }: { amount: number, pct: number, label: string, theme: Theme }) => {
	const ink = trendInk(theme, amount)
	return (
		<View style={styles.changeLine}>
			<FontAwesome6 name={amount < 0 ? 'caret-down' : 'caret-up'} size={12} color={ink} iconStyle="solid" />
			<Text style={{ color: ink, fontSize: theme.typography.fontSize.sm, fontFamily: theme.typography.fontFamily.medium }}>
				{formatSignedUsd(amount)} ({formatPct(pct)})
			</Text>
			<Text style={{ color: theme.colors.secondaryText, fontSize: theme.typography.fontSize.sm, fontFamily: theme.typography.fontFamily.regular }}>{label}</Text>
		</View>
	)
}

/**
 * Fila: logo, símbolo y (acciones que tienes | nombre), y a la derecha la píldora con el
 * precio teñida por la variación del día.
 */
export const StockRow = memo(({ position, theme, showShares, onPress, isLast }: { position: XStockPosition, theme: Theme, showShares: boolean, onPress: () => void, isLast: boolean }) => {
	const { t } = useTranslation()
	const { stock, quote } = position
	const ink = trendInk(theme, quote?.change24h)
	return (
		<QPPressable onPress={onPress} style={[styles.row, !isLast && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.colors.border + '60' }]}>
			<StockLogo stock={stock} />
			<View style={styles.rowInfo}>
				<Text style={{ color: theme.colors.primaryText, fontSize: theme.typography.fontSize.md, fontFamily: theme.typography.fontFamily.semiBold }}>{stock.underlying}</Text>
				<Text numberOfLines={1} style={{ color: theme.colors.secondaryText, fontSize: theme.typography.fontSize.sm, fontFamily: theme.typography.fontFamily.regular }}>
					{showShares ? t('crypto.xstocks.sharesCount', { shares: displayAmount(position.shares, 4) }) : stock.name}
				</Text>
			</View>
			<View style={styles.rowRight}>
				<View style={[styles.pricePill, { backgroundColor: ink + '1F' }]}>
					<Text style={{ color: ink, fontSize: theme.typography.fontSize.sm, fontFamily: theme.typography.fontFamily.semiBold }}>
						{showShares && position.value !== null ? formatUsd(position.value) : formatUsd(quote?.price)}
					</Text>
				</View>
				{quote?.change24h !== null && quote?.change24h !== undefined && (
					<Text style={{ color: ink, fontSize: theme.typography.fontSize.xs, fontFamily: theme.typography.fontFamily.medium }}>{formatPct(quote.change24h)}</Text>
				)}
			</View>
		</QPPressable>
	)
})

const RISK_POINTS = ['token', 'issuer', 'noRights', 'hours', 'dividends', 'region'] as const

/**
 * Riesgos de las acciones tokenizadas. Se enseña antes de la primera compra (y bajo demanda
 * desde el detalle). Tarjeta centrada con el patrón de modales de la app.
 */
export const RiskSheet = ({ visible, onClose, onAccept, theme }: { visible: boolean, onClose: () => void, onAccept?: () => void, theme: Theme }) => {
	const { t } = useTranslation()
	const containerStyles = useContainerStyles(theme)
	const points = RISK_POINTS.map(key => t(`crypto.xstocks.risks.points.${key}`))
	return (
		<Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={onClose}>
			<Pressable style={containerStyles.modalOverlay} onPress={onClose}>
				<Pressable style={[containerStyles.modalCard, styles.riskCard]} onPress={() => { }}>
					<Text style={{ color: theme.colors.primaryText, fontSize: theme.typography.fontSize.lg, fontFamily: theme.typography.fontFamily.semiBold }}>{t('crypto.xstocks.risks.title')}</Text>
					<ScrollView style={styles.riskScroll} contentContainerStyle={styles.riskList}>
						{points.map(point => (
							<View key={point} style={styles.riskPoint}>
								<FontAwesome6 name="circle-info" size={13} color={theme.colors.secondaryText} iconStyle="solid" style={styles.riskIcon} />
								<Text style={[styles.riskText, { color: theme.colors.secondaryText, fontSize: theme.typography.fontSize.sm, fontFamily: theme.typography.fontFamily.regular }]}>{point}</Text>
							</View>
						))}
					</ScrollView>
					<QPButton title={onAccept ? t('crypto.xstocks.risks.accept') : t('crypto.xstocks.risks.close')} onPress={onAccept ?? onClose} />
				</Pressable>
			</Pressable>
		</Modal>
	)
}

const styles = StyleSheet.create({
	changeLine: {
		flexDirection: 'row',
		alignItems: 'center',
		gap: 6,
	},
	row: {
		flexDirection: 'row',
		alignItems: 'center',
		gap: 12,
		paddingVertical: 12,
	},
	rowInfo: {
		flex: 1,
		gap: 2,
	},
	rowRight: {
		alignItems: 'flex-end',
		gap: 3,
	},
	pricePill: {
		paddingHorizontal: 10,
		paddingVertical: 5,
		borderRadius: 8,
		minWidth: 84,
		alignItems: 'center',
	},
	riskCard: {
		maxHeight: '75%',
		gap: 14,
	},
	riskScroll: {
		flexGrow: 0,
	},
	riskList: {
		gap: 10,
	},
	riskPoint: {
		flexDirection: 'row',
		gap: 10,
	},
	riskIcon: {
		marginTop: 2,
	},
	riskText: {
		flex: 1,
		lineHeight: 20,
	},
})
