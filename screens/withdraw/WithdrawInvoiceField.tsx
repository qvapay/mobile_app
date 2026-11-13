import { View, Text, StyleSheet } from 'react-native'
import { useTranslation } from 'react-i18next'
import FontAwesome6 from '@react-native-vector-icons/fontawesome6'
import { pick, types, errorCodes, isErrorWithCode } from '@react-native-documents/picker'
import { toast } from 'sonner-native'

import QPPressable from '../../ui/particles/QPPressable'
import { scaleType } from '../../theme/themeUtils'
import { invoiceFileProblem, INVOICE_MAX_BYTES, INVOICE_THRESHOLD } from './usRail'
import type { InvoiceFile } from './usRail'

import type { Theme } from '../../theme/ThemeContext'
import type { TextStyles } from '../../theme/themeUtils'

type Props = {
	/** `large_bank`: retiro bancario de $3,000 o más · `third_party`: pago a un tercero desde una cuenta de Cuba. */
	reason: 'large_bank' | 'third_party'
	file: InvoiceFile | null
	onChange: (file: InvoiceFile | null) => void
	maxBytes?: number
	/** El servidor rechazó la factura (`INVOICE_*`): se marca el campo. */
	highlighted?: boolean
	/** Dentro de otra tarjeta: sin fondo propio. */
	embedded?: boolean
	theme: Theme
	textStyles: TextStyles
}

const formatSize = (bytes?: number | null) => {
	if (typeof bytes !== 'number' || bytes <= 0) return ''
	return bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`
}

/**
 * Factura del retiro en PDF (máximo 10 MB), elegida con el selector de documentos. El servidor la exige
 * en los retiros bancarios de $3,000 o más y en todo pago a un tercero desde una cuenta de Cuba, y
 * mira el contenido del archivo (no el tipo que dice el teléfono) y que no lleve números de tarjeta.
 */
const WithdrawInvoiceField = ({ reason, file, onChange, maxBytes = INVOICE_MAX_BYTES, highlighted = false, embedded = false, theme, textStyles }: Props) => {

	const { t } = useTranslation()

	const choose = async () => {
		try {
			const [doc] = await pick({ type: [types.pdf] })
			if (!doc) return
			const next: InvoiceFile = { uri: doc.uri, name: doc.name || 'factura.pdf', type: doc.type || 'application/pdf', size: doc.size ?? null }
			const problem = invoiceFileProblem(next, maxBytes)
			if (problem) {
				toast.error(problem === 'not_pdf' ? t('withdraw.usRail.invoice.notPdf') : problem === 'too_big' ? t('withdraw.usRail.invoice.tooBig') : t('withdraw.usRail.invoice.empty'))
				return
			}
			onChange(next)
		} catch (e) {
			if (isErrorWithCode(e) && e.code === errorCodes.OPERATION_CANCELED) return
			toast.error(t('withdraw.usRail.invoice.pickerError'))
		}
	}

	const surfaceBorder = !embedded && !theme.isDark && { borderWidth: 1, borderColor: theme.colors.border }

	return (
		<View testID="withdraw-invoice" style={[styles.card, embedded ? styles.embedded : { backgroundColor: theme.colors.surface }, surfaceBorder, highlighted && { borderWidth: 1.5, borderColor: theme.colors.danger }]}>
			<View style={styles.header}>
				<FontAwesome6 name="file-pdf" size={16} color={theme.colors.primary} iconStyle="solid" />
				<Text style={[textStyles.h6, styles.flex, { color: theme.colors.primaryText }]}>{t('withdraw.usRail.invoice.title')}</Text>
			</View>
			<Text style={[textStyles.caption, styles.body, { color: theme.colors.secondaryText, lineHeight: scaleType(theme, 17) }]}>
				{reason === 'third_party'
					? t('withdraw.usRail.invoice.thirdParty')
					: t('withdraw.usRail.invoice.largeBank', { amount: INVOICE_THRESHOLD.toLocaleString('en-US') })}
			</Text>
			{file ? (
				<View style={[styles.fileRow, { backgroundColor: theme.colors.background }]}>
					<FontAwesome6 name="file-lines" size={14} color={theme.colors.secondaryText} iconStyle="solid" />
					<View style={styles.flex}>
						<Text numberOfLines={1} style={[textStyles.caption, { color: theme.colors.primaryText }]}>{file.name}</Text>
						{!!formatSize(file.size) && <Text style={[textStyles.caption, { color: theme.colors.tertiaryText }]}>{formatSize(file.size)}</Text>}
					</View>
					<QPPressable onPress={choose} hitSlop={8} accessibilityRole="button" testID="withdraw-invoice-replace">
						<Text style={[textStyles.caption, { color: theme.colors.primary, fontFamily: theme.typography.fontFamily.semiBold }]}>{t('withdraw.usRail.invoice.replace')}</Text>
					</QPPressable>
					<QPPressable onPress={() => onChange(null)} hitSlop={8} accessibilityRole="button" accessibilityLabel={t('withdraw.usRail.invoice.remove')} testID="withdraw-invoice-remove">
						<FontAwesome6 name="xmark" size={14} color={theme.colors.secondaryText} iconStyle="solid" />
					</QPPressable>
				</View>
			) : (
				<QPPressable onPress={choose} accessibilityRole="button" testID="withdraw-invoice-pick" style={[styles.pick, { borderColor: theme.colors.primary }]}>
					<FontAwesome6 name="paperclip" size={14} color={theme.colors.primary} iconStyle="solid" />
					<Text style={[textStyles.h7, { color: theme.colors.primary }]}>{t('withdraw.usRail.invoice.pick')}</Text>
				</QPPressable>
			)}
		</View>
	)
}

const styles = StyleSheet.create({
	card: { marginTop: 16, padding: 14, borderRadius: 14, borderCurve: 'continuous' },
	embedded: { paddingHorizontal: 0, paddingBottom: 0 },
	header: { flexDirection: 'row', alignItems: 'center', gap: 8 },
	flex: { flex: 1 },
	body: { marginTop: 6 },
	fileRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 12, padding: 12, borderRadius: 12, borderCurve: 'continuous' },
	pick: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 12, paddingVertical: 12, borderRadius: 12, borderCurve: 'continuous', borderWidth: 1.5, borderStyle: 'dashed' },
})

export default WithdrawInvoiceField
