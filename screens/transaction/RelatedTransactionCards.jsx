import { View, Text, Pressable, StyleSheet } from 'react-native'
import FontAwesome6 from '@react-native-vector-icons/fontawesome6'

import { ROUTES } from '../../routes'
import QPCoin from '../../ui/particles/QPCoin'
import { useTheme } from '../../theme/ThemeContext'
import { getStatusColor } from './transactionStatus'
import { useTextStyles } from '../../theme/themeUtils'
import { DetailRow, CardHeader } from './transactionDetailUi'
import { getShortDateTime, statusText, getFirstChunk, copyTextToClipboard, truncateWalletAddress } from '../../helpers'

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
const RelatedTransactionCards = ({ t, navigation }) => {
	
	const { theme } = useTheme()
	const textStyles = useTextStyles(theme)

	return (
		<>
			{/* Wallet Card (Crypto Deposit) */}
			{t.wallet && (
				<View style={[styles.detailsCard, { backgroundColor: theme.colors.surface, marginTop: 16 }]}>
					<CardHeader icon="wallet" title="Depósito Crypto" color={theme.colors.primary} badge={statusText(t.wallet.status)} badgeColor={getStatusColor(t.wallet.status, theme)} />

					{t.wallet.coin && (
						<DetailRow label="Moneda:">
							<View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
								<QPCoin coin={t.wallet.coin.logo} size={20} />
								<Text style={[textStyles.h6, { color: theme.colors.primaryText }]}>{t.wallet.coin.name}</Text>
							</View>
						</DetailRow>
					)}

					<DetailRow label="Valor esperado:" value={`${Number(t.wallet.value).toFixed(8)}`} />
					<DetailRow label="Valor recibido:" value={`${Number(t.wallet.received).toFixed(8)}`} />

					<DetailRow label="Dirección:">
						<View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
							<Text style={[textStyles.h6, { color: theme.colors.primaryText }]}>{truncateWalletAddress(t.wallet.wallet || '')}</Text>
							<Pressable onPress={() => copyTextToClipboard(t.wallet.wallet)}>
								<FontAwesome6 name="copy" size={14} color={theme.colors.primary} iconStyle="solid" />
							</Pressable>
						</View>
					</DetailRow>

					{t.wallet.txid && (
						<DetailRow label="TX Hash:">
							<View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
								<Text style={[textStyles.h6, { color: theme.colors.primaryText }]}>{truncateWalletAddress(t.wallet.txid)}</Text>
								<Pressable onPress={() => copyTextToClipboard(t.wallet.txid)}>
									<FontAwesome6 name="copy" size={14} color={theme.colors.primary} iconStyle="solid" />
								</Pressable>
							</View>
						</DetailRow>
					)}

					<DetailRow label="Fecha:" value={getShortDateTime(t.wallet.created_at)} last />
				</View>
			)}

			{/* P2P Card */}
			{t.p2p && (
				<View style={[styles.detailsCard, { backgroundColor: theme.colors.surface, marginTop: 16 }]}>
					<CardHeader icon="arrow-right-arrow-left" title="P2P" color={theme.colors.primary} badge={statusText(t.p2p.status)} badgeColor={getStatusColor(t.p2p.status, theme)} />

					<DetailRow label="Tipo:" value={t.p2p.type === 'buy' ? 'Compra' : 'Venta'} />

					{t.p2p.coin && (
						<DetailRow label="Moneda:">
							<View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
								<QPCoin coin={t.p2p.coin.logo} size={20} />
								<Text style={[textStyles.h6, { color: theme.colors.primaryText }]}>{t.p2p.coin.name}</Text>
							</View>
						</DetailRow>
					)}

					<DetailRow label="Monto:" value={`$${Number(t.p2p.amount).toFixed(2)}`} />
					<DetailRow label="A recibir:" value={`${Number(t.p2p.receive).toFixed(4)}`} />

					<DetailRow label="ID:" last>
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
					<CardHeader icon="money-bill-transfer" title="Extracción" color={theme.colors.warning} badge={statusText(t.withdraw.status)} badgeColor={getStatusColor(t.withdraw.status, theme)} />

					{t.withdraw.coin && (
						<DetailRow label="Método:">
							<View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
								<QPCoin coin={t.withdraw.coin.logo} size={20} />
								<Text style={[textStyles.h6, { color: theme.colors.primaryText }]}>{t.withdraw.coin.name}</Text>
							</View>
						</DetailRow>
					)}

					<DetailRow label="Monto solicitado:" value={`$${Number(t.withdraw.amount).toFixed(2)}`} />
					<DetailRow label="A recibir:" value={`${Number(t.withdraw.receive).toFixed(4)}`} />

					{t.withdraw.tx_id && (
						<DetailRow label="TX Hash:">
							<View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
								<Text style={[textStyles.h6, { color: theme.colors.primaryText }]}>{truncateWalletAddress(t.withdraw.tx_id)}</Text>
								<Pressable onPress={() => copyTextToClipboard(t.withdraw.tx_id)}>
									<FontAwesome6 name="copy" size={14} color={theme.colors.primary} iconStyle="solid" />
								</Pressable>
							</View>
						</DetailRow>
					)}

					{t.withdraw.details && renderDetailsBlob(t.withdraw.details)}

					<DetailRow label="Fecha:" value={getShortDateTime(t.withdraw.created_at)} last />
				</View>
			)}

			{/* Service Card (Phone topup, etc.) */}
			{t.service && (
				<View style={[styles.detailsCard, { backgroundColor: theme.colors.surface, marginTop: 16 }]}>
					<CardHeader icon="concierge-bell" title="Servicio" color={theme.colors.warning} badge={statusText(t.service.status)} badgeColor={getStatusColor(t.service.status, theme)} />

					{t.service.service && <DetailRow label="Servicio:" value={t.service.service.name} />}

					<DetailRow label="Monto:" value={`$${Number(t.service.amount).toFixed(2)}`} />

					{t.service.service_data && renderDetailsBlob(t.service.service_data)}

					<DetailRow label="Fecha:" value={getShortDateTime(t.service.created_at)} last />
				</View>
			)}

			{/* Cart Card (Store purchase) */}
			{t.cart && (
				<View style={[styles.detailsCard, { backgroundColor: theme.colors.surface, marginTop: 16 }]}>
					<CardHeader
						icon="cart-shopping"
						title="Compra"
						color={theme.colors.success}
						badge={t.cart.cancelled ? 'Cancelado' : t.cart.delivered ? 'Entregado' : t.cart.purchased ? 'Comprado' : 'Pendiente'}
						badgeColor={t.cart.cancelled ? theme.colors.danger : t.cart.delivered ? theme.colors.primary : t.cart.purchased ? theme.colors.success : theme.colors.warning}
					/>

					{t.cart.address && <DetailRow label="Dirección:" value={t.cart.address} />}

					{t.cart.tracking_code && (
						<DetailRow label="Rastreo:">
							<View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
								<Text style={[textStyles.h6, { color: theme.colors.primaryText }]}>{t.cart.tracking_code}</Text>
								<Pressable onPress={() => copyTextToClipboard(t.cart.tracking_code)}>
									<FontAwesome6 name="copy" size={14} color={theme.colors.primary} iconStyle="solid" />
								</Pressable>
							</View>
						</DetailRow>
					)}

					{t.cart.note && <DetailRow label="Nota:" value={t.cart.note} />}

					<DetailRow label="Fecha:" value={getShortDateTime(t.cart.created_at)} last />
				</View>
			)}

			{/* App Card (Merchant payment) */}
			{t.app && (
				<View style={[styles.detailsCard, { backgroundColor: theme.colors.surface, marginTop: 16 }]}>
					<CardHeader icon="store" title={t.app.name} color={theme.colors.primary} />

					{t.app.desc && <DetailRow label="Descripción:" value={t.app.desc} />}

					<DetailRow label="App ID:" value={getFirstChunk(t.app.uuid)} last />
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
