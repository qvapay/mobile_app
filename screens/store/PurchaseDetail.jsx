import { useState, useEffect, useCallback } from 'react'
import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native'
import FastImage from '@d11/react-native-fast-image'

// Theme Context
import { useTheme } from '../../theme/ThemeContext'
import { createContainerStyles, createTextStyles } from '../../theme/themeUtils'

// UI Particles
import QPLoader from '../../ui/particles/QPLoader'
import QPButton from '../../ui/particles/QPButton'

// Icons
import FontAwesome6 from '@react-native-vector-icons/fontawesome6'

// Routes
import { ROUTES } from '../../routes'

// API
import { storeApi } from '../../api/storeApi'

// Pull-to-refresh
import QPRefreshIndicator, { createHiddenRefreshControl } from '../../ui/QPRefreshIndicator'

// Helpers
import { getShortDateTime, statusText, copyTextToClipboard, getFirstChunk } from '../../helpers'

// Toast
import Toast from 'react-native-toast-message'

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
const getLogoUrl = (logo) => {
	if (!logo) return ''
	return logo.startsWith('http') ? logo : `https://media.qvapay.com/${logo}`
}

// Human-readable labels for receipt fields
const receiptLabels = {
	voucherId: 'Voucher ID',
	epin: 'ePIN',
	confirmationNumber: 'Confirmación',
	send: 'Enviado',
	currency: 'Moneda',
	deliveryType: 'Tipo de entrega',
	redemptionUrl: 'URL de canje',
	expiresAt: 'Expira',
	instructions: 'Instrucciones',
}

const PurchaseDetail = ({ route, navigation }) => {

	const { purchaseId } = route.params

	// Contexts
	const { theme } = useTheme()
	const containerStyles = createContainerStyles(theme)
	const textStyles = createTextStyles(theme)

	// States
	const [purchase, setPurchase] = useState(null)
	const [isLoading, setIsLoading] = useState(true)

	// Fetch purchase detail
	const fetchDetail = useCallback(async () => {
		setIsLoading(true)
		try {
			const response = await storeApi.getPurchaseDetail(purchaseId)
			if (response.success) {
				setPurchase(response.data)
			} else {
				Toast.show({ type: 'error', text1: 'Error', text2: response.error || 'No se pudo obtener el detalle' })
			}
		} catch (error) {
			Toast.show({ type: 'error', text1: 'Error', text2: 'No se pudo conectar con el servidor' })
		} finally {
			setIsLoading(false)
		}
	}, [purchaseId])

	// Initial load
	useEffect(() => { fetchDetail() }, [fetchDetail])

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

	// Loading state
	if (isLoading) {
		return (
			<View style={[containerStyles.subContainer, { justifyContent: 'center', alignItems: 'center' }]}>
				<QPLoader />
			</View>
		)
	}

	// Error state
	if (!purchase) {
		return (
			<View style={[containerStyles.subContainer, { justifyContent: 'center', alignItems: 'center', gap: 16 }]}>
				<Text style={[textStyles.h5, { color: theme.colors.secondaryText }]}>No se encontró la compra</Text>
				<QPButton
					title="Volver"
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
			<QPRefreshIndicator refreshing={isLoading} />
			<ScrollView
				style={styles.scrollView}
				showsVerticalScrollIndicator={false}
				refreshControl={createHiddenRefreshControl(isLoading, fetchDetail)}
			>

				{/* Service Header */}
				<View style={styles.serviceHeader}>
					{logoUrl ? (
						<View style={[styles.logoContainer, { backgroundColor: theme.colors.elevationLight }]}>
							<FastImage source={{ uri: logoUrl, priority: FastImage.priority.normal }} style={styles.logo} resizeMode={FastImage.resizeMode.contain} />
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
					<Text style={[textStyles.amount, { color: theme.colors.danger, fontSize: 48 }]}>
						-${Number(purchase.amount).toFixed(2)}
					</Text>
				</View>

				{/* Purchase Details Card */}
				<Text style={[textStyles.h5, { color: theme.colors.tertiaryText, marginBottom: 5 }]}>Detalles de la compra:</Text>
				<View style={[styles.detailsCard, { backgroundColor: theme.colors.surface }]}>
					<DetailRow label="Servicio:" value={purchase.service?.name} />
					<DetailRow label="Monto:" value={`$${Number(purchase.amount).toFixed(2)}`} />
					{serviceData.brand ? <DetailRow label="Marca:" value={serviceData.brand} /> : null}
					{serviceData.country ? <DetailRow label="País:" value={serviceData.country} /> : null}
					{serviceData.productType ? <DetailRow label="Tipo:" value={serviceData.productType} /> : null}
					{purchase.notes ? (
						<DetailRow label="Notas:">
							<Text style={[textStyles.h6, { color: theme.colors.primaryText, flex: 1, textAlign: 'right', marginLeft: 16 }]}>{purchase.notes}</Text>
						</DetailRow>
					) : null}
					<DetailRow label="Fecha:" value={getShortDateTime(purchase.created_at)} last />
				</View>

				{/* Receipt Card - only if there's receipt data with non-empty values */}
				{Object.keys(receipt).length > 0 && (
					<View style={[styles.detailsCard, { backgroundColor: theme.colors.surface, marginTop: 16 }]}>
						<CardHeader
							icon="receipt"
							title="Recibo"
							color={theme.colors.success}
						/>
						{Object.entries(receipt).map(([key, val], index, arr) => {
							// Skip empty values and internal fields
							if (!val || val === '' || key === 'currencyDivisor' || key === 'accountId') return null
							const label = receiptLabels[key] || key
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
							title="Proveedor"
							color={theme.colors.primary}
							badge={serviceData.providerStatus}
							badgeColor={getStatusColor(serviceData.providerStatus === 'SUCCESSFUL' ? 'paid' : 'pending', theme)}
						/>
						{serviceData.providerTransactionId ? (
							<DetailRow label="ID Transacción:" value={getFirstChunk(serviceData.providerTransactionId)} copiable last />
						) : null}
					</View>
				)}

				{/* Link to Transaction */}
				{purchase.transaction?.uuid && (
					<View style={[containerStyles.bottomButtonContainer, { marginTop: 16 }]}>
						<QPButton
							title="Ver transacción"
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
	logo: {
		width: '100%',
		height: '100%',
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
