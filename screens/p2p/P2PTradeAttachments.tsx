import { ActivityIndicator, View, Text } from 'react-native'
import { useTranslation } from 'react-i18next'
import FontAwesome6 from '@react-native-vector-icons/fontawesome6'

import QPPressable from '../../ui/particles/QPPressable'
import { SurfaceHost, useFieldFill } from '../../ui/SurfaceContext'
import { timeAgo } from '../../helpers'
import { scaleType } from '../../theme/themeUtils'
import { formatAttachmentSize, proofWarningVisible } from './p2pAttachments'
import type { Theme } from '../../theme/ThemeContext'
import type { TextStyles, ContainerStyles } from '../../theme/themeUtils'
import type { P2PAttachment, P2PStatus } from '../../types/domain'

type P2PProofPickersProps = {
	uploading: boolean
	onPickImage: () => void
	onPickPdf: () => void
	/** En la cabecera de la tarjeta; sin él, a la altura del campo del ID. */
	compact?: boolean
	theme: Theme
}

/** Foto y PDF como dos iconos. Sin Modal: un selector encima de otro `<Modal>` es el modal zombi de iOS. */
export const P2PProofPickers = ({ uploading, onPickImage, onPickPdf, compact = false, theme }: P2PProofPickersProps) => {

	const { t } = useTranslation()
	const fill = useFieldFill()
	const tile = { width: compact ? 34 : 42, height: compact ? 34 : 50, borderRadius: 10, backgroundColor: fill, alignItems: 'center', justifyContent: 'center' } as const

	return (
		<View style={{ flexDirection: 'row', gap: 6 }}>
			<QPPressable onPress={onPickImage} disabled={uploading} accessibilityRole="button" accessibilityLabel={t('p2p.attachments.attachPhoto')} style={tile}>
				{uploading
					? <ActivityIndicator size="small" color={theme.colors.primary} />
					: <FontAwesome6 name="image" size={16} color={theme.colors.secondaryText} iconStyle="solid" />}
			</QPPressable>
			<QPPressable onPress={onPickPdf} disabled={uploading} accessibilityRole="button" accessibilityLabel={t('p2p.attachments.attachPdf')} style={tile}>
				<FontAwesome6 name="file-pdf" size={16} color={theme.colors.secondaryText} iconStyle="solid" />
			</QPPressable>
		</View>
	)
}

type P2PProofRowsProps = {
	attachments: P2PAttachment[]
	openingUuid: string | null
	onOpen: (attachment: P2PAttachment) => void
	theme: Theme
	textStyles: TextStyles
}

/** Una línea por adjunto, sin el nombre del fichero: es texto libre de la contraparte en una interfaz de confianza. */
export const P2PProofRows = ({ attachments, openingUuid, onOpen, theme, textStyles }: P2PProofRowsProps) => {

	const { t } = useTranslation()

	return (
		<View>
			{attachments.map((attachment, index) => (
				<QPPressable
					key={attachment.uuid}
					onPress={() => onOpen(attachment)}
					accessibilityRole="button"
					accessibilityLabel={t('p2p.attachments.openLabel', { index: index + 1 })}
					style={{ flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 36 }}
				>
					<FontAwesome6 name={attachment.kind === 'pdf' ? 'file-pdf' : 'image'} size={13} color={theme.colors.secondaryText} iconStyle="solid" />
					<Text style={[textStyles.h7, { flex: 1, color: theme.colors.primaryText }]} numberOfLines={1}>
						{t(attachment.kind === 'pdf' ? 'p2p.attachments.rowPdf' : 'p2p.attachments.rowImage', { size: formatAttachmentSize(attachment.size) })}
					</Text>
					<Text style={[textStyles.h7, { color: theme.colors.tertiaryText }]} numberOfLines={1}>
						{attachment.mine ? t('p2p.attachments.mine') : t('p2p.attachments.theirs')} · {timeAgo(attachment.created_at)}
					</Text>
					{openingUuid === attachment.uuid
						? <ActivityIndicator size="small" color={theme.colors.primary} />
						: <FontAwesome6 name="chevron-right" size={10} color={theme.colors.tertiaryText} iconStyle="solid" />}
				</QPPressable>
			))}
		</View>
	)
}

type P2PTradeAttachmentsProps = {
	attachments: P2PAttachment[]
	/** Solo quien paga el fiat manda comprobante. */
	canUpload: boolean
	isReceiver: boolean
	status: P2PStatus
	uploading: boolean
	openingUuid: string | null
	onPickImage: () => void
	onPickPdf: () => void
	onOpen: (attachment: P2PAttachment) => void
	theme: Theme
	textStyles: TextStyles
	containerStyles: ContainerStyles
}

/**
 * Comprobantes fuera del campo del ID: una vez marcado el pago, y en `revision`, donde
 * P2PTradeProgress no se pinta. Sin nada que abrir ni que subir no ocupa sitio, que es lo normal
 * para quien recibe.
 */
const P2PTradeAttachments = ({ attachments, canUpload, isReceiver, status, uploading, openingUuid, onPickImage, onPickPdf, onOpen, theme, textStyles, containerStyles }: P2PTradeAttachmentsProps) => {

	const { t } = useTranslation()

	if (attachments.length === 0 && !canUpload) return null

	const warn = proofWarningVisible({ isReceiver, status, fromCounterparty: attachments.some(attachment => !attachment.mine) })

	return (
		<View style={[containerStyles.card, { marginVertical: 4, paddingVertical: 8, paddingHorizontal: 12 }]}>
			<SurfaceHost tone="surface">
				<View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 34 }}>
					<View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
						<FontAwesome6 name="paperclip" size={12} color={theme.colors.secondaryText} iconStyle="solid" />
						<Text style={[textStyles.h7, { color: theme.colors.secondaryText, textTransform: 'uppercase', letterSpacing: 0.5 }]}>{t('p2p.attachments.title')}</Text>
					</View>
					{canUpload && <P2PProofPickers compact uploading={uploading} onPickImage={onPickImage} onPickPdf={onPickPdf} theme={theme} />}
				</View>

				{attachments.length > 0 && <P2PProofRows attachments={attachments} openingUuid={openingUuid} onOpen={onOpen} theme={theme} textStyles={textStyles} />}

				{/* Pegado a los adjuntos a propósito: el comprobante falso es la estafa clásica del P2P */}
				{warn && (
					<View style={{ flexDirection: 'row', gap: 8, marginTop: 4, marginBottom: 2 }}>
						<FontAwesome6 name="triangle-exclamation" size={13} color={theme.colors.warning} iconStyle="solid" style={{ marginTop: 2 }} />
						<Text style={[textStyles.h7, { flex: 1, color: theme.colors.warning, lineHeight: scaleType(theme, 17) }]}>{t('p2p.tradeProgress.safety')}</Text>
					</View>
				)}
			</SurfaceHost>
		</View>
	)
}

export default P2PTradeAttachments
