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
import { scaleType, useContainerStyles, useTextStyles } from '../../theme/themeUtils'

// Auth Context
import { useAuth } from '../../auth/AuthContext'

// API
import { transferApi } from '../../api/transferApi'
import { getAuthToken } from '../../api/client'
import { getApiBaseUrl } from '../../api/apiHost'

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
import AppHeroContainer from '../../ui/AppHeroContainer'
import TransactionSticker from '../../ui/particles/TransactionSticker'

// Stickers
import { parseTransactionDescription } from '../../helpers/stickers'

// Lightning Address: cobros que entraron al saldo de sats
import { isSatsCreditDescription } from '../../helpers/lightningAddress'
import TransactionSkeleton from '../../ui/TransactionSkeleton'

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
 * Accepts `route.params.transaction` (list-item shape, normalized from PascalCase),
 * rendered instantly, or just `uuid` (push tap / Lightning Address payment), shown
 * as a skeleton until the AsyncStorage cache or `GET /transaction/{uuid}` answers. Can download the PDF receipt via
 * `GET /transaction/{uuid}/pdf` (blob-util with the Keychain bearer token).
 * The header goes transparent when the counterparty's cover image is shown;
 * sticker descriptions (`:sticker:<name>`) render their animation.
 */
const Transaction = ({ route, navigation }: Props) => {

	// Dos entradas: la lista manda la transacción entera (se pinta al instante);
	// el toque de una push (o un cobro de la Lightning Address) manda solo `uuid`
	// y la pantalla la carga de la caché/servidor enseñando un esqueleto mientras
	const { transaction, uuid: uuidParam } = route.params ?? {}
	const uuid = transaction?.uuid ?? uuidParam ?? ''
	const [transactionDetails, setTransactionDetails] = useState<TransactionModel | null>(() => (transaction ? normalizeTransaction(transaction) : null))
	const [loading, setLoading] = useState(false)
	const [loadFailed, setLoadFailed] = useState(false)

	// Contexts
	const { t } = useTranslation()
	const { user } = useAuth()
	const { theme } = useTheme()
	const textStyles = useTextStyles(theme)
	const containerStyles = useContainerStyles(theme)
	const insets = useSafeAreaInsets()

	// Determine the other user early so we can configure the header
	const user_uuid_early = user?.uuid || ''
	const paid_by_uuid_early = transactionDetails?.paid_by?.uuid || ''
	const otherUserEarly = transactionDetails ? ((user_uuid_early === paid_by_uuid_early) ? transactionDetails.user : transactionDetails.paid_by) : null

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
		if (!uuid) { setLoadFailed(true); return }
		const cacheKey = `${TRANSACTION_CACHE_KEY}${uuid}`
		setLoading(true)
		setLoadFailed(false)
		try {
			const response = await transferApi.getTransactionDetails(uuid)
			if (response.success) {
				// El endpoint envuelve la transacción en otro `data` (`{ data: {...} }`);
				// `transferApi` tipa el cuerpo como la transacción pelada
				const freshData = (response.data as unknown as { data: TransactionModel }).data
				if (freshData) {
					setTransactionDetails(normalizeTransaction(freshData))
					try {
						await AsyncStorage.setItem(cacheKey, JSON.stringify(freshData))
					} catch (cacheError) {
						// error caching transaction
					}
				} else { setLoadFailed(true) }
			} else { setLoadFailed(true) }
		} catch (error) {
			setLoadFailed(true)
		} finally { setLoading(false) }
	}, [uuid])

	// Load cached data first, then fetch fresh data from server
	useEffect(() => {
		let cancelled = false
		const loadCachedThenFetch = async () => {
			const cacheKey = `${TRANSACTION_CACHE_KEY}${uuid}`
			try {
				const cachedData = await AsyncStorage.getItem(cacheKey)
				if (cancelled) return
				if (cachedData) { setTransactionDetails(normalizeTransaction(JSON.parse(cachedData))) }
			} catch (error) {
				// error loading cached transaction
			}
			if (!cancelled) fetchTransaction()
		}
		loadCachedThenFetch()
		return () => { cancelled = true }
	}, [uuid, fetchTransaction])

	// Guarda de reentrada de la descarga del PDF (declarada antes del primer return: orden de hooks)
	const downloadingRef = useRef(false)

	// Sin transacción aún (llegada por `uuid`): esqueleto, o el error con reintento
	if (!transactionDetails) {
		return (
			<View style={[containerStyles.container, { paddingHorizontal: theme.spacing.md, paddingTop: 12 }]}>
				{loadFailed && !loading ? (
					<View style={styles.loadFailed}>
						<Text style={[textStyles.body, { color: theme.colors.secondaryText, textAlign: 'center' }]}>{t('transactions.detail.loadFailed')}</Text>
						<QPButton title={t('common.actions.retry')} onPress={fetchTransaction} outlined />
					</View>
				) : (
					<>
						<TransactionSkeleton index={0} totalItems={3} />
						<TransactionSkeleton index={1} totalItems={3} />
						<TransactionSkeleton index={2} totalItems={3} />
					</>
				)}
			</View>
		)
	}

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
	const handleDownloadPDF = async () => {
		if (downloadingRef.current) return
		downloadingRef.current = true
		try {

			const token = await getAuthToken()
			if (!token) {
				toast.error(t('transactions.common.errorTitle'), { description: t('transactions.detail.toasts.tokenFailed') })
				return
			}

			const url = `${getApiBaseUrl()}/transaction/${transactionDetails.uuid}/pdf`
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

				{/* Cabecera: el comercio si la transacción es de una App (como en la web);
				    si no, el perfil de la contraparte */}
				{transactionDetails.app
					? <AppHeroContainer app={transactionDetails.app} />
					: otherUser && <ProfileContainer user={otherUser} />}

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
									<Text style={[textStyles.h6, { color: theme.colors.primaryText, lineHeight: scaleType(theme, 20) }]}>{transactionDetails.description}</Text>
								)}
							</View>
						)
					})()}

					{isSatsCreditDescription(transactionDetails.description) && (
						<View style={[styles.satsNote, { backgroundColor: '#F7931A' + '14' }]}>
							<FontAwesome6 name="bolt" size={12} color="#F7931A" iconStyle="solid" />
							<Text style={[textStyles.h7, { color: theme.colors.primaryText, flex: 1 }]}>{t('transactions.detail.satsCreditNote')}</Text>
						</View>
					)}

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
	loadFailed: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16, paddingHorizontal: 24 },
	satsNote: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 10, borderRadius: 10, marginVertical: 6 },
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
