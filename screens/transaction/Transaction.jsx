import React, { useState, useEffect, useCallback } from 'react'
import { View, Text, StyleSheet, ScrollView, Pressable, Platform } from 'react-native'

// Async Storage
import AsyncStorage from '@react-native-async-storage/async-storage'

// Theme Context
import { useTheme } from '../../theme/ThemeContext'
import { useContainerStyles, useTextStyles } from '../../theme/themeUtils'

// Auth Context
import { useAuth } from '../../auth/AuthContext'

// API
import { transferApi } from '../../api/transferApi'
import { getAuthToken } from '../../api/client'
import config from '../../config'

// PDF download
import ReactNativeBlobUtil from 'react-native-blob-util'

// Helpers
import { getShortDateTime, statusText, getFirstChunk, copyTextToClipboard, truncateWalletAddress } from '../../helpers'

// FontAwesome6
import FontAwesome6 from '@react-native-vector-icons/fontawesome6'

// Routes
import { ROUTES } from '../../routes'

// Toast
import Toast from 'react-native-toast-message'
import QPButton from '../../ui/particles/QPButton'
import QPCoin from '../../ui/particles/QPCoin'
import ProfileContainer from '../../ui/ProfileContainer'

// Pull-to-refresh
import { createHiddenRefreshControl } from '../../ui/QPRefreshIndicator'

// Cache key prefix for transactions
const TRANSACTION_CACHE_KEY = 'transaction_cache_'

// Status colors helper
const getStatusColor = (status, theme) => {
	switch (status) {
		case 'paid': case 'completed': case 'received': return theme.colors.success
		case 'pending': case 'open': case 'processing': case 'unpaid': return theme.colors.warning
		case 'cancelled': case 'failed': return theme.colors.danger
		case 'revision': return theme.colors.primary
		default: return theme.colors.secondaryText
	}
}

// Normalize transaction data: list API returns PascalCase, detail API returns lowercase
const normalizeTransaction = (tx) => ({
	...tx,
	user: tx.user ?? tx.User ?? null,
	paid_by: tx.paid_by ?? tx.PaidBy ?? null,
	app: tx.app ?? tx.App ?? null,
	wallet: tx.wallet ?? tx.Wallet ?? null,
	p2p: tx.p2p ?? tx.P2P ?? null,
	cart: tx.cart ?? tx.Cart ?? null,
	withdraw: tx.withdraw ?? tx.Withdraw ?? null,
	service: tx.service ?? tx.BuyedService ?? null,
})

const Transaction = ({ route, navigation }) => {

	const { transaction } = route.params
	const [transactionDetails, setTransactionDetails] = useState(normalizeTransaction(transaction))
	const [loading, setLoading] = useState(false)

	// Contexts
	const { user } = useAuth()
	const { theme } = useTheme()
	const textStyles = useTextStyles(theme)
	const containerStyles = useContainerStyles(theme)

	// Fetch transaction details from API and update cache
	const fetchTransaction = useCallback(async () => {
		const cacheKey = `${TRANSACTION_CACHE_KEY}${transaction.uuid}`
		setLoading(true)
		try {
			const response = await transferApi.getTransactionDetails(transaction.uuid)
			if (response.success) {
				const freshData = response.data.data
				setTransactionDetails(freshData)
				try {
					await AsyncStorage.setItem(cacheKey, JSON.stringify(freshData))
				} catch (cacheError) {
					// error caching transaction
				}
			}
		} catch (error) {
			} finally { setLoading(false) }
	}, [transaction.uuid])

	// Load cached data first, then fetch fresh data from server
	useEffect(() => {
		const loadCachedThenFetch = async () => {
			const cacheKey = `${TRANSACTION_CACHE_KEY}${transaction.uuid}`
			try {
				const cachedData = await AsyncStorage.getItem(cacheKey)
				if (cachedData) {
					setTransactionDetails(JSON.parse(cachedData))
				}
			} catch (error) {
				// error loading cached transaction
			}
			fetchTransaction()
		}
		loadCachedThenFetch()
	}, [transaction.uuid, fetchTransaction])

	// Determine transaction type and colors
	const user_uuid = user?.uuid || ''
	const paid_by_uuid = transactionDetails.paid_by?.uuid || ''
	const isPaidByMe = user_uuid == paid_by_uuid
	const transactionSign = isPaidByMe ? '-' : '+'
	const transactionColor = isPaidByMe ? theme.colors.danger : theme.colors.successText

	// Get the other user (not the current user)
	const otherUser = isPaidByMe ? transactionDetails.user : transactionDetails.paid_by

	// Format amount
	const amountFloat = parseFloat(transactionDetails.amount)
	const amountFixed = amountFloat.toFixed(2)

	// Handle PDF download
	const [downloading, setDownloading] = useState(false)
	const handleDownloadPDF = async () => {
		if (downloading) return
		setDownloading(true)
		try {
			const token = await getAuthToken()
			if (!token) {
				Toast.show({ type: 'error', text1: 'Error', text2: 'No se pudo obtener el token de autenticación' })
				return
			}

			const url = `${config.API_BASE_URL}/transaction/${transactionDetails.uuid}/pdf`
			const dirs = ReactNativeBlobUtil.fs.dirs
			const filePath = `${dirs.CacheDir}/transaction-${transactionDetails.uuid}.pdf`
			const res = await ReactNativeBlobUtil.config({
				path: filePath,
			}).fetch('GET', url, {
				Authorization: `Bearer ${token}`,
				Accept: 'application/pdf',
			})

			const status = res.info().status
			if (status === 200) {
				const path = res.path()
				if (Platform.OS === 'ios') {
					ReactNativeBlobUtil.ios.openDocument(path)
				} else {
					ReactNativeBlobUtil.android.actionViewIntent(path, 'application/pdf')
				}
				Toast.show({ type: 'success', text1: 'Éxito', text2: 'PDF descargado correctamente' })
			} else {
				Toast.show({ type: 'error', text1: 'Error', text2: 'No se pudo descargar el PDF' })
			}
		} catch (error) {
			Toast.show({ type: 'error', text1: 'Error', text2: 'No se pudo descargar el PDF' })
		} finally {
			setDownloading(false)
		}
	}

	// Shared detail row component
	const DetailRow = ({ label, value, last, children }) => (
		<View style={[styles.detailRow, last && { borderBottomWidth: 0, paddingBottom: 0 }]}>
			<Text style={[textStyles.h6, { color: theme.colors.secondaryText }]}>{label}</Text>
			{children || <Text style={[textStyles.h6, { color: theme.colors.primaryText }]}>{value}</Text>}
		</View>
	)

	// Card header with icon
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

	return (
		<View style={containerStyles.subContainer}>
			<ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false} refreshControl={createHiddenRefreshControl(loading, fetchTransaction)}>

				{/* Profile Container */}
				{otherUser && <ProfileContainer user={otherUser} />}

				{/* Amount Section */}
				<View style={styles.amountSection}>
					<Text style={[textStyles.amount, { color: transactionColor, fontSize: 48 }]}>
						{transactionSign}${amountFixed}
					</Text>
				</View>

				{/* Transaction Details Card */}
				<Text style={[textStyles.h5, { color: theme.colors.tertiaryText, marginBottom: 5 }]}>Detalles de la Transacción:</Text>

				<View style={[styles.detailsCard, { backgroundColor: theme.colors.surface }]}>

					<DetailRow label="ID:">
						<View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
							<Text style={[textStyles.h6, { color: theme.colors.primaryText }]}>{getFirstChunk(transactionDetails.uuid)}</Text>
							<Pressable onPress={() => copyTextToClipboard(transactionDetails.uuid)}>
								<FontAwesome6 name="copy" size={16} color={theme.colors.primaryText} iconStyle="solid" />
							</Pressable>
						</View>
					</DetailRow>

					<DetailRow label="Monto:" value={`$${amountFixed}`} />

					<DetailRow label="Estado:">
						<View style={[styles.statusBadge, { backgroundColor: getStatusColor(transactionDetails.status, theme) }]}>
							<Text style={[textStyles.h7, { color: theme.colors.almostBlack, fontWeight: '600' }]}>
								{statusText(transactionDetails.status)}
							</Text>
						</View>
					</DetailRow>

					{transactionDetails.description && (
						<View style={[styles.detailRow, { flexDirection: 'column', alignItems: 'flex-start', gap: 6 }]}>
							<Text style={[textStyles.h6, { color: theme.colors.secondaryText }]}>Nota:</Text>
							<Text style={[textStyles.h6, { color: theme.colors.primaryText, lineHeight: 20 }]}>{transactionDetails.description}</Text>
						</View>
					)}

					<DetailRow label="Fecha:" value={getShortDateTime(transactionDetails.created_at)} last />

				</View>

				{/* ====== RELATED OBJECTS ====== */}

				{/* Wallet Card (Crypto Deposit) */}
				{transactionDetails.wallet && (
					<View style={[styles.detailsCard, { backgroundColor: theme.colors.surface, marginTop: 16 }]}>
						<CardHeader
							icon="wallet"
							title="Depósito Crypto"
							color={theme.colors.primary}
							badge={statusText(transactionDetails.wallet.status)}
							badgeColor={getStatusColor(transactionDetails.wallet.status, theme)}
						/>

						{transactionDetails.wallet.coin && (
							<DetailRow label="Moneda:">
								<View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
									<QPCoin coin={transactionDetails.wallet.coin.logo} size={20} />
									<Text style={[textStyles.h6, { color: theme.colors.primaryText }]}>{transactionDetails.wallet.coin.name}</Text>
								</View>
							</DetailRow>
						)}

						<DetailRow label="Valor esperado:" value={`${Number(transactionDetails.wallet.value).toFixed(8)}`} />
						<DetailRow label="Valor recibido:" value={`${Number(transactionDetails.wallet.received).toFixed(8)}`} />

						<DetailRow label="Dirección:">
							<View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
								<Text style={[textStyles.h6, { color: theme.colors.primaryText }]}>{truncateWalletAddress(transactionDetails.wallet.wallet || '')}</Text>
								<Pressable onPress={() => copyTextToClipboard(transactionDetails.wallet.wallet)}>
									<FontAwesome6 name="copy" size={14} color={theme.colors.primary} iconStyle="solid" />
								</Pressable>
							</View>
						</DetailRow>

						{transactionDetails.wallet.txid && (
							<DetailRow label="TX Hash:">
								<View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
									<Text style={[textStyles.h6, { color: theme.colors.primaryText }]}>{truncateWalletAddress(transactionDetails.wallet.txid)}</Text>
									<Pressable onPress={() => copyTextToClipboard(transactionDetails.wallet.txid)}>
										<FontAwesome6 name="copy" size={14} color={theme.colors.primary} iconStyle="solid" />
									</Pressable>
								</View>
							</DetailRow>
						)}

						<DetailRow label="Fecha:" value={getShortDateTime(transactionDetails.wallet.created_at)} last />
					</View>
				)}

				{/* P2P Card */}
				{transactionDetails.p2p && (
					<View style={[styles.detailsCard, { backgroundColor: theme.colors.surface, marginTop: 16 }]}>
						<CardHeader
							icon="arrow-right-arrow-left"
							title="P2P"
							color={theme.colors.primary}
							badge={statusText(transactionDetails.p2p.status)}
							badgeColor={getStatusColor(transactionDetails.p2p.status, theme)}
						/>

						<DetailRow label="Tipo:" value={transactionDetails.p2p.type === 'buy' ? 'Compra' : 'Venta'} />

						{transactionDetails.p2p.coin && (
							<DetailRow label="Moneda:">
								<View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
									<QPCoin coin={transactionDetails.p2p.coin.logo} size={20} />
									<Text style={[textStyles.h6, { color: theme.colors.primaryText }]}>{transactionDetails.p2p.coin.name}</Text>
								</View>
							</DetailRow>
						)}

						<DetailRow label="Monto:" value={`$${Number(transactionDetails.p2p.amount).toFixed(2)}`} />
						<DetailRow label="A recibir:" value={`${Number(transactionDetails.p2p.receive).toFixed(4)}`} />

						<DetailRow label="ID:" last>
							<View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
								<Text style={[textStyles.h6, { color: theme.colors.primaryText }]}>{getFirstChunk(transactionDetails.p2p.uuid)}</Text>
								<Pressable onPress={() => navigation.navigate(ROUTES.P2P_OFFER_SCREEN, { p2p_uuid: transactionDetails.p2p.uuid })}>
									<FontAwesome6 name="arrow-up-right-from-square" size={12} color={theme.colors.primary} iconStyle="solid" />
								</Pressable>
							</View>
						</DetailRow>
					</View>
				)}

				{/* Withdraw Card */}
				{transactionDetails.withdraw && (
					<View style={[styles.detailsCard, { backgroundColor: theme.colors.surface, marginTop: 16 }]}>
						<CardHeader
							icon="money-bill-transfer"
							title="Extracción"
							color={theme.colors.warning}
							badge={statusText(transactionDetails.withdraw.status)}
							badgeColor={getStatusColor(transactionDetails.withdraw.status, theme)}
						/>

						{transactionDetails.withdraw.coin && (
							<DetailRow label="Método:">
								<View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
									<QPCoin coin={transactionDetails.withdraw.coin.logo} size={20} />
									<Text style={[textStyles.h6, { color: theme.colors.primaryText }]}>{transactionDetails.withdraw.coin.name}</Text>
								</View>
							</DetailRow>
						)}

						<DetailRow label="Monto solicitado:" value={`$${Number(transactionDetails.withdraw.amount).toFixed(2)}`} />
						<DetailRow label="A recibir:" value={`${Number(transactionDetails.withdraw.receive).toFixed(4)}`} />

						{transactionDetails.withdraw.tx_id && (
							<DetailRow label="TX Hash:">
								<View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
									<Text style={[textStyles.h6, { color: theme.colors.primaryText }]}>{truncateWalletAddress(transactionDetails.withdraw.tx_id)}</Text>
									<Pressable onPress={() => copyTextToClipboard(transactionDetails.withdraw.tx_id)}>
										<FontAwesome6 name="copy" size={14} color={theme.colors.primary} iconStyle="solid" />
									</Pressable>
								</View>
							</DetailRow>
						)}

						{transactionDetails.withdraw.details && (() => {
							try {
								const details = typeof transactionDetails.withdraw.details === 'string'
									? JSON.parse(transactionDetails.withdraw.details)
									: transactionDetails.withdraw.details
								if (details && typeof details === 'object') {
									return Object.entries(details).map(([key, val]) => (
										<DetailRow key={key} label={`${key}:`} value={String(val)} />
									))
								}
							} catch (e) { /* ignore parse errors */ }
							return null
						})()}

						<DetailRow label="Fecha:" value={getShortDateTime(transactionDetails.withdraw.created_at)} last />
					</View>
				)}

				{/* Service Card (Phone topup, etc.) */}
				{transactionDetails.service && (
					<View style={[styles.detailsCard, { backgroundColor: theme.colors.surface, marginTop: 16 }]}>
						<CardHeader
							icon="concierge-bell"
							title="Servicio"
							color={theme.colors.warning}
							badge={statusText(transactionDetails.service.status)}
							badgeColor={getStatusColor(transactionDetails.service.status, theme)}
						/>

						{transactionDetails.service.service && (
							<DetailRow label="Servicio:" value={transactionDetails.service.service.name} />
						)}

						<DetailRow label="Monto:" value={`$${Number(transactionDetails.service.amount).toFixed(2)}`} />

						{transactionDetails.service.service_data && (() => {
							try {
								const data = typeof transactionDetails.service.service_data === 'string'
									? JSON.parse(transactionDetails.service.service_data)
									: transactionDetails.service.service_data
								if (data && typeof data === 'object') {
									return Object.entries(data).map(([key, val]) => (
										<DetailRow key={key} label={`${key}:`} value={String(val)} />
									))
								}
							} catch (e) { /* ignore parse errors */ }
							return null
						})()}

						<DetailRow label="Fecha:" value={getShortDateTime(transactionDetails.service.created_at)} last />
					</View>
				)}

				{/* Cart Card (Store purchase) */}
				{transactionDetails.cart && (
					<View style={[styles.detailsCard, { backgroundColor: theme.colors.surface, marginTop: 16 }]}>
						<CardHeader
							icon="cart-shopping"
							title="Compra"
							color={theme.colors.success}
							badge={transactionDetails.cart.cancelled ? 'Cancelado' : transactionDetails.cart.delivered ? 'Entregado' : transactionDetails.cart.purchased ? 'Comprado' : 'Pendiente'}
							badgeColor={transactionDetails.cart.cancelled ? theme.colors.danger : transactionDetails.cart.delivered ? theme.colors.primary : transactionDetails.cart.purchased ? theme.colors.success : theme.colors.warning}
						/>

						{transactionDetails.cart.address && (
							<DetailRow label="Dirección:" value={transactionDetails.cart.address} />
						)}

						{transactionDetails.cart.tracking_code && (
							<DetailRow label="Rastreo:">
								<View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
									<Text style={[textStyles.h6, { color: theme.colors.primaryText }]}>{transactionDetails.cart.tracking_code}</Text>
									<Pressable onPress={() => copyTextToClipboard(transactionDetails.cart.tracking_code)}>
										<FontAwesome6 name="copy" size={14} color={theme.colors.primary} iconStyle="solid" />
									</Pressable>
								</View>
							</DetailRow>
						)}

						{transactionDetails.cart.note && (
							<DetailRow label="Nota:" value={transactionDetails.cart.note} />
						)}

						<DetailRow label="Fecha:" value={getShortDateTime(transactionDetails.cart.created_at)} last />
					</View>
				)}

				{/* App Card (Merchant payment) */}
				{transactionDetails.app && (
					<View style={[styles.detailsCard, { backgroundColor: theme.colors.surface, marginTop: 16 }]}>
						<CardHeader
							icon="store"
							title={transactionDetails.app.name}
							color={theme.colors.primary}
						/>

						{transactionDetails.app.desc && (
							<DetailRow label="Descripción:" value={transactionDetails.app.desc} />
						)}

						<DetailRow label="App ID:" value={getFirstChunk(transactionDetails.app.uuid)} last />
					</View>
				)}

				{/* Action Buttons - only for transfers between users or withdrawals */}
				{((transactionDetails.user && transactionDetails.paid_by) || transactionDetails.withdraw) && (
					<View style={containerStyles.bottomButtonContainer}>
						<QPButton
							title="Descargar"
							icon="download"
							iconColor="white"
							onPress={handleDownloadPDF}
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

export default Transaction
