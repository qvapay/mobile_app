import { View, Text } from 'react-native'

import { parseTransactionDescription } from '../../helpers/stickers'
import TransactionSticker from '../../ui/particles/TransactionSticker'
import ProfileContainerHorizontal from '../../ui/ProfileContainerHorizontal'

// Read-only transfer summary: amount, recipient, optional message, and fee/total.
const TransferSummaryCards = ({ recipientUser, sendAmount, description, isUserOnline, theme, textStyles, containerStyles }) => {

	const parsedDescription = parseTransactionDescription(description)
	const isStickerDescription = parsedDescription.type === 'sticker'

	return (
		<>
			{/* Amount */}
			<View style={{ alignItems: 'center', paddingVertical: 20 }}>
				<Text style={[textStyles.amount, { fontSize: theme.typography.fontSize.display }]}>
					${sendAmount}
				</Text>
			</View>

			{/* Recipient Card */}
			<View style={containerStyles.card}>
				<Text style={[textStyles.h6, { color: theme.colors.secondaryText, marginBottom: 15 }]}>
					Destinatario
				</Text>
				<View style={{ flexDirection: 'row', alignItems: 'center', gap: 15 }}>
					<ProfileContainerHorizontal user={recipientUser} isOnline={isUserOnline(recipientUser?.uuid)} />
				</View>
			</View>

			{/* Message Card */}
			{description && (
				<View style={containerStyles.card}>
					<Text style={[textStyles.h6, { color: theme.colors.secondaryText, marginBottom: 10 }]}>
						Mensaje
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
					Detalles de la transacción
				</Text>
				<View style={{ gap: 12 }}>
					<View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
						<Text style={[textStyles.h6, { color: theme.colors.secondaryText }]}>Comisión</Text>
						<Text style={[textStyles.h6, { color: theme.colors.primaryText }]}>$0.00 QUSD</Text>
					</View>
					<View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
						<Text style={[textStyles.h6, { color: theme.colors.secondaryText }]}>Total a enviar</Text>
						<Text style={[textStyles.h5, { color: theme.colors.primaryText, fontWeight: '600' }]}>${sendAmount} QUSD</Text>
					</View>
				</View>
			</View>
		</>
	)
}

export default TransferSummaryCards
