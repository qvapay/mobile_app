import { View, Text, Pressable, StyleSheet } from 'react-native'
import { useTranslation } from 'react-i18next'
import FontAwesome6 from '@react-native-vector-icons/fontawesome6'

import { ROUTES } from '../../routes'
import QPCoin from '../../ui/particles/QPCoin'
import { useTheme } from '../../theme/ThemeContext'
import { getStatusColor } from './transactionStatus'
import { useTextStyles } from '../../theme/themeUtils'
import { DetailRow, CardHeader } from './transactionDetailUi'
import { getShortDateTime, statusText, p2pTypeText, getFirstChunk, copyTextToClipboard, truncateWalletAddress } from '../../helpers'

// Parse a JSON-or-object details blob into DetailRows
const renderDetailsBlob = (blob) => {
	try {
		const data = typeof blob === 'string' ? JSON.parse(blob) : blob
		if (data && typeof data === 'object') {
			return Object.entries(data).map(([key, val]) => (
				<DetailRow key={key} label={`${key}:`} value={String(val)} />
			))
		}
	} catch (e) { /* ignore parse errors */ }
	return null
}

// Renders the object cards related to a transaction: crypto deposit, P2P, withdraw,
// service, cart and merchant app. Each only shows when present on the transaction.
// The `t` prop is the TRANSACTION — the translator is aliased to `tr`.
const RelatedTransactionCards = ({ t, navigation }) => {

	const { t: tr } = useTranslation()
	const { theme } = useTheme()
	const textStyles = useTextStyles(theme)

	return (
		<>
			{/* Wallet Card (Crypto Deposit) */}
			{t.wallet && (
				<View style={[styles.detailsCard, { backgroundColor: theme.colors.surface, marginTop: 16 }]}>
					<CardHeader icon="wallet" title={tr('transactions.detail.related.cryptoDeposit')} color={theme.colors.primary} badge={statusText(t.wallet.status)} badgeColor={getStatusColor(t.wallet.status, theme)} />

					{t.wallet.coin && (
						<DetailRow label={tr('transactions.detail.related.coin')}>
							<View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
								<QPCoin coin={t.wallet.coin.logo} size={20} />
								<Text style={[textStyles.h6, { color: theme.colors.primaryText }]}>{t.wallet.coin.name}</Text>
							</View>
						</DetailRow>
					)}

					<DetailRow label={tr('transactions.detail.related.expectedValue')} value={`${Number(t.wallet.value).toFixed(8)}`} />
					<DetailRow label={tr('transactions.detail.related.receivedValue')} value={`${Number(t.wallet.received).toFixed(8)}`} />

					<DetailRow label={tr('transactions.detail.related.address')}>
						<View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
							<Text style={[textStyles.h6, { color: theme.colors.primaryText }]}>{truncateWalletAddress(t.wallet.wallet || '')}</Text>
							<Pressable onPress={() => copyTextToClipboard(t.wallet.wallet)}>
								<FontAwesome6 name="copy" size={14} color={theme.colors.primary} iconStyle="solid" />
							</Pressable>
						</View>
					</DetailRow>

					{t.wallet.txid && (
						<DetailRow label={tr('transactions.detail.related.txHash')}>
							<View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
								<Text style={[textStyles.h6, { color: theme.colors.primaryText }]}>{truncateWalletAddress(t.wallet.txid)}</Text>
								<Pressable onPress={() => copyTextToClipboard(t.wallet.txid)}>
									<FontAwesome6 name="copy" size={14} color={theme.colors.primary} iconStyle="solid" />
								</Pressable>
							</View>
						</DetailRow>
					)}

					<DetailRow label={tr('transactions.detail.date')} value={getShortDateTime(t.wallet.created_at)} last />
				</View>
			)}

			{/* P2P Card */}
			{t.p2p && (
				<View style={[styles.detailsCard, { backgroundColor: theme.colors.surface, marginTop: 16 }]}>
					<CardHeader icon="arrow-right-arrow-left" title="P2P" color={theme.colors.primary} badge={statusText(t.p2p.status)} badgeColor={getStatusColor(t.p2p.status, theme)} />

					<DetailRow label={tr('transactions.detail.related.type')} value={p2pTypeText(t.p2p.type)} />

					{t.p2p.coin && (
						<DetailRow label={tr('transactions.detail.related.coin')}>
							<View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
								<QPCoin coin={t.p2p.coin.logo} size={20} />
								<Text style={[textStyles.h6, { color: theme.colors.primaryText }]}>{t.p2p.coin.name}</Text>
							</View>
						</DetailRow>
					)}

					<DetailRow label={tr('transactions.detail.amount')} value={`$${Number(t.p2p.amount).toFixed(2)}`} />
					<DetailRow label={tr('transactions.detail.related.toReceive')} value={`${Number(t.p2p.receive).toFixed(4)}`} />

					<DetailRow label={tr('transactions.detail.id')} last>
						<View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
							<Text style={[textStyles.h6, { color: theme.colors.primaryText }]}>{getFirstChunk(t.p2p.uuid)}</Text>
							<Pressable onPress={() => navigation.navigate(ROUTES.P2P_OFFER_SCREEN, { p2p_uuid: t.p2p.uuid })}>
								<FontAwesome6 name="arrow-up-right-from-square" size={12} color={theme.colors.primary} iconStyle="solid" />
							</Pressable>
						</View>
					</DetailRow>
				</View>
			)}

			{/* Withdraw Card */}
			{t.withdraw && (
				<View style={[styles.detailsCard, { backgroundColor: theme.colors.surface, marginTop: 16 }]}>
					<CardHeader icon="money-bill-transfer" title={tr('transactions.detail.related.withdrawal')} color={theme.colors.warning} badge={statusText(t.withdraw.status)} badgeColor={getStatusColor(t.withdraw.status, theme)} />

					{t.withdraw.coin && (
						<DetailRow label={tr('transactions.detail.related.method')}>
							<View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
								<QPCoin coin={t.withdraw.coin.logo} size={20} />
								<Text style={[textStyles.h6, { color: theme.colors.primaryText }]}>{t.withdraw.coin.name}</Text>
							</View>
						</DetailRow>
					)}

					<DetailRow label={tr('transactions.detail.related.amountRequested')} value={`$${Number(t.withdraw.amount).toFixed(2)}`} />
					<DetailRow label={tr('transactions.detail.related.toReceive')} value={`${Number(t.withdraw.receive).toFixed(4)}`} />

					{t.withdraw.tx_id && (
						<DetailRow label={tr('transactions.detail.related.txHash')}>
							<View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
								<Text style={[textStyles.h6, { color: theme.colors.primaryText }]}>{truncateWalletAddress(t.withdraw.tx_id)}</Text>
								<Pressable onPress={() => copyTextToClipboard(t.withdraw.tx_id)}>
									<FontAwesome6 name="copy" size={14} color={theme.colors.primary} iconStyle="solid" />
								</Pressable>
							</View>
						</DetailRow>
					)}

					{t.withdraw.details && renderDetailsBlob(t.withdraw.details)}

					<DetailRow label={tr('transactions.detail.date')} value={getShortDateTime(t.withdraw.created_at)} last />
				</View>
			)}

			{/* Service Card (Phone topup, etc.) */}
			{t.service && (
				<View style={[styles.detailsCard, { backgroundColor: theme.colors.surface, marginTop: 16 }]}>
					<CardHeader icon="concierge-bell" title={tr('transactions.detail.related.service')} color={theme.colors.warning} badge={statusText(t.service.status)} badgeColor={getStatusColor(t.service.status, theme)} />

					{t.service.service && <DetailRow label={tr('transactions.detail.related.serviceLabel')} value={t.service.service.name} />}

					<DetailRow label={tr('transactions.detail.amount')} value={`$${Number(t.service.amount).toFixed(2)}`} />

					{t.service.service_data && renderDetailsBlob(t.service.service_data)}

					<DetailRow label={tr('transactions.detail.date')} value={getShortDateTime(t.service.created_at)} last />
				</View>
			)}

			{/* Cart Card (Store purchase) */}
			{t.cart && (
				<View style={[styles.detailsCard, { backgroundColor: theme.colors.surface, marginTop: 16 }]}>
					<CardHeader
						icon="cart-shopping"
						title={tr('transactions.detail.related.purchase')}
						color={theme.colors.successText}
						badge={t.cart.cancelled ? tr('transactions.detail.related.cartCancelled') : t.cart.delivered ? tr('transactions.detail.related.cartDelivered') : t.cart.purchased ? tr('transactions.detail.related.cartPurchased') : tr('common.status.pending')}
						badgeColor={t.cart.cancelled ? theme.colors.danger : t.cart.delivered ? theme.colors.primary : t.cart.purchased ? theme.colors.success : theme.colors.warning}
					/>

					{t.cart.address && <DetailRow label={tr('transactions.detail.related.address')} value={t.cart.address} />}

					{t.cart.tracking_code && (
						<DetailRow label={tr('transactions.detail.related.tracking')}>
							<View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
								<Text style={[textStyles.h6, { color: theme.colors.primaryText }]}>{t.cart.tracking_code}</Text>
								<Pressable onPress={() => copyTextToClipboard(t.cart.tracking_code)}>
									<FontAwesome6 name="copy" size={14} color={theme.colors.primary} iconStyle="solid" />
								</Pressable>
							</View>
						</DetailRow>
					)}

					{t.cart.note && <DetailRow label={tr('transactions.detail.note')} value={t.cart.note} />}

					<DetailRow label={tr('transactions.detail.date')} value={getShortDateTime(t.cart.created_at)} last />
				</View>
			)}

			{/* App Card (Merchant payment) */}
			{t.app && (
				<View style={[styles.detailsCard, { backgroundColor: theme.colors.surface, marginTop: 16 }]}>
					<CardHeader icon="store" title={t.app.name} color={theme.colors.primary} />

					{t.app.desc && <DetailRow label={tr('transactions.detail.related.description')} value={t.app.desc} />}

					<DetailRow label={tr('transactions.detail.related.appId')} value={getFirstChunk(t.app.uuid)} last />
				</View>
			)}
		</>
	)
}

const styles = StyleSheet.create({
	detailsCard: {
		borderRadius: 16,
		paddingVertical: 15,
		paddingHorizontal: 20,
		marginVertical: 5,
	},
})

export default RelatedTransactionCards
