import { Text, View, ScrollView, Pressable, Modal, StyleSheet, Linking } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useTranslation } from 'react-i18next'

import QPCoin from '../../ui/particles/QPCoin'
import QPButton from '../../ui/particles/QPButton'
import QRCodeStyled from 'react-native-qrcode-styled'
import FontAwesome6 from '@react-native-vector-icons/fontawesome6'

import { getFirstChunk, truncateWalletAddress, copyTextToClipboard, formatCryptoAmount } from '../../helpers'

// Tipos
import type { Theme } from '../../theme/ThemeContext'
import type { TextStyles } from '../../theme/themeUtils'
import type { Coin } from '../../types/domain'
import type { Wallet } from '../../helpers/walletDeeplinks'
import type { FontAwesome6SolidIconName } from '@react-native-vector-icons/fontawesome6'

/**
 * Orden de depósito devuelta por `POST /topup` (`response.data.data`). El
 * endpoint sirve tres flujos con campos distintos — cripto/banco (wallet + QR),
 * PayPal (`redirect_url`) y tarjeta (`client_secret`) — así que todo es opcional.
 */
export type TopupOrder = {
	transaction_uuid?: string
	coin?: string
	network?: string | null
	wallet?: string
	memo?: string
	value?: number | string
	credited?: number | string
	price?: number | string
	redirect_url?: string
	client_secret?: string
	publishable_key?: string
	account_name?: string
	routing_number?: string
	account_number?: string
}

/** Estado del depósito que llega por SSE (`useTransactionSSE`). */
export type DepositStatus = 'pending' | 'processing' | 'paid' | 'expired' | 'failed' | (string & {})

type DepositDetailsModalProps = {
	visible: boolean
	onClose: () => void
	amount: string
	selectedCoin: Coin | null
	topupData: TopupOrder | null
	depositStatus: DepositStatus
	countdown: number
	sseConnected: boolean
	installedWallets: Wallet[]
	onOpenWalletPicker: () => void
	onPayWithCard: () => void
	theme: Theme
	textStyles: TextStyles
}

// Format countdown as MM:SS
const formatCountdown = (seconds: number) => {
	const mins = Math.floor(seconds / 60)
	const secs = seconds % 60
	return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
}

// One row of the deposit-details card with optional copy button
type DetailRowProps = {
	label: string
	value?: string
	copyValue?: string | null
	last?: boolean
	theme: Theme
	textStyles: TextStyles
}

const DetailRow = ({ label, value, copyValue, last, theme, textStyles }: DetailRowProps) => (
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

const ImportantWarnings = ({ items, theme, textStyles }: { items: string[], theme: Theme, textStyles: TextStyles }) => {
	const { t } = useTranslation()
	return (
		<View style={[styles.warningsCard, { backgroundColor: theme.colors.danger + '10', borderColor: theme.colors.danger + '30' }]}>
			<View style={styles.warningsHeader}>
				<FontAwesome6 name="triangle-exclamation" size={14} color={theme.colors.danger} iconStyle="solid" />
				<Text style={[textStyles.h6, { color: theme.colors.danger, marginLeft: 8 }]}>{t('add.modal.important')}</Text>
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
}

// PayPal redirect deposit flow
const PaypalDepositBody = ({ amount, topupData, depositStatus, countdown, theme, textStyles }: Pick<DepositDetailsModalProps, 'amount' | 'topupData' | 'depositStatus' | 'countdown' | 'theme' | 'textStyles'>) => {
	const { t } = useTranslation()
	return (
		<>
			<View style={styles.amountSection}>
				<Text style={[textStyles.caption, { color: theme.colors.secondaryText, textAlign: 'center', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 1 }]}>
					{t('add.modal.labels.amountToDeposit')}
				</Text>
				<Text style={[textStyles.h1, { color: theme.colors.primaryText, textAlign: 'center', fontFamily: theme.typography.fontFamily.semiBold }]}>
					${amount} QUSD
				</Text>
			</View>

			<QPButton
				title={t('add.modal.paypal.openButton')}
				// `redirect_url` es opcional en el tipo pero este cuerpo solo se pinta
				// cuando existe (la rama la decide DepositDetailsModal): aserción
				onPress={() => Linking.openURL(topupData!.redirect_url!)}
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
						{t('add.modal.paypal.waiting')}
					</Text>
				</View>
			)}

			<View style={[styles.depositDetailsCard, { backgroundColor: theme.colors.surface }]}>
				<DetailRow label={t('add.modal.labels.amountToDeposit')} value={`$${amount} QUSD`} theme={theme} textStyles={textStyles} />
				<DetailRow label={t('add.modal.labels.transaction')} value={getFirstChunk(topupData?.transaction_uuid)} last theme={theme} textStyles={textStyles} />
			</View>

			<ImportantWarnings
				items={[t('add.modal.paypal.warnings.complete'), t('add.modal.paypal.warnings.keepOpen')]}
				theme={theme}
				textStyles={textStyles}
			/>
		</>
	)
}

// Card deposit flow (Stripe PaymentSheet): la hoja nativa se presenta desde Add;
// aquí solo el resumen de la orden y el botón para (re)abrirla mientras siga viva.
const CardDepositBody = ({ amount, topupData, depositStatus, countdown, onPayWithCard, theme, textStyles }: Pick<DepositDetailsModalProps, 'amount' | 'topupData' | 'depositStatus' | 'countdown' | 'onPayWithCard' | 'theme' | 'textStyles'>) => {

	const { t } = useTranslation()

	// Desglose desde la respuesta de /topup, sin recalcular: `value` = lo que cobra
	// la tarjeta, `credited` = lo que se acredita (difiere en fee_mode=included)
	const total = Number(topupData?.value || amount || 0)
	const credited = Number(topupData?.credited ?? amount ?? 0)
	const fee = Math.max(0, total - credited)
	const canPay = depositStatus === 'pending' && countdown > 0

	return (
		<>
			<View style={styles.amountSection}>
				<Text style={[textStyles.caption, { color: theme.colors.secondaryText, textAlign: 'center', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 1 }]}>
					{t('add.modal.labels.totalToPayCard')}
				</Text>
				<Text style={[textStyles.h1, { color: theme.colors.primaryText, textAlign: 'center', fontFamily: theme.typography.fontFamily.semiBold }]}>
					${total.toFixed(2)} USD
				</Text>
			</View>

			{canPay && (
				<QPButton
					title={t('add.modal.card.payButton')}
					onPress={onPayWithCard}
					icon="credit-card"
					iconStyle="solid"
					iconColor={theme.colors.almostWhite}
					textStyle={{ color: theme.colors.almostWhite }}
					style={{ marginBottom: 20 }}
				/>
			)}

			<View style={[styles.depositDetailsCard, { backgroundColor: theme.colors.surface }]}>
				<DetailRow label={t('add.modal.labels.amountToCredit')} value={`$${credited.toFixed(2)} QUSD`} theme={theme} textStyles={textStyles} />
				<DetailRow label={t('add.modal.labels.fee')} value={`$${fee.toFixed(2)}`} theme={theme} textStyles={textStyles} />
				<DetailRow label={t('add.modal.labels.totalToPay')} value={`$${total.toFixed(2)} USD`} theme={theme} textStyles={textStyles} />
				<DetailRow label={t('add.modal.labels.transaction')} value={getFirstChunk(topupData?.transaction_uuid)} last theme={theme} textStyles={textStyles} />
			</View>

			<ImportantWarnings
				items={[t('add.modal.card.warnings.stripe'), t('add.modal.card.warnings.statement'), t('add.modal.card.warnings.threeDSecure'), t('add.modal.card.warnings.complete')]}
				theme={theme}
				textStyles={textStyles}
			/>
		</>
	)
}

// Crypto / bank deposit flow
const CryptoDepositBody = ({ amount, topupData, installedWallets, onOpenWalletPicker, theme, textStyles }: Pick<DepositDetailsModalProps, 'amount' | 'topupData' | 'installedWallets' | 'onOpenWalletPicker' | 'theme' | 'textStyles'>) => {
	const { t } = useTranslation()
	return (
	<>
		{/* QR Code */}
		<View style={styles.qrSection}>
			<View style={[styles.qrCard, { backgroundColor: theme.colors.surface }]}>
				<QRCodeStyled
					data={topupData?.wallet}
					style={{ backgroundColor: '#FFFFFF', borderRadius: 12, overflow: 'hidden' }}
					size={280}
					padding={12}
					// `pieceSize` está fuera del contrato del componente SVG (lo calcula
					// él a partir de `size`): se conserva el prop tal cual y solo se tipa
					// vía spread. `errorCorrectionLevel` viene de los tipos de `qrcode`,
					// que no están instalados, y `backgroundColor` tampoco está en
					// SvgProps: mismo tratamiento
					{...{ pieceSize: 8, errorCorrectionLevel: 'H', backgroundColor: '#FFFFFF' }}
					isPiecesGlued
					pieceBorderRadius={2}
					pieceCornerType={'cut'}
					preserveAspectRatio="none"
					color={'#000000'}
					outerEyesOptions={{ borderRadius: 2, color: theme.colors.primary }}
				/>
			</View>
		</View>

		{/* Crypto Amount - Prominent */}
		<View style={styles.amountSection}>
			<Text style={[textStyles.caption, { color: theme.colors.secondaryText, textAlign: 'center', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 1 }]}>
				{t('add.modal.labels.totalToPay')}
			</Text>
			<View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}>
				<Text style={[textStyles.h1, { color: theme.colors.primaryText, textAlign: 'center', fontFamily: theme.typography.fontFamily.semiBold }]}>
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
				title={t('add.modal.crypto.openWalletButton')}
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
			<DetailRow label={t('add.modal.labels.address')} value={truncateWalletAddress(topupData?.wallet || '')} copyValue={topupData?.wallet} theme={theme} textStyles={textStyles} />
			<DetailRow label={t('add.modal.labels.amountToDeposit')} value={`$${amount} QUSD`} theme={theme} textStyles={textStyles} />
			{topupData?.account_name && <DetailRow label={t('add.modal.labels.holderName')} value={topupData.account_name} copyValue={topupData.account_name} theme={theme} textStyles={textStyles} />}
			{topupData?.routing_number && <DetailRow label={t('add.modal.labels.routingNumber')} value={topupData.routing_number} copyValue={topupData.routing_number} theme={theme} textStyles={textStyles} />}
			{topupData?.account_number && <DetailRow label={t('add.modal.labels.accountNumber')} value={topupData.account_number} copyValue={topupData.account_number} theme={theme} textStyles={textStyles} />}
			{topupData?.memo && <DetailRow label={t('add.modal.labels.memo')} value={topupData.memo} copyValue={topupData.memo} theme={theme} textStyles={textStyles} />}
			<DetailRow label={t('add.modal.labels.exchangeRate')} value={`$${formatCryptoAmount(topupData?.price)}`} theme={theme} textStyles={textStyles} />
			<DetailRow label={t('add.modal.labels.totalToPay')} value={`${formatCryptoAmount(topupData?.value)} ${topupData?.coin}`} copyValue={formatCryptoAmount(topupData?.value)} theme={theme} textStyles={textStyles} />
			<DetailRow label={t('add.modal.labels.transaction')} value={getFirstChunk(topupData?.transaction_uuid)} last theme={theme} textStyles={textStyles} />
		</View>

		<ImportantWarnings
			items={[t('add.modal.crypto.warnings.onlyThisAddress'), t('add.modal.crypto.warnings.complete'), t('add.modal.crypto.warnings.exactAmount'), t('add.modal.crypto.warnings.sameNetwork')]}
			theme={theme}
			textStyles={textStyles}
		/>
	</>
	)
}

// El texto vive como CLAVE de i18n y se resuelve en render (constante de módulo)
const STATUS_BANNERS: Record<string, { icon: FontAwesome6SolidIconName, color: 'warning' | 'success' | 'danger', textKey: string }> = {
	processing: { icon: 'spinner', color: 'warning', textKey: 'add.modal.status.processing' },
	paid: { icon: 'circle-check', color: 'success', textKey: 'add.modal.status.paid' },
	expired: { icon: 'clock', color: 'danger', textKey: 'add.modal.status.expired' },
	failed: { icon: 'triangle-exclamation', color: 'danger', textKey: 'add.modal.status.failed' },
}

// Deposit details bottom sheet: QR / PayPal redirect, address + amount details, warnings.
const DepositDetailsModal = ({ visible, onClose, amount, selectedCoin, topupData, depositStatus, countdown, sseConnected, installedWallets, onOpenWalletPicker, onPayWithCard, theme, textStyles }: DepositDetailsModalProps) => {

	const { t } = useTranslation()
	const isCardDeposit = topupData?.coin === 'CARD'

	const getCountdownColor = (seconds: number) => {
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
						<Text style={textStyles.h4}>{t('add.modal.title', { amount })}</Text>
					</View>
					<View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
						<View style={[styles.sseDot, { backgroundColor: sseConnected ? theme.colors.successText : theme.colors.danger }]} />
						<View style={[styles.countdownBadge, { backgroundColor: getCountdownColor(countdown) + '20', borderColor: getCountdownColor(countdown) }]}>
							<FontAwesome6 name="clock" size={12} color={getCountdownColor(countdown)} iconStyle="solid" />
							<Text style={[textStyles.caption, { color: getCountdownColor(countdown), fontFamily: theme.typography.fontFamily.medium, marginLeft: 4, fontVariant: ['tabular-nums'], minWidth: 42 }]}>
								{countdown > 0 ? formatCountdown(countdown) : t('add.modal.expired')}
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
								{t(banner.textKey)}
							</Text>
						</View>
					)}

					{/* Countdown expiration fallback */}
					{countdown <= 0 && depositStatus === 'pending' && (
						<View style={[styles.warningBanner, { backgroundColor: theme.colors.danger + '15', borderColor: theme.colors.danger }]}>
							<FontAwesome6 name="triangle-exclamation" size={16} color={theme.colors.danger} iconStyle="solid" />
							<Text style={[textStyles.subtitle, { color: theme.colors.danger, marginLeft: 8, flex: 1 }]}>
								{t('add.modal.expiredNotice')}
							</Text>
						</View>
					)}

					{/* Coin + Network Badge */}
					<View style={styles.coinNetworkBadge}>
						<View style={[styles.coinNetworkInner, { backgroundColor: theme.colors.primary + '10' }]}>
							<QPCoin coin={selectedCoin?.logo || topupData?.coin} size={24} />
							<Text style={[textStyles.h5, { color: theme.colors.primaryText, marginLeft: 8 }]}>
								{isCardDeposit ? (selectedCoin?.name || t('add.modal.cardFallbackName')) : topupData?.coin}
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

					{isCardDeposit ? (
						<CardDepositBody amount={amount} topupData={topupData} depositStatus={depositStatus} countdown={countdown} onPayWithCard={onPayWithCard} theme={theme} textStyles={textStyles} />
					) : topupData?.redirect_url ? (
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
