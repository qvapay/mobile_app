import { Text, View, ScrollView, Pressable, Modal, StyleSheet, Linking } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

import QPCoin from '../../ui/particles/QPCoin'
import QPButton from '../../ui/particles/QPButton'
import QRCodeStyled from 'react-native-qrcode-styled'
import FontAwesome6 from '@react-native-vector-icons/fontawesome6'

import { getFirstChunk, truncateWalletAddress, copyTextToClipboard, formatCryptoAmount } from '../../helpers'

// Format countdown as MM:SS
const formatCountdown = (seconds) => {
	const mins = Math.floor(seconds / 60)
	const secs = seconds % 60
	return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
}

// One row of the deposit-details card with optional copy button
const DetailRow = ({ label, value, copyValue, last, theme, textStyles }) => (
	<View style={[styles.detailRow, last && { borderBottomWidth: 0 }]}>
		<View style={styles.detailLeft}>
			<Text style={[textStyles.caption, { color: theme.colors.secondaryText }]}>{label}</Text>
		</View>
		<View style={styles.detailRight}>
			<Text style={[textStyles.caption, { color: theme.colors.primaryText, flex: copyValue ? 1 : 0, marginRight: copyValue ? 8 : 0, textAlign: 'right' }]} numberOfLines={1}>
				{value}
			</Text>
			{copyValue != null && (
				<Pressable onPress={() => copyTextToClipboard(copyValue)} hitSlop={8}>
					<FontAwesome6 name="copy" size={14} color={theme.colors.primary} iconStyle="solid" />
				</Pressable>
			)}
		</View>
	</View>
)

const ImportantWarnings = ({ items, theme, textStyles }) => (
	<View style={[styles.warningsCard, { backgroundColor: theme.colors.danger + '10', borderColor: theme.colors.danger + '30' }]}>
		<View style={styles.warningsHeader}>
			<FontAwesome6 name="triangle-exclamation" size={14} color={theme.colors.danger} iconStyle="solid" />
			<Text style={[textStyles.h6, { color: theme.colors.danger, marginLeft: 8 }]}>Importante</Text>
		</View>
		<View style={styles.warningsList}>
			{items.map((item) => (
				<Text key={item} style={[textStyles.caption, styles.warningItem, { color: theme.colors.danger }]}>
					{'•'} {item}
				</Text>
			))}
		</View>
	</View>
)

// PayPal redirect deposit flow
const PaypalDepositBody = ({ amount, topupData, depositStatus, countdown, theme, textStyles }) => (
	<>
		<View style={styles.amountSection}>
			<Text style={[textStyles.caption, { color: theme.colors.secondaryText, textAlign: 'center', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 1 }]}>
				Monto a depositar
			</Text>
			<Text style={[textStyles.h1, { color: theme.colors.primaryText, textAlign: 'center', fontFamily: theme.typography.fontFamily.bold }]}>
				${amount} QUSD
			</Text>
		</View>

		<QPButton
			title="Abrir PayPal"
			onPress={() => Linking.openURL(topupData.redirect_url)}
			icon="arrow-up-right-from-square"
			iconStyle="solid"
			iconColor={theme.colors.almostWhite}
			textStyle={{ color: theme.colors.almostWhite }}
			style={{ marginBottom: 20 }}
		/>

		{depositStatus === 'pending' && countdown > 0 && (
			<View style={[styles.statusBanner, { backgroundColor: theme.colors.primary + '15', borderColor: theme.colors.primary }]}>
				<FontAwesome6 name="clock" size={14} color={theme.colors.primary} iconStyle="solid" />
				<Text style={[textStyles.subtitle, { color: theme.colors.primary, marginLeft: 8, flex: 1 }]}>
					Esperando confirmación de pago en PayPal...
				</Text>
			</View>
		)}

		<View style={[styles.depositDetailsCard, { backgroundColor: theme.colors.surface }]}>
			<DetailRow label="Monto a depositar" value={`$${amount} QUSD`} theme={theme} textStyles={textStyles} />
			<DetailRow label="Transacción" value={getFirstChunk(topupData?.transaction_uuid)} last theme={theme} textStyles={textStyles} />
		</View>

		<ImportantWarnings
			items={['Complete el pago en PayPal en 30 minutos', 'No cierre esta pantalla hasta confirmar el pago']}
			theme={theme}
			textStyles={textStyles}
		/>
	</>
)

// Crypto / bank deposit flow
const CryptoDepositBody = ({ amount, topupData, installedWallets, onOpenWalletPicker, theme, textStyles }) => (
	<>
		{/* QR Code */}
		<View style={styles.qrSection}>
			<View style={[styles.qrCard, { backgroundColor: theme.colors.surface }]}>
				<QRCodeStyled
					data={topupData?.wallet}
					style={{ backgroundColor: '#FFFFFF', borderRadius: 12, overflow: 'hidden' }}
					size={280}
					padding={12}
					pieceSize={8}
					isPiecesGlued
					pieceBorderRadius={2}
					pieceCornerType={'cut'}
					errorCorrectionLevel={'H'}
					preserveAspectRatio="none"
					backgroundColor={'#FFFFFF'}
					color={'#000000'}
					outerEyesOptions={{ borderRadius: 2, color: theme.colors.primary }}
				/>
			</View>
		</View>

		{/* Crypto Amount - Prominent */}
		<View style={styles.amountSection}>
			<Text style={[textStyles.caption, { color: theme.colors.secondaryText, textAlign: 'center', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 1 }]}>
				Total a pagar
			</Text>
			<View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}>
				<Text style={[textStyles.h1, { color: theme.colors.primaryText, textAlign: 'center', fontFamily: theme.typography.fontFamily.bold }]}>
					{formatCryptoAmount(topupData?.value)}
				</Text>
				<Text style={[textStyles.h3, { color: theme.colors.primary, marginLeft: 8 }]}>
					{topupData?.coin}
				</Text>
			</View>
			<Text style={[textStyles.caption, { color: theme.colors.secondaryText, textAlign: 'center', marginTop: 4 }]}>
				1 {topupData?.coin} ≈ ${formatCryptoAmount(topupData?.price)}
			</Text>
		</View>

		{/* Open in installed wallet */}
		{installedWallets.length > 0 && (
			<QPButton
				title="Abrir en mi wallet"
				onPress={onOpenWalletPicker}
				icon="wallet"
				iconStyle="solid"
				iconColor={theme.colors.almostWhite}
				textStyle={{ color: theme.colors.almostWhite }}
				style={{ marginBottom: 16 }}
			/>
		)}

		{/* Deposit Details Card */}
		<View style={[styles.depositDetailsCard, { backgroundColor: theme.colors.surface }]}>
			<DetailRow label="Dirección" value={truncateWalletAddress(topupData?.wallet || '')} copyValue={topupData?.wallet} theme={theme} textStyles={textStyles} />
			<DetailRow label="Monto a depositar" value={`$${amount} QUSD`} theme={theme} textStyles={textStyles} />
			{topupData?.account_name && <DetailRow label="Nombre del titular" value={topupData.account_name} copyValue={topupData.account_name} theme={theme} textStyles={textStyles} />}
			{topupData?.routing_number && <DetailRow label="Número de ruta" value={topupData.routing_number} copyValue={topupData.routing_number} theme={theme} textStyles={textStyles} />}
			{topupData?.account_number && <DetailRow label="Número de cuenta" value={topupData.account_number} copyValue={topupData.account_number} theme={theme} textStyles={textStyles} />}
			{topupData?.memo && <DetailRow label="Memo" value={topupData.memo} copyValue={topupData.memo} theme={theme} textStyles={textStyles} />}
			<DetailRow label="Tasa de cambio" value={`$${formatCryptoAmount(topupData?.price)}`} theme={theme} textStyles={textStyles} />
			<DetailRow label="Total a pagar" value={`${formatCryptoAmount(topupData?.value)} ${topupData?.coin}`} copyValue={formatCryptoAmount(topupData?.value)} theme={theme} textStyles={textStyles} />
			<DetailRow label="Transacción" value={getFirstChunk(topupData?.transaction_uuid)} last theme={theme} textStyles={textStyles} />
		</View>

		<ImportantWarnings
			items={['No envíe cripto a otra dirección', 'Complete el pago en 30 minutos', 'Envíe exactamente la cantidad indicada', 'No use una red/token diferente']}
			theme={theme}
			textStyles={textStyles}
		/>
	</>
)

const STATUS_BANNERS = {
	processing: { icon: 'spinner', color: 'warning', text: 'Pago detectado, procesando...' },
	paid: { icon: 'circle-check', color: 'success', text: 'Pago confirmado' },
	expired: { icon: 'clock', color: 'danger', text: 'Depósito expirado' },
	failed: { icon: 'triangle-exclamation', color: 'danger', text: 'Error en el pago' },
}

// Deposit details bottom sheet: QR / PayPal redirect, address + amount details, warnings.
const DepositDetailsModal = ({ visible, onClose, amount, selectedCoin, topupData, depositStatus, countdown, sseConnected, installedWallets, onOpenWalletPicker, theme, textStyles }) => {

	const getCountdownColor = (seconds) => {
		if (seconds < 60) return theme.colors.danger
		if (seconds < 300) return theme.colors.warning
		return theme.colors.primary
	}

	const banner = STATUS_BANNERS[depositStatus]

	return (
		<Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
			<SafeAreaView style={[styles.modalContainer, { backgroundColor: theme.colors.background }]}>

				{/* Modal Header */}
				<View style={[styles.modalHeader, { borderBottomColor: theme.colors.elevation }]}>
					<View style={{ flex: 1 }}>
						<Text style={textStyles.h4}>Depositar ${amount} QUSD</Text>
					</View>
					<View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
						<View style={[styles.sseDot, { backgroundColor: sseConnected ? theme.colors.success : theme.colors.danger }]} />
						<View style={[styles.countdownBadge, { backgroundColor: getCountdownColor(countdown) + '20', borderColor: getCountdownColor(countdown) }]}>
							<FontAwesome6 name="clock" size={12} color={getCountdownColor(countdown)} iconStyle="solid" />
							<Text style={[textStyles.caption, { color: getCountdownColor(countdown), fontFamily: theme.typography.fontFamily.medium, marginLeft: 4, fontVariant: ['tabular-nums'], minWidth: 42 }]}>
								{countdown > 0 ? formatCountdown(countdown) : 'Expirado'}
							</Text>
						</View>
					</View>
					<Pressable onPress={onClose} style={[styles.closeButton, { marginLeft: 12 }]}>
						<FontAwesome6 name="xmark" size={20} color={theme.colors.primaryText} iconStyle="solid" />
					</Pressable>
				</View>

				<ScrollView style={styles.modalContent} contentContainerStyle={styles.modalContentContainer}>

					{/* Deposit Status Banner */}
					{banner && (
						<View style={[styles.statusBanner, { backgroundColor: theme.colors[banner.color] + '15', borderColor: theme.colors[banner.color] }]}>
							<FontAwesome6 name={banner.icon} size={14} color={theme.colors[banner.color]} iconStyle="solid" />
							<Text style={[textStyles.subtitle, { color: theme.colors[banner.color], marginLeft: 8, flex: 1 }]}>
								{banner.text}
							</Text>
						</View>
					)}

					{/* Countdown expiration fallback */}
					{countdown <= 0 && depositStatus === 'pending' && (
						<View style={[styles.warningBanner, { backgroundColor: theme.colors.danger + '15', borderColor: theme.colors.danger }]}>
							<FontAwesome6 name="triangle-exclamation" size={16} color={theme.colors.danger} iconStyle="solid" />
							<Text style={[textStyles.subtitle, { color: theme.colors.danger, marginLeft: 8, flex: 1 }]}>
								Este depósito ha expirado. Por favor genera uno nuevo.
							</Text>
						</View>
					)}

					{/* Coin + Network Badge */}
					<View style={styles.coinNetworkBadge}>
						<View style={[styles.coinNetworkInner, { backgroundColor: theme.colors.primary + '10' }]}>
							<QPCoin coin={selectedCoin?.logo || topupData?.coin} size={24} />
							<Text style={[textStyles.h5, { color: theme.colors.primaryText, marginLeft: 8 }]}>
								{topupData?.coin}
							</Text>
							{(topupData?.network || selectedCoin?.network) && (
								<View style={[styles.networkBadgeSmall, { backgroundColor: theme.colors.primary }]}>
									<Text style={[textStyles.h7, { color: theme.colors.buttonText }]}>
										{topupData?.network || selectedCoin?.network}
									</Text>
								</View>
							)}
						</View>
					</View>

					{topupData?.redirect_url ? (
						<PaypalDepositBody amount={amount} topupData={topupData} depositStatus={depositStatus} countdown={countdown} theme={theme} textStyles={textStyles} />
					) : (
						<CryptoDepositBody amount={amount} topupData={topupData} installedWallets={installedWallets} onOpenWalletPicker={onOpenWalletPicker} theme={theme} textStyles={textStyles} />
					)}

				</ScrollView>
			</SafeAreaView>
		</Modal>
	)
}

const styles = StyleSheet.create({
	modalContainer: { flex: 1 },
	modalHeader: {
		flexDirection: 'row',
		justifyContent: 'space-between',
		alignItems: 'center',
		paddingHorizontal: 20,
		paddingVertical: 15,
		borderBottomWidth: 0.5
	},
	closeButton: { padding: 5 },
	countdownBadge: {
		flexDirection: 'row',
		alignItems: 'center',
		paddingHorizontal: 10,
		paddingVertical: 5,
		borderRadius: 20,
		borderWidth: 1,
	},
	sseDot: { width: 8, height: 8, borderRadius: 4 },
	statusBanner: {
		flexDirection: 'row',
		alignItems: 'center',
		padding: 12,
		borderRadius: 12,
		borderWidth: 1,
		marginBottom: 16,
	},
	networkBadgeSmall: {
		paddingHorizontal: 8,
		paddingVertical: 3,
		borderRadius: 10,
		marginLeft: 10,
	},
	modalContent: { flex: 1 },
	modalContentContainer: { padding: 20, paddingBottom: 40 },
	warningBanner: {
		flexDirection: 'row',
		alignItems: 'center',
		padding: 12,
		borderRadius: 12,
		borderWidth: 1,
		marginBottom: 16,
	},
	coinNetworkBadge: { alignItems: 'center', marginBottom: 8 },
	coinNetworkInner: {
		flexDirection: 'row',
		alignItems: 'center',
		paddingHorizontal: 16,
		paddingVertical: 8,
		borderRadius: 20,
	},
	qrSection: { alignItems: 'center', marginVertical: 16 },
	qrCard: { padding: 16, borderRadius: 20, alignItems: 'center' },
	amountSection: { alignItems: 'center', marginVertical: 16 },
	depositDetailsCard: { borderRadius: 16, padding: 16, marginTop: 8 },
	detailRow: {
		flexDirection: 'row',
		justifyContent: 'space-between',
		alignItems: 'center',
		paddingVertical: 12,
		borderBottomWidth: 0.5,
		borderBottomColor: 'rgba(255, 255, 255, 0.1)',
	},
	detailLeft: { flexDirection: 'row', alignItems: 'center' },
	detailRight: {
		flexDirection: 'row',
		alignItems: 'center',
		flex: 1,
		justifyContent: 'flex-end',
		gap: 4,
	},
	warningsCard: { borderRadius: 12, padding: 16, marginTop: 20, borderWidth: 1 },
	warningsHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
	warningsList: { gap: 6 },
	warningItem: { paddingLeft: 4 },
})

export default DepositDetailsModal
