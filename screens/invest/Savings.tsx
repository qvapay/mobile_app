import { useEffect, useReducer } from 'react'
import { View, Text, StyleSheet, ScrollView, Linking, Modal, Pressable, TextInput, useWindowDimensions } from 'react-native'
import type { ImageStyle, TextStyle, ViewStyle } from 'react-native'
import { useTranslation } from 'react-i18next'

// Theme
import { useTheme } from '../../theme/ThemeContext'
import { useContainerStyles, useTextStyles } from '../../theme/themeUtils'

// API (deposit/withdraw — las lecturas viven en React Query)
import { savingApi } from '../../api/savingApi'
import { useQueryClient } from '@tanstack/react-query'
import { trimToFirstPage } from '../../api/queryUtils'
import { useSavingsSummaryQuery } from '../../hooks/useSavingsSummaryQuery'
import { useSavingsMovementsQuery } from './investQueries'

// UI
import QPButton from '../../ui/particles/QPButton'
import QPLoader from '../../ui/particles/QPLoader'
import QPBalance from '../../ui/particles/QPBalance'

// Icons
import FontAwesome6 from '@react-native-vector-icons/fontawesome6'

// User context
import { useAuth } from '../../auth/AuthContext'

// Gate de KYC (el ahorro requiere identidad verificada)
import useKycGate from '../../hooks/useKycGate'
import KycGateModal from '../../ui/KycGateModal'

// Toast
import { toast } from 'sonner-native'

// Routes
import { ROUTES } from '../../routes'

// Helpers
import { timeAgo, formatMoney } from '../../helpers'
import { sanitizeAmountInput, parseAmountInput } from '../../helpers/amountInput'
import { useKeyboardHeight } from '../../hooks/useKeyboardHeight'

// Tipos
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import type { RootStackParamList } from '../../types/navigation'
import type { Theme } from '../../theme/ThemeContext'
import type { SavingsMovement, SavingsSummary } from '../../types/domain'
import type { FontAwesome6SolidIconName } from '@react-native-vector-icons/fontawesome6'

type SavingsProps = NativeStackScreenProps<RootStackParamList, 'Savings'>

/**
 * `StyleSheet.create` es una función IDENTIDAD, pero su tipo solo admite
 * objetos de estilo; esta hoja mezcla estáticos con builders que reciben el
 * theme (`cardBorder(theme)`). El alias tipado los deja convivir sin tocar el
 * runtime: se sigue emitiendo `StyleSheet.create({ … })`.
 */
type StyleMap = Record<string, ViewStyle | TextStyle | ImageStyle | ((theme: Theme) => ViewStyle)>

/**
 * OJO (pre-existente, NO tocado): el theme expone `isDark`, no `mode`, así que
 * la comparación contra 'light' es siempre falsa en runtime y el borde claro de
 * las cards nunca se pinta. Se conserva tal cual con un cast local.
 */
const themeMode = (theme: Theme) => (theme as Theme & { mode?: 'light' | 'dark' }).mode

/** Operación abierta en el modal (null = cerrado). */
type ModalType = 'deposit' | 'withdraw' | null

type ModalState = { type: ModalType, amount: string, loading: boolean }

type ModalAction =
	| { type: 'open', modalType: Exclude<ModalType, null> }
	| { type: 'close' }
	| { type: 'setAmount', amount: string }
	| { type: 'setLoading', loading: boolean }

// The deposit/withdraw modal is one piece of state: which operation, the amount, and its loading flag
const initialModal: ModalState = { type: null, amount: '', loading: false }

function modalReducer(state: ModalState, action: ModalAction): ModalState {
	switch (action.type) {
		case 'open':
			return { type: action.modalType, amount: '', loading: false }
		case 'close':
			return { ...state, type: null }
		case 'setAmount':
			return { ...state, amount: action.amount }
		case 'setLoading':
			return { ...state, loading: action.loading }
		default:
			return state
	}
}

/**
 * Savings account screen: balance, earnings history and deposit/withdraw operations.
 * Accepts an optional pre-fetched summary in `route.params.savings` (from Invest) to
 * render instantly; otherwise loads `savingApi.getSummary` plus the last 20 movements.
 * Deposits/withdrawals post to `/saving/deposit` and `/saving/withdraw` (min $1) from a
 * centered card modal, then refresh both the savings summary and the wallet balance.
 * The balance can be negative (admin-managed debt) — rendered in danger color.
 */
const Savings = ({ route }: SavingsProps) => {

	const { t } = useTranslation()
	const { theme } = useTheme()
	const containerStyles = useContainerStyles(theme)
	const textStyles = useTextStyles(theme)
	const { user } = useAuth()
	const { height: windowHeight } = useWindowDimensions()
	const { keyboardHeight, keyboardVisible } = useKeyboardHeight()

	// Resumen (query compartida con BalanceCard/Invest) + movimientos. El
	// summary de route.params pinta al instante mientras la query revalida
	const queryClient = useQueryClient()
	const summaryQuery = useSavingsSummaryQuery()
	const movementsQuery = useSavingsMovementsQuery(20)
	// `route.params.savings` está modelado como `Record<string, unknown>` en
	// types/navigation: es el mismo resumen que la query — cast local
	const savings = summaryQuery.data || (route.params?.savings as SavingsSummary | undefined) || null
	const transactions = movementsQuery.data || []
	const isLoading = !savings && summaryQuery.isPending

	// Modal state
	const [modal, dispatchModal] = useReducer(modalReducer, initialModal)
	const { type: modalType, amount: modalAmount, loading: modalLoading } = modal

	const checkingBalance = Number(user?.balance || 0)
	const savingsBalance = Number(savings?.balance || 0)

	// Gate de KYC — el backend rechaza depósitos y retiros de ahorro sin KYC
	const { requireKyc, gateVisible, gateMessage, closeGate } = useKycGate()

	const openModal = (type: Exclude<ModalType, null>) => {
		if (!requireKyc({ message: t('invest.savings.kycGateMessage') })) return
		dispatchModal({ type: 'open', modalType: type })
	}

	// Deep-action desde la botonera del Home ({ action: 'deposit'|'withdraw' }):
	// abre el modal correspondiente al entrar (pasa por el gate de KYC igual)
	const initialAction = route?.params?.action
	useEffect(() => {
		if (initialAction === 'deposit' || initialAction === 'withdraw') { openModal(initialAction) }
	}, [initialAction]) // eslint-disable-line react-hooks/exhaustive-deps

	const handleModalSubmit = async () => {
		const amount = parseAmountInput(modalAmount)
		if (!amount || amount < 1) {
			toast.error(t('invest.savings.toasts.minAmount'))
			return
		}
		if (modalType === 'deposit' && amount > checkingBalance) {
			toast.error(t('invest.savings.toasts.insufficientBalance'))
			return
		}
		if (modalType === 'withdraw' && amount > savingsBalance) {
			toast.error(t('invest.savings.toasts.insufficientSavings'))
			return
		}

		dispatchModal({ type: 'setLoading', loading: true })
		try {
			const res = modalType === 'deposit'
				? await savingApi.deposit(amount)
				: await savingApi.withdraw(amount)
			if (res.success) {
				toast.success(modalType === 'deposit' ? t('invest.savings.toasts.depositDone') : t('invest.savings.toasts.withdrawDone'))
				dispatchModal({ type: 'close' })
				// Invalidar la raíz de ahorros refresca resumen y movimientos aquí,
				// en el dashboard de Invest y en la página 2 del BalanceCard. La
				// invalidación de ['home'] cubre el feed y ['home','profile']: su
				// efecto vuelca el perfil (y el saldo nuevo) en AuthContext
				queryClient.invalidateQueries({ queryKey: ['savings'] })
				queryClient.invalidateQueries({ queryKey: ['home'] })
				// Recorte a página 1 antes de invalidar: cada lista infinita del
				// histórico refresca con UNA petición, no una por página cargada
				queryClient.setQueriesData({ queryKey: ['transactions'] }, trimToFirstPage)
				queryClient.invalidateQueries({ queryKey: ['transactions'] })
			} else {
				toast.error(res.error || t('invest.savings.toasts.operationError'))
			}
		} catch (e) {
			toast.error((e as Error)?.message || t('invest.savings.toasts.networkError'))
		} finally { dispatchModal({ type: 'setLoading', loading: false }) }
	}

	if (isLoading) return <QPLoader />

	const rate = savings?.currentRate || 0
	const totalDeposited = Number(savings?.totalDeposited || savings?.total_deposited || 0).toFixed(2)
	const totalWithdrawn = Number(savings?.totalWithdrawn || savings?.total_withdrawn || 0).toFixed(2)
	const totalEarned = Number(savings?.totalEarned || savings?.total_earned || 0).toFixed(2)

	return (
		<View style={containerStyles.subContainer}>
			<ScrollView
				style={styles.scroll}
				contentContainerStyle={styles.scrollContent}
				showsVerticalScrollIndicator={false}
			>
				{/* Hero */}
				<View style={styles.hero}>
					<View style={[styles.heroIcon, { backgroundColor: theme.colors.primary + '15' }]}>
						<FontAwesome6 name="vault" size={28} color={theme.colors.primary} iconStyle="solid" />
					</View>
					{/* Mismo particle que el BalanceCard del Home: símbolo gris menor,
					    cifras en negro/blanco (o danger si hay deuda — QPBalance lo
					    detecta por el prefijo "-") */}
					<QPBalance amount={savingsBalance} fontSize={60} theme={theme} style={styles.heroBalance} />
					<Text style={[styles.heroRate, { color: theme.colors.secondaryText, fontSize: theme.typography.fontSize.sm, fontFamily: theme.typography.fontFamily.regular }]}>
						<Text style={{ color: theme.colors.successText, fontFamily: theme.typography.fontFamily.semiBold }}>{rate}%</Text> {t('invest.common.perYear')}
					</Text>
				</View>

				{/* Action buttons */}
				<View style={styles.buttonsRow}>
					{/* Mismo lenguaje que las pills del morph del BalanceCard:
					    squircle, 56 de alto y el verde del servicio de ahorro */}
					<QPButton
						title={t('invest.common.deposit')}
						icon="arrow-down"
						onPress={() => openModal('deposit')}
						style={[styles.actionButton, { backgroundColor: theme.colors.successFill }]}
						textStyle={{ color: theme.colors.successFillText }}
						iconColor={theme.colors.successFillText}
					/>
					<QPButton
						title={t('invest.common.withdraw')}
						icon="arrow-up"
						onPress={() => openModal('withdraw')}
						style={[styles.actionButton, { backgroundColor: theme.colors.successFill }]}
						textStyle={{ color: theme.colors.successFillText }}
						iconColor={theme.colors.successFillText}
					/>
				</View>

				{/* Stats */}
				{(Number(totalDeposited) > 0 || Number(totalWithdrawn) > 0 || Number(totalEarned) > 0) && (
					<View style={[styles.statsCard, { backgroundColor: theme.colors.surface }, themeMode(theme) === 'light' && styles.cardBorder(theme)]}>
						<StatRow label={t('invest.savings.totalDeposited')} value={`$${totalDeposited}`} theme={theme} />
						<StatRow label={t('invest.savings.totalWithdrawn')} value={`$${totalWithdrawn}`} theme={theme} />
						<StatRow label={t('invest.savings.earnings')} value={`$${totalEarned}`} theme={theme} valueColor={theme.colors.successText} isLast />
					</View>
				)}

				{/* Separator */}
				<View style={[styles.separator, { borderBottomColor: theme.colors.border + '40' }]} />

				{/* Activity */}
				<Text style={[textStyles.h3, styles.sectionTitle]}>{t('invest.savings.activity')}</Text>
				{transactions.length > 0 ? (
					<View style={[styles.activityCard, { backgroundColor: theme.colors.surface }, themeMode(theme) === 'light' && styles.cardBorder(theme)]}>
						{transactions.map((tx, index) => (
							<ActivityRow key={tx.id} tx={tx} theme={theme} isLast={index === transactions.length - 1} />
						))}
					</View>
				) : (
					<View style={styles.emptyActivity}>
						<FontAwesome6 name="clock-rotate-left" size={32} color={theme.colors.secondaryText + '60'} iconStyle="solid" />
						<Text style={[styles.emptyText, { color: theme.colors.secondaryText, fontSize: theme.typography.fontSize.sm, fontFamily: theme.typography.fontFamily.regular }]}>
							{t('invest.savings.emptyActivity')}
						</Text>
					</View>
				)}

				{/* Separator */}
				<View style={[styles.separator, { borderBottomColor: theme.colors.border + '40' }]} />

				{/* Disclaimer */}
				<View style={styles.disclaimer}>
					<FontAwesome6 name="shield-halved" size={20} color={theme.colors.secondaryText + '80'} iconStyle="solid" />
					<Text style={[styles.disclaimerText, { color: theme.colors.tertiaryText, fontSize: theme.typography.fontSize.xs, fontFamily: theme.typography.fontFamily.regular }]}>
						{t('invest.savings.disclaimer')}
					</Text>
					<Text
						style={[styles.disclaimerLink, { color: theme.colors.primary, fontSize: theme.typography.fontSize.xs, fontFamily: theme.typography.fontFamily.medium }]}
						onPress={() => Linking.openURL(ROUTES.TERMS_AND_CONDITIONS)}
					>
						{t('invest.savings.termsOfService')}
					</Text>
				</View>
			</ScrollView>

			{/* Deposit / Withdraw Modal */}
			<Modal visible={!!modalType} transparent animationType="fade" statusBarTranslucent onRequestClose={() => !modalLoading && dispatchModal({ type: 'close' })}>
				{/* Overlay + card canónicos del theme (el overlay trae el padding
				    horizontal que mantiene la card dentro de los márgenes). Con el
				    teclado abierto el overlay cede su altura como paddingBottom para
				    re-centrar la card en el espacio restante — KeyboardAvoidingView
				    no es fiable dentro de un Modal statusBarTranslucent en Android */}
				<Pressable
					style={[containerStyles.modalOverlay, keyboardVisible && { paddingBottom: keyboardHeight + 16 }]}
					onPress={() => !modalLoading && dispatchModal({ type: 'close' })}
				>
					<Pressable onPress={() => { }} style={[containerStyles.modalCard, { maxHeight: keyboardVisible ? windowHeight - keyboardHeight - 48 : windowHeight * 0.75 }]}>

						{/* Header */}
						<View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
							<Text style={[textStyles.h4, { color: theme.colors.primaryText }]}>
								{modalType === 'deposit' ? t('invest.common.deposit') : t('invest.common.withdraw')}
							</Text>
							<Pressable onPress={() => !modalLoading && dispatchModal({ type: 'close' })} hitSlop={8}>
								<FontAwesome6 name="xmark" size={20} color={theme.colors.secondaryText} iconStyle="solid" />
							</Pressable>
						</View>

						{/* Available balance hint */}
						<Text style={{ color: theme.colors.secondaryText, fontSize: theme.typography.fontSize.xs, fontFamily: theme.typography.fontFamily.regular, textAlign: 'center', marginBottom: 8 }}>
							{modalType === 'deposit'
								? t('invest.savings.availableBalance', { amount: formatMoney(checkingBalance) })
								: t('invest.savings.inSavings', { amount: formatMoney(savingsBalance) })
							}
						</Text>

						{/* Amount input */}
						<View style={{ alignItems: 'center', marginBottom: 24 }}>
							<View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}>
								{/* Símbolo al patrón de QPBalance: gris medio y un paso menor que las cifras */}
								<Text style={{ color: theme.colors.secondaryText, fontSize: theme.typography.fontSize.xxxl, fontFamily: theme.typography.fontFamily.semiBold, marginRight: 4 }}>$</Text>
								<TextInput
									value={modalAmount}
									onChangeText={(amount) => dispatchModal({ type: 'setAmount', amount: sanitizeAmountInput(amount) })}
									placeholder="0.00"
									placeholderTextColor={theme.colors.tertiaryText}
									keyboardType="decimal-pad"
									autoFocus
									style={{
										color: theme.colors.primaryText,
										fontSize: 40,
										fontFamily: theme.typography.fontFamily.semiBold,
										minWidth: 80,
										textAlign: 'center',
										padding: 0,
									}}
								/>
							</View>
						</View>

						{/* Max button */}
						<Pressable
							onPress={() => dispatchModal({
								type: 'setAmount',
								amount: modalType === 'deposit'
									? checkingBalance.toFixed(2)
									: savingsBalance.toFixed(2)
							})}
							style={{ alignSelf: 'center', marginBottom: 24 }}
						>
							<Text style={{ color: theme.colors.primary, fontSize: theme.typography.fontSize.sm, fontFamily: theme.typography.fontFamily.semiBold }}>{t('invest.savings.useMax')}</Text>
						</Pressable>

						{/* Submit */}
						<QPButton
							title={modalType === 'deposit' ? t('invest.common.deposit') : t('invest.common.withdraw')}
							icon={modalType === 'deposit' ? 'arrow-down' : 'arrow-up'}
							onPress={handleModalSubmit}
							loading={modalLoading}
							disabled={modalLoading || !modalAmount || parseAmountInput(modalAmount) < 1}
						/>

					</Pressable>
				</Pressable>
			</Modal>

			{/* `useKycGate` entrega `string | null` y el modal declara `string | undefined`: cast local */}
			<KycGateModal visible={gateVisible} message={gateMessage as string | undefined} onClose={closeGate} />
		</View>
	)
}

const StatRow = ({ label, value, theme, valueColor, isLast }: { label: string, value: string, theme: Theme, valueColor?: string, isLast?: boolean }) => (
	<View style={[styles.statRow, !isLast && styles.statBorder(theme)]}>
		<Text style={[styles.statLabel, { color: theme.colors.secondaryText, fontSize: theme.typography.fontSize.sm, fontFamily: theme.typography.fontFamily.regular }]}>{label}</Text>
		<Text style={[styles.statValue, { color: valueColor || theme.colors.primaryText, fontSize: theme.typography.fontSize.sm, fontFamily: theme.typography.fontFamily.semiBold }]}>{value}</Text>
	</View>
)

// Las etiquetas son claves i18n resueltas en render (constante de módulo)
const txConfig: Record<string, { icon: FontAwesome6SolidIconName, color: string, labelKey: string }> = {
	deposit: { icon: 'arrow-down', color: '#10B981', labelKey: 'invest.savings.txTypes.deposit' },
	withdrawal: { icon: 'arrow-up', color: '#F59E0B', labelKey: 'invest.savings.txTypes.withdrawal' },
	earning: { icon: 'coins', color: '#8B5CF6', labelKey: 'invest.savings.txTypes.earning' },
}

const ActivityRow = ({ tx, theme, isLast }: { tx: SavingsMovement, theme: Theme, isLast: boolean }) => {
	const { t } = useTranslation()
	const config = txConfig[tx.type] || txConfig.deposit
	const isPositive = tx.type === 'deposit' || tx.type === 'earning'
	const sign = isPositive ? '+' : '-'

	return (
		<View style={[styles.activityRow, !isLast && styles.statBorder(theme)]}>
			<View style={[styles.activityIcon, { backgroundColor: config.color + '18' }]}>
				<FontAwesome6 name={config.icon} size={14} color={config.color} iconStyle="solid" />
			</View>
			<View style={styles.activityInfo}>
				<Text style={[styles.activityLabel, { color: theme.colors.primaryText, fontSize: theme.typography.fontSize.sm, fontFamily: theme.typography.fontFamily.medium }]}>{tx.description || t(config.labelKey)}</Text>
				<Text style={[styles.activityDate, { color: theme.colors.tertiaryText, fontSize: theme.typography.fontSize.xs, fontFamily: theme.typography.fontFamily.regular }]}>{timeAgo(tx.createdAt)}</Text>
			</View>
			<Text style={[styles.activityAmount, { color: isPositive ? theme.colors.successText : theme.colors.primaryText, fontSize: theme.typography.fontSize.sm, fontFamily: theme.typography.fontFamily.semiBold }]}>
				{sign}${Math.abs(tx.amount).toFixed(2)}
			</Text>
		</View>
	)
}

const styles = (StyleSheet.create as <T extends StyleMap>(o: T) => T)({
	scroll: {
		flex: 1,
	},
	scrollContent: {
		paddingBottom: 40,
	},
	// Hero
	hero: {
		alignItems: 'center',
		paddingTop: 20,
		paddingBottom: 24,
	},
	heroIcon: {
		width: 60,
		height: 60,
		borderRadius: 30,
		justifyContent: 'center',
		alignItems: 'center',
		marginBottom: 16,
	},
	// QPBalance trae el alto/margen del keypad — aquí el héroe es más compacto
	heroBalance: {
		height: 'auto',
		marginBottom: 4,
	},
	heroRate: {},
	// Buttons
	buttonsRow: {
		flexDirection: 'row',
		gap: 10,
		marginBottom: 20,
	},
	// Squircle igual que la botonera del Home (QPButton por defecto es píldora)
	actionButton: {
		flex: 1,
		height: 56,
		borderRadius: 16,
		borderCurve: 'continuous',
		marginVertical: 0,
	},
	// Stats
	statsCard: {
		borderRadius: 14,
		padding: 12,
		marginBottom: 8,
	},
	cardBorder: (theme: Theme) => ({
		borderWidth: 1,
		borderColor: theme.colors.border,
	}),
	statRow: {
		flexDirection: 'row',
		justifyContent: 'space-between',
		alignItems: 'center',
		paddingVertical: 10,
	},
	statBorder: (theme: Theme) => ({
		borderBottomWidth: StyleSheet.hairlineWidth,
		borderBottomColor: theme.colors.border + '60',
	}),
	statLabel: {},
	statValue: {},
	// Separator
	separator: {
		borderBottomWidth: StyleSheet.hairlineWidth,
		marginVertical: 16,
	},
	// Activity
	sectionTitle: {
		marginBottom: 16,
	},
	activityCard: {
		borderRadius: 14,
		padding: 4,
		paddingHorizontal: 12,
		marginBottom: 8,
	},
	activityRow: {
		flexDirection: 'row',
		alignItems: 'center',
		paddingVertical: 10,
		gap: 10,
	},
	activityIcon: {
		width: 34,
		height: 34,
		borderRadius: 17,
		justifyContent: 'center',
		alignItems: 'center',
	},
	activityInfo: {
		flex: 1,
		gap: 2,
	},
	activityLabel: {},
	activityDate: {},
	activityAmount: {},
	emptyActivity: {
		alignItems: 'center',
		paddingVertical: 32,
		gap: 12,
	},
	emptyText: {
		textAlign: 'center',
	},
	// Disclaimer
	disclaimer: {
		alignItems: 'center',
		paddingVertical: 8,
		gap: 8,
	},
	disclaimerText: {
		textAlign: 'center',
		lineHeight: 18,
		paddingHorizontal: 16,
	},
	disclaimerLink: {},
	// Modal
})

export default Savings
