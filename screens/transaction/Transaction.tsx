import React, { useState, useEffect, useLayoutEffect, useCallback, useRef } from 'react'
import type { ReactElement } from 'react'
import { View, Text, StyleSheet, ScrollView, Pressable, Platform } from 'react-native'
import type { RefreshControlProps } from 'react-native'
import { useTranslation } from 'react-i18next'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'

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
import { getShortDateTime, statusText, getFirstChunk, copyTextToClipboard } from '../../helpers'

// FontAwesome6
import FontAwesome6 from '@react-native-vector-icons/fontawesome6'

// Toast
import { toast } from 'sonner-native'
import QPButton from '../../ui/particles/QPButton'
import ProfileContainer from '../../ui/ProfileContainer'
import TransactionSticker from '../../ui/particles/TransactionSticker'

// Stickers
import { parseTransactionDescription } from '../../helpers/stickers'

// Pull-to-refresh
import { createHiddenRefreshControl } from '../../ui/QPRefreshIndicator'

// Detail UI + related cards
import { DetailRow } from './transactionDetailUi'
import { getStatusColor } from './transactionStatus'
import RelatedTransactionCards from './RelatedTransactionCards'
import QPFitText from '../../ui/particles/QPFitText'

// Tipos
import type { Transaction as TransactionModel, TxP2P, TxCart, TxService } from '../../types/domain'
import type { RootStackParamList } from '../../types/navigation'

/**
 * Relaciones en forma LISTA (PascalCase) que esta pantalla normaliza pero que
 * `types/domain.ts` aún no modela con ese nombre: `P2P` y `Cart` (el tipo solo
 * declara sus gemelas en minúscula) y `BuyedService`, tipado allí como `object`.
 * Se leen vía cast local, sin tocar el tipo compartido.
 */
type ListShapeExtras = { P2P?: TxP2P | null, Cart?: TxCart | null, BuyedService?: TxService | null }

// Cache key prefix for transactions
const TRANSACTION_CACHE_KEY = 'transaction_cache_'

// Normalize transaction data: list API returns PascalCase, detail API returns lowercase
const normalizeTransaction = (tx: TransactionModel): TransactionModel => ({
	...tx,
	user: tx.user ?? tx.User ?? null,
	paid_by: tx.paid_by ?? tx.PaidBy ?? null,
	app: tx.app ?? tx.App ?? null,
	wallet: tx.wallet ?? tx.Wallet ?? null,
	p2p: tx.p2p ?? (tx as ListShapeExtras).P2P ?? null,
	cart: tx.cart ?? (tx as ListShapeExtras).Cart ?? null,
	withdraw: tx.withdraw ?? tx.Withdraw ?? null,
	service: tx.service ?? (tx as ListShapeExtras).BuyedService ?? null,
})

type Props = NativeStackScreenProps<RootStackParamList, 'Transaction'>

/**
 * Transaction detail / receipt screen.
 * Expects `route.params.transaction` (list-item shape, normalized from PascalCase) and
 * renders it instantly, then hydrates from the AsyncStorage cache and finally from
 * `GET /transaction/{uuid}`. Can download the PDF receipt via
 * `GET /transaction/{uuid}/pdf` (blob-util with the Keychain bearer token).
 * The header goes transparent when the counterparty's cover image is shown;
 * sticker descriptions (`:sticker:<name>`) render their animation.
 */
const Transaction = ({ route, navigation }: Props) => {

	// Discrepancia documentada en types/navigation.ts: el tap del push de OneSignal
	// manda `{ uuid }` sin `transaction` y esta pantalla solo lee `transaction`.
	// Se tipa lo que hay (el camino roto se conserva tal cual).
	const { transaction } = route.params as { transaction: TransactionModel }
	const [transactionDetails, setTransactionDetails] = useState(normalizeTransaction(transaction))
	const [loading, setLoading] = useState(false)

	// Contexts
	const { t } = useTranslation()
	const { user } = useAuth()
	const { theme } = useTheme()
	const textStyles = useTextStyles(theme)
	const containerStyles = useContainerStyles(theme)
	const insets = useSafeAreaInsets()

	// Determine the other user early so we can configure the header
	const user_uuid_early = user?.uuid || ''
	const paid_by_uuid_early = transactionDetails.paid_by?.uuid || ''
	const otherUserEarly = (user_uuid_early === paid_by_uuid_early) ? transactionDetails.user : transactionDetails.paid_by

	// Make header transparent when the profile header is shown (otherUser
	// exists). The route options in App.tsx already predict this from the nav
	// params so the first frame is correct; this layout effect (pre-paint) only
	// covers shapes the route-level guess can't see. Never flips back to opaque.
	// The white tint is only forced when a cover photo actually sits behind the
	// header — over the plain background the theme's default tint stays legible.
	useLayoutEffect(() => {
		if (otherUserEarly) {
			navigation.setOptions({
				headerTransparent: true,
				headerStyle: { backgroundColor: 'transparent' },
				// `cover_photo_url` viaja en el perfil extendido y no está en EmbeddedUser
				...((otherUserEarly as { cover_photo_url?: string | null }).cover_photo_url && { headerTintColor: theme.colors.almostWhite }),
			})
		}
	}, [otherUserEarly, navigation, theme])

	// Fetch transaction details from API and update cache
	const fetchTransaction = useCallback(async () => {
		const cacheKey = `${TRANSACTION_CACHE_KEY}${transaction.uuid}`
		setLoading(true)
		try {
			const response = await transferApi.getTransactionDetails(transaction.uuid)
			if (response.success) {
				// El endpoint envuelve la transacción en otro `data` (`{ data: {...} }`);
				// `transferApi` tipa el cuerpo como la transacción pelada
				const freshData = (response.data as unknown as { data: TransactionModel }).data
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
		let cancelled = false
		const loadCachedThenFetch = async () => {
			const cacheKey = `${TRANSACTION_CACHE_KEY}${transaction.uuid}`
			try {
				const cachedData = await AsyncStorage.getItem(cacheKey)
				if (cancelled) return
				if (cachedData) { setTransactionDetails(JSON.parse(cachedData)) }
			} catch (error) {
				// error loading cached transaction
			}
			if (!cancelled) fetchTransaction()
		}
		loadCachedThenFetch()
		return () => { cancelled = true }
	}, [transaction.uuid, fetchTransaction])

	// Determine transaction type and colors
	const user_uuid = user?.uuid || ''
	const paid_by_uuid = transactionDetails.paid_by?.uuid || ''
	const isPaidByMe = user_uuid === paid_by_uuid
	const transactionSign = isPaidByMe ? '-' : '+'
	const transactionColor = isPaidByMe ? theme.colors.danger : theme.colors.successText

	// Get the other user (not the current user)
	const otherUser = isPaidByMe ? transactionDetails.user : transactionDetails.paid_by

	// Format amount
	// Los decimales del backend viajan como string o number (alias Decimal)
	const amountFloat = parseFloat(transactionDetails.amount as string)
	const amountFixed = amountFloat.toFixed(2)

	// Handle PDF download — `downloading` is a re-entrancy guard only (never shown in
	// the UI), so a ref prevents the whole detail screen re-rendering on each toggle.
	const downloadingRef = useRef(false)
	const handleDownloadPDF = async () => {
		if (downloadingRef.current) return
		downloadingRef.current = true
		try {

			const token = await getAuthToken()
			if (!token) {
				toast.error(t('transactions.common.errorTitle'), { description: t('transactions.detail.toasts.tokenFailed') })
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
				} else { ReactNativeBlobUtil.android.actionViewIntent(path, 'application/pdf') }
				toast.success(t('transactions.detail.toasts.successTitle'), { description: t('transactions.detail.toasts.pdfDownloaded') })
			} else { toast.error(t('transactions.common.errorTitle'), { description: t('transactions.detail.toasts.pdfFailed') }) }
		} catch (error) {
			toast.error(t('transactions.common.errorTitle'), { description: t('transactions.detail.toasts.pdfFailed') })
		} finally { downloadingRef.current = false }
	}

	return (
		<View style={containerStyles.container}>
			{/* Cast del refreshControl: `createHiddenRefreshControl` declara
			    `ReactElement` (props `unknown`) y ScrollView pide
			    `ReactElement<RefreshControlProps>` — el elemento ES un RefreshControl */}
			<ScrollView style={[styles.scrollView, { paddingHorizontal: theme.spacing.md }]} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false} refreshControl={createHiddenRefreshControl(loading, fetchTransaction) as ReactElement<RefreshControlProps>} contentInsetAdjustmentBehavior="never">

				{/* Profile Container */}
				{otherUser && <ProfileContainer user={otherUser} />}

				{/* Amount Section */}
				<View style={styles.amountSection}>
					<QPFitText style={[textStyles.amount, { color: transactionColor, fontSize: theme.typography.fontSize.display }]}>
						{transactionSign}${amountFixed}
					</QPFitText>
				</View>

				{/* Transaction Details Card */}
				<Text style={[textStyles.h5, { color: theme.colors.tertiaryText, marginBottom: 5 }]}>{t('transactions.detail.detailsTitle')}</Text>

				<View style={[styles.detailsCard, { backgroundColor: theme.colors.surface }]}>

					<DetailRow label={t('transactions.detail.id')}>
						<View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
							<Text style={[textStyles.h6, { color: theme.colors.primaryText }]}>{getFirstChunk(transactionDetails.uuid)}</Text>
							<Pressable onPress={() => copyTextToClipboard(transactionDetails.uuid)}>
								<FontAwesome6 name="copy" size={16} color={theme.colors.primaryText} iconStyle="solid" />
							</Pressable>
						</View>
					</DetailRow>

					<DetailRow label={t('transactions.detail.amount')} value={`$${amountFixed}`} />

					<DetailRow label={t('transactions.detail.status')}>
						<View style={[styles.statusBadge, { backgroundColor: getStatusColor(transactionDetails.status, theme) }]}>
							<Text style={[textStyles.h7, { color: theme.colors.almostBlack, fontWeight: '600' }]}>
								{statusText(transactionDetails.status)}
							</Text>
						</View>
					</DetailRow>

					{transactionDetails.description && (() => {
						const parsed = parseTransactionDescription(transactionDetails.description)
						return (
							<View style={[styles.detailRow, { flexDirection: 'column', alignItems: 'flex-start', gap: 6 }]}>
								<Text style={[textStyles.h6, { color: theme.colors.secondaryText }]}>{t('transactions.detail.note')}</Text>
								{parsed.type === 'sticker' ? (
									<TransactionSticker name={parsed.sticker} size={96} />
								) : (
									<Text style={[textStyles.h6, { color: theme.colors.primaryText, lineHeight: 20 }]}>{transactionDetails.description}</Text>
								)}
							</View>
						)
					})()}

					<DetailRow label={t('transactions.detail.date')} value={getShortDateTime(transactionDetails.created_at)} last />

				</View>

				<RelatedTransactionCards t={transactionDetails} navigation={navigation} />

				{/* Action Buttons - only for transfers between users or withdrawals.
				    marginTop auto + flexGrow en el contentContainer: con espacio libre el
				    botón baja al fondo (con safe area); con contenido largo fluye normal. */}
				{((transactionDetails.user && transactionDetails.paid_by) || transactionDetails.withdraw) && (
					<View style={[containerStyles.bottomButtonContainer, { marginTop: 'auto', paddingBottom: insets.bottom + 16 }]}>
						<QPButton
							title={t('transactions.detail.download')}
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
	scrollContent: {
		flexGrow: 1,
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
	statusBadge: {
		paddingHorizontal: 12,
		paddingVertical: 4,
		borderRadius: 12,
	},
})

export default Transaction
