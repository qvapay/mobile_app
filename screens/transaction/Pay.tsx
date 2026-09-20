import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useState, useEffect, useCallback, useReducer } from 'react'
import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native'
import { useTranslation } from 'react-i18next'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'

// i18n en call time para el fetch inicial (usar el `t` del hook dentro del
// useCallback re-dispararía el fetch de la factura al cambiar idioma)
import i18n from '../../i18n'

// Theme
import { useTheme } from '../../theme/ThemeContext'
import { useTextStyles } from '../../theme/themeUtils'

// Auth
import { useAuth } from '../../auth/AuthContext'

// API
import { transferApi } from '../../api/transferApi'
import { payApi } from '../../api/payApi'

// Routes
import { ROUTES } from '../../routes'

// UI
import QPButton from '../../ui/particles/QPButton'
import QPAvatar from '../../ui/particles/QPAvatar'

// Helpers
import { getShortDateTime, getFirstChunk, statusText, copyTextToClipboard } from '../../helpers'
import { mediaUrl } from '../../helpers/mediaUrl'
import { payInvoiceState } from './payModel'

// Toast & haptics
import { toast } from 'sonner-native'
import ReactNativeHapticFeedback from 'react-native-haptic-feedback'

// Icons
import FontAwesome6 from '@react-native-vector-icons/fontawesome6'
import type { FontAwesome6SolidIconName } from '@react-native-vector-icons/fontawesome6'

// FastImage for merchant logos
import FastImage from '@d11/react-native-fast-image'

// Lottie for success animation
import LottieView from 'lottie-react-native'
import QPFitText from '../../ui/particles/QPFitText'

// Tipos
import type { Transaction as TransactionModel } from '../../types/domain'
import type { Theme } from '../../theme/ThemeContext'
import type { TextStyles } from '../../theme/themeUtils'
import type { RootStackParamList } from '../../types/navigation'

/** Reacción opcional que acompaña al pago de la factura. */
type Mood = { value: string, icon: FontAwesome6SolidIconName, labelKey: string, color: string }

// i18n keys resolved in render — a module constant would freeze the boot language
const MOODS: Mood[] = [
	{ value: '', icon: 'face-meh-blank', labelKey: 'transactions.pay.moods.none', color: '#9CA3AF' },
	{ value: 'loved', icon: 'heart', labelKey: 'transactions.pay.moods.loved', color: '#F472B6' },
	{ value: 'happy', icon: 'face-smile', labelKey: 'transactions.pay.moods.happy', color: '#34D399' },
	{ value: 'thumbsy', icon: 'thumbs-up', labelKey: 'transactions.pay.moods.thumbsy', color: '#60A5FA' },
	{ value: 'sad', icon: 'face-frown', labelKey: 'transactions.pay.moods.sad', color: '#FBBF24' },
]

// Normalize detail-API shape (lowercase keys) for rendering
const normalize = (tx: TransactionModel): TransactionModel => ({
	...tx,
	user: tx.user ?? tx.User ?? null,
	paid_by: tx.paid_by ?? tx.PaidBy ?? null,
	app: tx.app ?? tx.App ?? null,
})

// Status colors helper
const getStatusColor = (status: string, theme: Theme): string => {
	switch (status) {
		case 'paid': case 'completed': case 'received': return theme.colors.success
		case 'pending': case 'open': case 'processing': return theme.colors.warning
		case 'cancelled': case 'failed': return theme.colors.danger
		default: return theme.colors.secondaryText
	}
}

/** Acción del setter genérico: escribe `value` en `field` del slice. */
type FieldAction<S> = { type: 'set', field: keyof S, value: S[keyof S] }

// Generic field setter for the two related-state slices below
function setFieldReducer<S extends object>(state: S, action: FieldAction<S>): S {
	switch (action.type) {
		case 'set':
			return { ...state, [action.field]: action.value }
		default:
			return state
	}
}

/** Carga de la factura (`GET /transaction/{uuid}`). */
type LoadState = { transaction: TransactionModel | null, loading: boolean, loadError: string | null }

/** Ejecución del pago (`POST /transaction/{uuid}/pay`). */
type PayState = { paying: boolean, payError: string | null, success: boolean }

type Props = NativeStackScreenProps<RootStackParamList, 'Pay'>

/**
 * Merchant invoice payment sheet — presented as a transparentModal sliding from the
 * bottom, deep-linked from qvapay.com/pay/:uuid (works pre-login via the pending
 * deep-link flow in AppNavigator).
 * Expects `route.params.uuid`; loads the invoice via `GET /transaction/{uuid}` and pays
 * with `POST /pay/{uuid}` including an optional mood reaction. Own or already-paid
 * invoices are view-only. If it can't go back (cold-start deep link) closing resets
 * navigation to MainStack.
 */
const Pay = ({ route, navigation }: Props) => {

	const { uuid } = route.params || {}

	// Contexts
	const { t } = useTranslation()
	const { user } = useAuth()
	const { theme } = useTheme()
	const textStyles = useTextStyles(theme)
	const insets = useSafeAreaInsets()

	// Invoice load state (same-named setters keep every call site unchanged)
	const [loadState, dispatchLoad] = useReducer(setFieldReducer<LoadState>, { transaction: null, loading: true, loadError: null })
	const { transaction, loading, loadError } = loadState
	const setTransaction = (value: TransactionModel | null) => dispatchLoad({ type: 'set', field: 'transaction', value })
	const setLoading = (value: boolean) => dispatchLoad({ type: 'set', field: 'loading', value })
	const setLoadError = (value: string | null) => dispatchLoad({ type: 'set', field: 'loadError', value })

	// Pay-action state
	const [payState, dispatchPay] = useReducer(setFieldReducer<PayState>, { paying: false, payError: null, success: false })
	const { paying, payError, success } = payState
	const setPaying = (value: boolean) => dispatchPay({ type: 'set', field: 'paying', value })
	const setPayError = (value: string | null) => dispatchPay({ type: 'set', field: 'payError', value })
	const setSuccess = (value: boolean) => dispatchPay({ type: 'set', field: 'success', value })

	const [selectedMood, setSelectedMood] = useState('')

	// Fetch transaction
	const fetchTransaction = useCallback(async () => {
		if (!uuid) return
		setLoading(true)
		setLoadError(null)
		try {
			const response = await transferApi.getTransactionDetails(uuid)
			if (response.success) {
				// El endpoint envuelve la transacción en otro `data` (`{ data: {...} }`);
				// `transferApi` tipa el cuerpo como la transacción pelada
				setTransaction(normalize((response.data as unknown as { data: TransactionModel }).data))
			} else {
				setLoadError(response.error || i18n.t('transactions.pay.invoiceLoadFailed'))
			}
		} catch (error) {
			setLoadError((error as Error)?.message || i18n.t('transactions.pay.invoiceLoadError'))
		} finally { setLoading(false) }
	}, [uuid])

	useEffect(() => { fetchTransaction() }, [fetchTransaction])

	// Quién puede pagar esta factura y con qué saldo: reglas puras en `payModel`
	const { amountFixed, balanceFixed, hasEnough, isOwn, alreadyPaid, canPay } = payInvoiceState(transaction, user)

	// Close / cancel
	const handleClose = () => {
		if (navigation.canGoBack()) {
			navigation.goBack()
		} else {
			navigation.reset({ index: 0, routes: [{ name: ROUTES.MAIN_STACK }] })
		}
	}

	// Pay action
	const handlePay = async () => {
		// `canPay` ya implica que hay factura; el check explícito es para el compilador
		if (!canPay || paying || !transaction) return
		ReactNativeHapticFeedback.trigger('impactMedium', { enableVibrateFallback: true, ignoreAndroidSystemSettings: false })
		setPaying(true)
		setPayError(null)
		try {
			const result = await payApi.payTransaction(transaction.uuid, selectedMood)
			if (result.success) {
				setSuccess(true)
				toast.success(t('transactions.pay.paymentDone'), { description: t('transactions.pay.toasts.paidTo', { amount: amountFixed, name: transaction.app?.name || transaction.user?.name || 'QvaPay' }) })
				setTimeout(() => { handleClose() }, 1800)
			} else {
				setPayError(result.error || t('transactions.pay.payFailed'))
				toast.error(t('transactions.common.errorTitle'), { description: result.error || t('transactions.pay.payFailed') })
			}
		} catch (error) {
			setPayError((error as Error)?.message || t('transactions.pay.payError'))
		} finally { setPaying(false) }
	}

	// Loading
	if (loading) {
		return (
			<View style={[styles.backdrop, { backgroundColor: theme.colors.background }]}>
				<View style={[styles.sheet, { backgroundColor: theme.colors.surface, paddingBottom: insets.bottom + 16 }]}>
					<View style={styles.handle} />
					<View style={{ padding: 40, alignItems: 'center' }}>
						<FontAwesome6 name="spinner" size={28} color={theme.colors.primary} iconStyle="solid" />
						<Text style={[textStyles.h5, { color: theme.colors.secondaryText, marginTop: 14 }]}>{t('transactions.pay.loadingInvoice')}</Text>
					</View>
				</View>
			</View>
		)
	}

	// Not found / error
	if (loadError || !transaction) {
		return (
			<View style={[styles.backdrop, { backgroundColor: theme.colors.background }]}>
				<View style={[styles.sheet, { backgroundColor: theme.colors.surface, paddingBottom: insets.bottom + 16 }]}>
					<View style={styles.handle} />
					<View style={{ padding: 24, alignItems: 'center' }}>
						<FontAwesome6 name="circle-exclamation" size={40} color={theme.colors.danger} iconStyle="solid" />
						<Text style={[textStyles.h3, { marginTop: 16, textAlign: 'center' }]}>{t('transactions.pay.invoiceUnavailable')}</Text>
						<Text style={[textStyles.h6, { color: theme.colors.secondaryText, marginTop: 8, textAlign: 'center' }]}>
							{loadError || t('transactions.pay.invoiceNotFound')}
						</Text>
						<QPButton title={t('common.actions.close')} onPress={handleClose} style={{ marginTop: 20 }} textStyle={{ color: theme.colors.buttonText }} />
					</View>
				</View>
			</View>
		)
	}

	return (
		<View style={[styles.backdrop, { backgroundColor: 'rgba(0,0,0,0.4)' }]}>
			<Pressable style={styles.overlayPress} onPress={handleClose} />

			<View style={[styles.sheet, { backgroundColor: theme.colors.background, paddingBottom: insets.bottom + 16 }]}>

				<View style={styles.handle} />

				<Pressable style={[styles.closeBtn, { backgroundColor: theme.colors.surface }]} onPress={handleClose} hitSlop={8}>
					<FontAwesome6 name="xmark" size={16} color={theme.colors.primaryText} iconStyle="solid" />
				</Pressable>

				<ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: theme.spacing.md, paddingTop: 20 }}>

					<PayMerchantHeader theme={theme} textStyles={textStyles} transaction={transaction} />

					{/* Amount */}
					<View style={styles.amountWrap}>
						<QPFitText style={[textStyles.amount, { fontSize: theme.typography.fontSize.display }]}>${amountFixed}</QPFitText>
						<View style={[styles.statusBadge, { backgroundColor: getStatusColor(transaction.status, theme) }]}>
							<Text style={[textStyles.h7, { color: theme.colors.almostBlack, fontWeight: '600' }]}>{statusText(transaction.status)}</Text>
						</View>
					</View>

					{/* Summary card */}
					<View style={[styles.card, { backgroundColor: theme.colors.surface }]}>

						<View style={styles.row}>
							<Text style={[textStyles.h6, { color: theme.colors.secondaryText }]}>{t('transactions.pay.id')}</Text>
							<Pressable onPress={() => copyTextToClipboard(transaction.uuid)} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
								<Text style={[textStyles.h6, { color: theme.colors.primaryText }]}>{getFirstChunk(transaction.uuid)}</Text>
								<FontAwesome6 name="copy" size={13} color={theme.colors.primary} iconStyle="solid" />
							</Pressable>
						</View>

						{transaction.description ? (
							<View style={[styles.row, { alignItems: 'flex-start' }]}>
								<Text style={[textStyles.h6, { color: theme.colors.secondaryText }]}>{t('transactions.pay.concept')}</Text>
								<Text style={[textStyles.h6, { color: theme.colors.primaryText, flex: 1, textAlign: 'right', marginLeft: 16 }]} numberOfLines={3}>
									{transaction.description}
								</Text>
							</View>
						) : null}

						<View style={[styles.row, styles.rowLast]}>
							<Text style={[textStyles.h6, { color: theme.colors.secondaryText }]}>{t('transactions.pay.date')}</Text>
							<Text style={[textStyles.h6, { color: theme.colors.primaryText }]}>{getShortDateTime(transaction.created_at)}</Text>
						</View>

					</View>

					<PayBalanceHint theme={theme} textStyles={textStyles} visible={!alreadyPaid && !isOwn} hasEnough={hasEnough} balanceFixed={balanceFixed} />

					{canPay && !success && (
						<PayMoodPicker theme={theme} textStyles={textStyles} selected={selectedMood} onSelect={setSelectedMood} />
					)}

					<PayOutcome
						theme={theme}
						textStyles={textStyles}
						success={success}
						payError={payError}
						alreadyPaid={alreadyPaid}
						isOwn={isOwn}
						status={transaction.status}
					/>

				</ScrollView>

				{/* Actions */}
				<View style={[styles.actions, { paddingHorizontal: theme.spacing.md }]}>
					{canPay && !success ? (
						<>
							<QPButton
								title={t('transactions.pay.payButton', { amount: amountFixed })}
								icon="lock"
								iconColor={theme.colors.buttonText}
								onPress={handlePay}
								loading={paying}
								disabled={paying}
								textStyle={{ color: theme.colors.buttonText }}
							/>
							<QPButton
								title={t('common.actions.cancel')}
								onPress={handleClose}
								style={{ backgroundColor: 'transparent' }}
								textStyle={{ color: theme.colors.secondaryText }}
							/>
						</>
					) : (
						<QPButton
							title={t('common.actions.close')}
							onPress={handleClose}
							style={{ backgroundColor: theme.colors.surface }}
							textStyle={{ color: theme.colors.primaryText }}
						/>
					)}
				</View>

			</View>
		</View>
	)
}

// ---------- Subcomponentes ----------

/** Logo (o avatar, o marcador) del comercio con su nombre y descripción. */
const PayMerchantHeader = ({ theme, textStyles, transaction }: { theme: Theme, textStyles: TextStyles, transaction: TransactionModel }) => {

	const app = transaction.app
	// `mediaUrl` solo devuelve null con un path vacío, que el ternario ya descarta
	const logo = app?.logo ? { uri: mediaUrl(app.logo) as string } : null

	return (
		<View style={styles.merchantHeader}>
			{logo ? (
				<FastImage source={logo} style={styles.merchantLogo} resizeMode={FastImage.resizeMode.cover} />
			) : transaction.user ? (
				<QPAvatar user={transaction.user} size={72} />
			) : (
				<View style={[styles.merchantLogo, { backgroundColor: theme.colors.surface, alignItems: 'center', justifyContent: 'center' }]}>
					<FontAwesome6 name="store" size={28} color={theme.colors.primary} iconStyle="solid" />
				</View>
			)}
			<Text style={[textStyles.h3, { marginTop: 12, textAlign: 'center' }]}>{app?.name || transaction.user?.name || 'QvaPay'}</Text>
			{app?.desc ? (
				<Text style={[textStyles.h6, { color: theme.colors.secondaryText, marginTop: 4, textAlign: 'center' }]} numberOfLines={2}>{app.desc}</Text>
			) : null}
		</View>
	)
}

/** Saldo disponible, en rojo cuando no alcanza. Solo en facturas todavía pagables. */
const PayBalanceHint = ({ theme, textStyles, visible, hasEnough, balanceFixed }: { theme: Theme, textStyles: TextStyles, visible: boolean, hasEnough: boolean, balanceFixed: string }) => {

	const { t } = useTranslation()
	if (!visible) return null

	const tone = hasEnough ? theme.colors.secondaryText : theme.colors.danger

	return (
		<View style={[styles.balanceHint, { backgroundColor: hasEnough ? theme.colors.surface : theme.colors.danger + '20' }]}>
			<FontAwesome6 name={hasEnough ? 'wallet' : 'triangle-exclamation'} size={14} color={tone} iconStyle="solid" />
			<Text style={[textStyles.h6, { color: tone, marginLeft: 8 }]}>
				{hasEnough ? t('transactions.pay.balanceAvailable', { amount: balanceFixed }) : t('transactions.pay.insufficientBalance', { amount: balanceFixed })}
			</Text>
		</View>
	)
}

/** Reacción opcional que viaja con el pago. */
const PayMoodPicker = ({ theme, textStyles, selected, onSelect }: { theme: Theme, textStyles: TextStyles, selected: string, onSelect: (mood: string) => void }) => {

	const { t } = useTranslation()

	return (
		<View style={{ marginTop: 20 }}>
			<Text style={[textStyles.h6, { color: theme.colors.secondaryText, marginBottom: 10 }]}>{t('transactions.pay.moodQuestion')}</Text>
			<View style={styles.moodsRow}>
				{MOODS.map((mood) => {
					const isSelected = selected === mood.value
					return (
						<Pressable key={mood.value || 'none'} onPress={() => onSelect(mood.value)} style={[styles.moodChip, { backgroundColor: isSelected ? mood.color : theme.colors.surface, borderColor: isSelected ? mood.color : theme.colors.border }]} >
							<FontAwesome6 name={mood.icon} size={16} color={isSelected ? '#fff' : mood.color} iconStyle="solid" />
							<Text style={[textStyles.h7, { color: isSelected ? '#fff' : theme.colors.primaryText, marginLeft: 6 }]}>{t(mood.labelKey)}</Text>
						</Pressable>
					)
				})}
			</View>
		</View>
	)
}

/** Cierre de la hoja: animación de éxito, error del pago o por qué no se puede pagar. */
const PayOutcome = ({ theme, textStyles, success, payError, alreadyPaid, isOwn, status }: { theme: Theme, textStyles: TextStyles, success: boolean, payError: string | null, alreadyPaid: boolean, isOwn: boolean, status: string }) => {

	const { t } = useTranslation()

	return (
		<>
			{success && (
				<View style={styles.successWrap}>
					<LottieView source={require('../../assets/lotties/transfer_ok.json')} autoPlay loop={false} style={{ width: 140, height: 140 }} />
					<Text style={[textStyles.h3, { color: theme.colors.successText, marginTop: 8 }]}>{t('transactions.pay.paymentDone')}</Text>
				</View>
			)}

			{payError && !success ? (<Text style={[textStyles.error, { marginTop: 14, textAlign: 'center' }]}>{payError}</Text>) : null}

			{alreadyPaid && (
				<Text style={[textStyles.h6, { color: theme.colors.secondaryText, textAlign: 'center', marginTop: 16 }]}>
					{t('transactions.pay.alreadyPaid', { status: statusText(status).toLowerCase() })}
				</Text>
			)}
			{isOwn && !alreadyPaid && (
				<Text style={[textStyles.h6, { color: theme.colors.secondaryText, textAlign: 'center', marginTop: 16 }]}>
					{t('transactions.pay.ownInvoice')}
				</Text>
			)}
		</>
	)
}

const styles = StyleSheet.create({
	backdrop: {
		flex: 1,
		justifyContent: 'flex-end',
	},
	overlayPress: {
		position: 'absolute',
		top: 0, left: 0, right: 0, bottom: 0,
	},
	sheet: {
		borderTopLeftRadius: 24,
		borderTopRightRadius: 24,
		maxHeight: '92%',
		paddingTop: 10,
	},
	handle: {
		alignSelf: 'center',
		width: 44,
		height: 5,
		borderRadius: 3,
		backgroundColor: 'rgba(128,128,128,0.4)',
		marginBottom: 6,
	},
	closeBtn: {
		position: 'absolute',
		top: 14,
		right: 16,
		width: 32,
		height: 32,
		borderRadius: 16,
		alignItems: 'center',
		justifyContent: 'center',
		zIndex: 10,
	},
	merchantHeader: {
		alignItems: 'center',
		marginTop: 10,
		marginBottom: 8,
	},
	merchantLogo: {
		width: 72,
		height: 72,
		borderRadius: 36,
	},
	amountWrap: {
		alignItems: 'center',
		marginVertical: 14,
		gap: 8,
	},
	statusBadge: {
		paddingHorizontal: 12,
		paddingVertical: 4,
		borderRadius: 12,
	},
	card: {
		borderRadius: 16,
		paddingHorizontal: 16,
		paddingVertical: 6,
		marginTop: 8,
	},
	row: {
		flexDirection: 'row',
		justifyContent: 'space-between',
		alignItems: 'center',
		paddingVertical: 12,
		borderBottomWidth: 0.5,
		borderBottomColor: 'rgba(255,255,255,0.08)',
	},
	rowLast: {
		borderBottomWidth: 0,
	},
	balanceHint: {
		flexDirection: 'row',
		alignItems: 'center',
		padding: 12,
		borderRadius: 12,
		marginTop: 12,
	},
	moodsRow: {
		flexDirection: 'row',
		flexWrap: 'wrap',
		gap: 8,
	},
	moodChip: {
		flexDirection: 'row',
		alignItems: 'center',
		paddingHorizontal: 12,
		paddingVertical: 8,
		borderRadius: 20,
		borderWidth: 1,
	},
	successWrap: {
		alignItems: 'center',
		marginTop: 20,
	},
	actions: {
		paddingTop: 8,
	},
})

export default Pay
