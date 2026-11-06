import { ActivityIndicator, View, Text } from 'react-native'
import { useTranslation } from 'react-i18next'
import FontAwesome6 from '@react-native-vector-icons/fontawesome6'

import QPButton from '../../ui/particles/QPButton'
import QPPressable from '../../ui/particles/QPPressable'
import { timeAgo } from '../../helpers'
import { scaleType } from '../../theme/themeUtils'
import { formatAttachmentSize } from './p2pAttachments'
import type { Theme } from '../../theme/ThemeContext'
import type { TextStyles, ContainerStyles } from '../../theme/themeUtils'
import type { P2PAttachment } from '../../types/domain'

type P2PTradeAttachmentsProps = {
	attachments: P2PAttachment[]
	canUpload: boolean
	isPayer: boolean
	isReceiver: boolean
	proofReplaces: boolean
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
 * Comprobantes del trato, junto a los datos de pago. Va fuera de P2PTradeProgress porque esa
 * tarjeta no se pinta en `revision`, justo cuando más hacen falta. Las filas no enseñan el nombre
 * del fichero: es texto libre de la contraparte dentro de una interfaz de confianza.
 */
const P2PTradeAttachments = ({ attachments, canUpload, isPayer, isReceiver, proofReplaces, uploading, openingUuid, onPickImage, onPickPdf, onOpen, theme, textStyles, containerStyles }: P2PTradeAttachmentsProps) => {

	const { t } = useTranslation()

	if (attachments.length === 0 && !canUpload) return null

	const fromCounterparty = attachments.some(attachment => !attachment.mine)

	return (
		<View style={[containerStyles.card, { marginVertical: 4, paddingVertical: 10, paddingHorizontal: 12 }]}>
			<View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
				<FontAwesome6 name="paperclip" size={12} color={theme.colors.secondaryText} iconStyle="solid" />
				<Text style={[textStyles.h7, { color: theme.colors.secondaryText, textTransform: 'uppercase', letterSpacing: 0.5 }]}>{t('p2p.attachments.title')}</Text>
			</View>
			<Text style={[textStyles.h7, { color: theme.colors.tertiaryText, lineHeight: scaleType(theme, 17), marginBottom: 8 }]}>
				{t(isPayer && proofReplaces ? 'p2p.attachments.hintProof' : 'p2p.attachments.hintPrivate')}
			</Text>

			{attachments.length > 0 && (
				<View style={{ gap: 8, marginBottom: canUpload ? 10 : 0 }}>
					{attachments.map((attachment, index) => (
						<QPPressable
							key={attachment.uuid}
							onPress={() => onOpen(attachment)}
							accessibilityRole="button"
							accessibilityLabel={t('p2p.attachments.openLabel', { index: index + 1 })}
							style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 36 }}
						>
							<View style={{ width: 22, alignItems: 'center' }}>
								<FontAwesome6 name={attachment.kind === 'pdf' ? 'file-pdf' : 'image'} size={16} color={theme.colors.primary} iconStyle="solid" />
							</View>
							<View style={{ flex: 1 }}>
								<Text style={[textStyles.h6, { color: theme.colors.primaryText, fontWeight: '500' }]} numberOfLines={1}>
									{t(attachment.kind === 'pdf' ? 'p2p.attachments.rowPdf' : 'p2p.attachments.rowImage', { index: index + 1, size: formatAttachmentSize(attachment.size) })}
								</Text>
								<Text style={[textStyles.h7, { color: theme.colors.tertiaryText }]} numberOfLines={1}>
									{attachment.mine ? t('p2p.attachments.mine') : t('p2p.attachments.theirs')} · {timeAgo(attachment.created_at)}
								</Text>
							</View>
							{openingUuid === attachment.uuid
								? <ActivityIndicator size="small" color={theme.colors.primary} />
								: <FontAwesome6 name="chevron-right" size={12} color={theme.colors.tertiaryText} iconStyle="solid" />}
						</QPPressable>
					))}
				</View>
			)}

			{/* Pegado a los adjuntos a propósito: el comprobante falso es la estafa clásica del P2P */}
			{isReceiver && fromCounterparty && (
				<View style={{ flexDirection: 'row', gap: 8, marginBottom: canUpload ? 10 : 0, marginTop: 2 }}>
					<FontAwesome6 name="triangle-exclamation" size={13} color={theme.colors.warning} iconStyle="solid" style={{ marginTop: 2 }} />
					<Text style={[textStyles.h7, { flex: 1, color: theme.colors.warning, lineHeight: scaleType(theme, 17) }]}>{t('p2p.tradeProgress.safety')}</Text>
				</View>
			)}

			{canUpload && (
				<View style={{ flexDirection: 'row', gap: 8 }}>
					<QPButton title={t('p2p.attachments.photo')} onPress={onPickImage} outlined icon="image" iconStyle="solid" disabled={uploading} loading={uploading} style={{ flex: 1 }} />
					<QPButton title={t('p2p.attachments.pdf')} onPress={onPickPdf} outlined icon="file-pdf" iconStyle="solid" disabled={uploading} style={{ flex: 1 }} />
				</View>
			)}
		</View>
	)
}

export default P2PTradeAttachments
