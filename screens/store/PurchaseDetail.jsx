import { useEffect } from 'react'
import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native'
import FastImage from '@d11/react-native-fast-image'

// Theme Context
import { useTheme } from '../../theme/ThemeContext'
import { createContainerStyles, createTextStyles } from '../../theme/themeUtils'

// UI Particles
import QPButton from '../../ui/particles/QPButton'

// Icons
import FontAwesome6 from '@react-native-vector-icons/fontawesome6'

// Routes
import { ROUTES } from '../../routes'

// Data (React Query)
import { usePurchaseDetailQuery } from './storeQueries'

// CDN helper
import { mediaUrl } from '../../helpers/mediaUrl'

// Pull-to-refresh
import { createHiddenRefreshControl } from '../../ui/QPRefreshIndicator'

// Helpers
import { getShortDateTime, statusText, copyTextToClipboard, getFirstChunk } from '../../helpers'

// Toast
import { toast } from 'sonner-native'
import QPFitText from '../../ui/particles/QPFitText'

// i18n
import { useTranslation } from 'react-i18next'
import i18n from '../../i18n'

// Status colors (same pattern as Transaction.jsx)
const getStatusColor = (status, theme) => {
	switch (status) {
		case 'paid': case 'completed': case 'received': return theme.colors.success
		case 'pending': case 'processing': return theme.colors.warning
		case 'cancelled': case 'failed': return theme.colors.danger
		default: return theme.colors.secondaryText
	}
}

// Get logo URL (same pattern as QPProduct)
const getLogoUrl = (logo) => mediaUrl(logo) || ''

// Localized labels for receipt fields: i18n KEYS resueltas con t() en render
const receiptLabelKeys = {
	voucherId: 'store.purchaseDetail.receiptLabels.voucherId',
	epin: 'store.purchaseDetail.receiptLabels.epin',
	confirmationNumber: 'store.purchaseDetail.receiptLabels.confirmationNumber',
	send: 'store.purchaseDetail.receiptLabels.send',
	currency: 'store.purchaseDetail.receiptLabels.currency',
	deliveryType: 'store.purchaseDetail.receiptLabels.deliveryType',
	redemptionUrl: 'store.purchaseDetail.receiptLabels.redemptionUrl',
	expiresAt: 'store.purchaseDetail.receiptLabels.expiresAt',
	instructions: 'store.purchaseDetail.receiptLabels.instructions',
}

/**
 * Receipt view for a single store purchase (top-up or gift card).
 * Expects `route.params.purchaseId` and fetches `GET /store/my/{id}`.
 * Renders provider receipt fields (voucher ID, ePIN, confirmation, redemption URL…)
 * with copy-to-clipboard on sensitive values.
 */
const PurchaseDetail = ({ route, navigation }) => {

	const { purchaseId } = route.params

	// Contexts
	const { t } = useTranslation()
	const { theme, styles: themeStyles } = useTheme()
	const containerStyles = createContainerStyles(theme)
	const textStyles = createTextStyles(theme)

	// Data: la query hace el fetch y cachea el recibo por id
	const query = usePurchaseDetailQuery(purchaseId)
	const purchase = query.data || null
	const isLoading = query.isPending
	const { refetch: fetchDetail } = query

	// El toast solo cuando no hay NADA que pintar
	useEffect(() => {
		if (query.isError && !query.data) {
			toast.error(i18n.t('store.toasts.error'), { description: query.error?.message || i18n.t('store.purchaseDetail.toasts.loadError') })
		}
	}, [query.isError, query.data, query.error])

	// Shared detail row component (same pattern as Transaction.jsx)
	const DetailRow = ({ label, value, last, copiable, children }) => (
		<View style={[styles.detailRow, last && { borderBottomWidth: 0, paddingBottom: 0 }]}>
			<Text style={[textStyles.h6, { color: theme.colors.secondaryText }]}>{label}</Text>
			{children || (
				<View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
					<Text style={[textStyles.h6, { color: theme.colors.primaryText, flexShrink: 1 }]} numberOfLines={2}>{value}</Text>
					{copiable && value ? (
						<Pressable onPress={() => copyTextToClipboard(String(value))}>
							<FontAwesome6 name="copy" size={14} color={theme.colors.primary} iconStyle="solid" />
						</Pressable>
					) : null}
				</View>
			)}
		</View>
	)

	// Card header with icon (same pattern as Transaction.jsx)
	const CardHeader = ({ icon, title, color, badge, badgeColor }) => (
		<View style={styles.cardHeader}>
			<View style={styles.cardHeaderLeft}>
				<View style={[styles.cardIcon, { backgroundColor: color + '20' }]}>
					<FontAwesome6 name={icon} size={16} color={color} iconStyle="solid" />
				</View>
				<Text style={[textStyles.h5, { fontWeight: '600' }]}>{title}</Text>
			</View>
			{badge && (
				<View style={[styles.statusBadge, { backgroundColor: badgeColor || color }]}>
					<Text style={[textStyles.h7, { color: theme.colors.almostBlack, fontWeight: '600' }]}>{badge}</Text>
				</View>
			)}
		</View>
	)

	// Loading state — global loading bar handles the indicator
	if (isLoading) { return <View style={containerStyles.subContainer} /> }

	// Error state
	if (!purchase) {
		return (
			<View style={[containerStyles.subContainer, { justifyContent: 'center', alignItems: 'center', gap: 16 }]}>
				<Text style={[textStyles.h5, { color: theme.colors.secondaryText }]}>{t('store.purchaseDetail.notFound')}</Text>
				<QPButton
					title={t('common.actions.back')}
					onPress={() => navigation.goBack()}
					style={{ backgroundColor: theme.colors.primary, paddingHorizontal: 24 }}
					textStyle={{ color: theme.colors.almostWhite }}
				/>
			</View>
		)
	}

	const logoUrl = getLogoUrl(purchase.service?.logo)
	const serviceData = purchase.service_data || {}
	const receipt = serviceData.receipt || {}
	const statusColor = getStatusColor(purchase.status, theme)

	return (
		<View style={containerStyles.subContainer}>
			<ScrollView
				style={styles.scrollView}
				showsVerticalScrollIndicator={false}
				refreshControl={createHiddenRefreshControl(isLoading, fetchDetail)}
			>

				{/* Service Header */}
				<View style={styles.serviceHeader}>
					{logoUrl ? (
						<View style={[styles.logoContainer, { backgroundColor: theme.colors.elevationLight }]}>
							<FastImage source={{ uri: logoUrl, priority: FastImage.priority.normal, cache: FastImage.cacheControl.immutable }} style={themeStyles.container.fill} resizeMode={FastImage.resizeMode.contain} />
						</View>
					) : null}
					<Text style={[textStyles.h3, { textAlign: 'center' }]}>{purchase.service?.name}</Text>
					<View style={[styles.statusBadge, { backgroundColor: statusColor }]}>
						<Text style={[textStyles.h6, { color: theme.colors.almostBlack, fontWeight: '600' }]}>
							{statusText(purchase.status)}
						</Text>
					</View>
				</View>

				{/* Amount */}
				<View style={styles.amountSection}>
					<QPFitText style={[textStyles.amount, { color: theme.colors.danger, fontSize: theme.typography.fontSize.display }]}>
						-${Number(purchase.amount).toFixed(2)}
					</QPFitText>
				</View>

				{/* Purchase Details Card */}
				<Text style={[textStyles.h5, { color: theme.colors.tertiaryText, marginBottom: 5 }]}>{t('store.purchaseDetail.detailsTitle')}</Text>
				<View style={[styles.detailsCard, { backgroundColor: theme.colors.surface }]}>
					<DetailRow label={t('store.purchaseDetail.fields.service')} value={purchase.service?.name} />
					<DetailRow label={t('store.purchaseDetail.fields.amount')} value={`$${Number(purchase.amount).toFixed(2)}`} />
					{serviceData.brand ? <DetailRow label={t('store.purchaseDetail.fields.brand')} value={serviceData.brand} /> : null}
					{serviceData.country ? <DetailRow label={t('store.purchaseDetail.fields.country')} value={serviceData.country} /> : null}
					{serviceData.productType ? <DetailRow label={t('store.purchaseDetail.fields.type')} value={serviceData.productType} /> : null}
					{purchase.notes ? (
						<DetailRow label={t('store.purchaseDetail.fields.notes')}>
							<Text style={[textStyles.h6, { color: theme.colors.primaryText, flex: 1, textAlign: 'right', marginLeft: 16 }]}>{purchase.notes}</Text>
						</DetailRow>
					) : null}
					<DetailRow label={t('store.purchaseDetail.fields.date')} value={getShortDateTime(purchase.created_at)} last />
				</View>

				{/* Receipt Card - only if there's receipt data with non-empty values */}
				{Object.keys(receipt).length > 0 && (
					<View style={[styles.detailsCard, { backgroundColor: theme.colors.surface, marginTop: 16 }]}>
						<CardHeader
							icon="receipt"
							title={t('store.purchaseDetail.receipt')}
							color={theme.colors.successText}
						/>
						{Object.entries(receipt).map(([key, val], index, arr) => {
							// Skip empty values and internal fields
							if (!val || val === '' || key === 'currencyDivisor' || key === 'accountId') return null
							const label = receiptLabelKeys[key] ? t(receiptLabelKeys[key]) : key
							const isLast = index === arr.length - 1
							const copiable = key === 'voucherId' || key === 'epin' || key === 'confirmationNumber'
							return (<DetailRow key={key} label={`${label}:`} value={String(val)} last={isLast} copiable={copiable} />)
						})}
					</View>
				)}

				{/* Provider Info Card */}
				{(serviceData.providerTransactionId || serviceData.providerStatus) && (
					<View style={[styles.detailsCard, { backgroundColor: theme.colors.surface, marginTop: 16 }]}>
						<CardHeader
							icon="server"
							title={t('store.purchaseDetail.provider')}
							color={theme.colors.primary}
							badge={serviceData.providerStatus}
							badgeColor={getStatusColor(serviceData.providerStatus === 'SUCCESSFUL' ? 'paid' : 'pending', theme)}
						/>
						{serviceData.providerTransactionId ? (
							<DetailRow label={t('store.purchaseDetail.fields.transactionId')} value={getFirstChunk(serviceData.providerTransactionId)} copiable last />
						) : null}
					</View>
				)}

				{/* Link to Transaction */}
				{purchase.transaction?.uuid && (
					<View style={[containerStyles.bottomButtonContainer, { marginTop: 16 }]}>
						<QPButton
							title={t('store.purchaseDetail.viewTransaction')}
							icon="arrow-up-right-from-square"
							iconColor="white"
							onPress={() => navigation.navigate(ROUTES.TRANSACTION, { transaction: { uuid: purchase.transaction.uuid, amount: purchase.amount, status: purchase.status, created_at: purchase.created_at } })}
							style={{ backgroundColor: theme.colors.primary }}
							textStyle={{ color: theme.colors.almostWhite }}
							iconStyle="solid"
						/>
					</View>
				)}

			</ScrollView>
		</View>
	)
}

const styles = StyleSheet.create({
	scrollView: {
		flex: 1,
	},
	serviceHeader: {
		alignItems: 'center',
		paddingTop: 10,
		gap: 10,
	},
	logoContainer: {
		width: 72,
		height: 72,
		borderRadius: 16,
		overflow: 'hidden',
		alignItems: 'center',
		justifyContent: 'center',
	},
	amountSection: {
		alignItems: 'center',
		paddingVertical: 20,
	},
	detailsCard: {
		borderRadius: 16,
		paddingVertical: 15,
		paddingHorizontal: 20,
		marginVertical: 5,
	},
	detailRow: {
		flexDirection: 'row',
		justifyContent: 'space-between',
		alignItems: 'center',
		paddingVertical: 12,
		borderBottomWidth: 0.5,
		borderBottomColor: 'rgba(255, 255, 255, 0.1)',
	},
	cardHeader: {
		flexDirection: 'row',
		justifyContent: 'space-between',
		alignItems: 'center',
		marginBottom: 8,
	},
	cardHeaderLeft: {
		flexDirection: 'row',
		alignItems: 'center',
		gap: 10,
	},
	cardIcon: {
		width: 36,
		height: 36,
		borderRadius: 10,
		alignItems: 'center',
		justifyContent: 'center',
	},
	statusBadge: {
		paddingHorizontal: 12,
		paddingVertical: 4,
		borderRadius: 12,
	},
})

export default PurchaseDetail
