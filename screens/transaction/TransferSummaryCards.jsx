import { View, Text } from 'react-native'
import { useTranslation } from 'react-i18next'

import { parseTransactionDescription } from '../../helpers/stickers'
import TransactionSticker from '../../ui/particles/TransactionSticker'
import ProfileContainerHorizontal from '../../ui/ProfileContainerHorizontal'
import QPFitText from '../../ui/particles/QPFitText'

// Read-only transfer summary: amount, recipient, optional message, and fee/total.
const TransferSummaryCards = ({ recipientUser, sendAmount, description, isUserOnline, theme, textStyles, containerStyles }) => {

	const { t } = useTranslation()
	const parsedDescription = parseTransactionDescription(description)
	const isStickerDescription = parsedDescription.type === 'sticker'

	return (
		<>
			{/* Amount */}
			<View style={{ alignItems: 'center', paddingVertical: 20 }}>
				<QPFitText style={[textStyles.amount, { fontSize: theme.typography.fontSize.display }]}>
					${sendAmount}
				</QPFitText>
			</View>

			{/* Recipient Card */}
			<View style={containerStyles.card}>
				<Text style={[textStyles.h6, { color: theme.colors.secondaryText, marginBottom: 15 }]}>
					{t('transactions.summary.recipient')}
				</Text>
				<View style={{ flexDirection: 'row', alignItems: 'center', gap: 15 }}>
					<ProfileContainerHorizontal user={recipientUser} isOnline={isUserOnline(recipientUser?.uuid)} />
				</View>
			</View>

			{/* Message Card */}
			{description && (
				<View style={containerStyles.card}>
					<Text style={[textStyles.h6, { color: theme.colors.secondaryText, marginBottom: 10 }]}>
						{t('transactions.summary.message')}
					</Text>
					{isStickerDescription ? (
						<View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
							<TransactionSticker name={parsedDescription.sticker} size={72} />
							<Text style={[textStyles.h6, { color: theme.colors.secondaryText }]}>
								{parsedDescription.sticker.replace('.webm', '')}
							</Text>
						</View>
					) : (
						<Text style={[textStyles.h6, { color: theme.colors.primaryText, lineHeight: 20 }]}>
							"{description}"
						</Text>
					)}
				</View>
			)}

			{/* Transaction Details */}
			<View style={containerStyles.card}>
				<Text style={[textStyles.h6, { color: theme.colors.secondaryText, marginBottom: 15 }]}>
					{t('transactions.summary.details')}
				</Text>
				<View style={{ gap: 12 }}>
					<View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
						<Text style={[textStyles.h6, { color: theme.colors.secondaryText }]}>{t('transactions.summary.fee')}</Text>
						<Text style={[textStyles.h6, { color: theme.colors.primaryText }]}>$0.00 QUSD</Text>
					</View>
					<View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
						<Text style={[textStyles.h6, { color: theme.colors.secondaryText }]}>{t('transactions.summary.totalToSend')}</Text>
						<Text style={[textStyles.h5, { color: theme.colors.primaryText, fontWeight: '600' }]}>${sendAmount} QUSD</Text>
					</View>
				</View>
			</View>
		</>
	)
}

export default TransferSummaryCards
