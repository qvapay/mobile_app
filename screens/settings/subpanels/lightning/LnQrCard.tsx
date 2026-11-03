import { StyleSheet, Text, View, useWindowDimensions } from 'react-native'
import QRCodeStyled from 'react-native-qrcode-styled'

// Theme
import { useTheme } from '../../../../theme/ThemeContext'

// UI
import QPPressable from '../../../../ui/particles/QPPressable'

// Helpers
import { copyTextToClipboard } from '../../../../helpers'

// Tipos
import type { LightningAddress } from '../../../../types/domain'

export const SATS_COLOR = '#F7931A'

type Props = {
	address: LightningAddress
	/** Texto bajo la dirección (p. ej. «Toca para copiar»). */
	hint?: string
	/** Ancho máximo del QR (por defecto, el ancho de pantalla menos márgenes, tope 240). */
	maxSize?: number
}

/**
 * QR de la Lightning Address (`address.qr` = `lightning:LNURL…`, lo que entienden
 * todas las wallets) con la dirección en grande debajo. Tocar el QR o la
 * dirección copia `name@dominio`, que es lo que se comparte de persona a persona;
 * la LNURL solo viaja dentro del QR.
 */
const LnQrCard = ({ address, hint, maxSize }: Props) => {

	const { theme } = useTheme()
	const { width } = useWindowDimensions()
	const qrSize = Math.min(width - 120, maxSize ?? 240)

	const copy = () => copyTextToClipboard(address.address)

	return (
		<QPPressable onPress={copy} style={styles.wrap} accessibilityRole="button" accessibilityLabel={address.address}>
			<View style={styles.qrCard}>
				<QRCodeStyled
					data={address.qr}
					style={styles.qrInner}
					size={qrSize}
					padding={8}
					{...{ pieceSize: 7, errorCorrectionLevel: 'M', backgroundColor: '#FFFFFF' }}
					isPiecesGlued
					pieceBorderRadius={2}
					pieceCornerType={'cut'}
					color={'#000000'}
					outerEyesOptions={{ borderRadius: 2, color: SATS_COLOR }}
				/>
			</View>
			<Text
				selectable
				numberOfLines={1}
				adjustsFontSizeToFit
				style={[styles.address, { color: theme.colors.primaryText, fontFamily: theme.typography.fontFamily.monoMedium, fontSize: theme.typography.fontSize.lg }]}
			>
				{address.address}
			</Text>
			{!!hint && (
				<Text style={{ color: theme.colors.tertiaryText, fontFamily: theme.typography.fontFamily.regular, fontSize: theme.typography.fontSize.xs, textAlign: 'center' }}>
					{hint}
				</Text>
			)}
		</QPPressable>
	)
}

const styles = StyleSheet.create({
	wrap: { alignItems: 'center', gap: 12 },
	qrCard: { borderRadius: 16, padding: 10, backgroundColor: '#FFFFFF', overflow: 'hidden' },
	qrInner: { backgroundColor: '#FFFFFF' },
	address: { textAlign: 'center', paddingHorizontal: 12, letterSpacing: 0.2 },
})

export default LnQrCard
