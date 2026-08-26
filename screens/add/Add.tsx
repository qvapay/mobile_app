import { useState, useEffect, useMemo, useRef, useCallback, useReducer } from 'react'
import type { ComponentProps } from 'react'
import { StyleSheet, Text, View, Pressable, Linking } from 'react-native'
import { useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'

// Helpers
import { detectInstalledWallets } from '../../helpers/walletDeeplinks'

// Theme
import { useTheme } from '../../theme/ThemeContext'
import { createContainerStyles, createTextStyles } from '../../theme/themeUtils'

// Context
import { useAuth } from '../../auth/AuthContext'

// UI
import QPKeyboardView from '../../ui/QPKeyboardView'
import QPButton from '../../ui/particles/QPButton'
import AmountInput from '../../ui/AmountInput'
import QPCoinRow from '../../ui/QPCoinRow'
import QPCoinPicker from '../../ui/QPCoinPicker'
import useCoins from '../../hooks/useCoins'
import WalletPickerSheet from '../../ui/WalletPickerSheet'
import DepositDetailsModal from './DepositDetailsModal'

// Depósito con tarjeta (Stripe PaymentSheet)
import { presentCardDeposit } from './cardPaymentSheet'
import CardFeeModeSelector from './CardFeeModeSelector'
import { isCardDepositEligible, filterCardFromCatalog } from '../../helpers/cardDepositEligibility'
import { cardFeeRateFor } from '../../helpers/cardFeeMode'

// API
import apiClient from '../../api/client'
import { trimToFirstPage } from '../../api/queryUtils'

// Hooks
import useTransactionSSE from '../../hooks/useTransactionSSE'

// In-app review
import { maybeRequestReview } from '../../helpers/inAppReview'

// Icons
import FontAwesome6 from '@react-native-vector-icons/fontawesome6'

// Toast
import { toast } from 'sonner-native'

// Tipos
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import type { RootStackParamList } from '../../types/navigation'
import type { ApiClientError } from '../../types/api'
import type { Coin } from '../../types/domain'
import type { CardFeeMode } from '../../helpers/cardFeeMode'
import type { Wallet } from '../../helpers/walletDeeplinks'
import type { DepositStatus, TopupOrder } from './DepositDetailsModal'

type AddProps = NativeStackScreenProps<RootStackParamList, 'Add'>

/** Acción única de los tres slices de estado de abajo. */
type FieldAction = { type: 'set', field: string, value: unknown }

// Generic field setter for the related-state slices below
function setFieldReducer<S extends object>(state: S, action: FieldAction): S {
	switch (action.type) {
		case 'set':
			return { ...state, [action.field]: action.value } as S
		default:
			return state
	}
}

/** Slice del formulario: catálogo disponible, moneda elegida y monto tecleado. */
type FormState = { availableCoins: Coin[], selectedCoin: Coin | null, amount: string }

/** Slice del flujo de depósito: modal, orden creada y estado en vivo. */
type DepositState = { showDepositModal: boolean, topupData: TopupOrder | null, depositStatus: DepositStatus }

/** Slice del picker de wallets instaladas. */
type WalletState = { installedWallets: Wallet[], showWalletPicker: boolean }

// Quick coin pills for deposit
const DEFAULT_DEPOSIT_COINS = [
	{ tick: 'USDT', label: 'USDT' },
	{ tick: 'BTC', label: 'BTC' },
	{ tick: 'USDTBSC', label: 'USDT BSC' },
]
const RECENT_DEPOSIT_KEY = 'qp_recent_deposit_coins'

/**
 * Deposit ("Add money") screen: pick a coin, enter an amount, get a payment address.
 * Coins come from `GET /coins/v2?enabled_in=true`; the deposit is created via
 * `POST /topup`. The resulting invoice modal follows the transaction in real time
 * over SSE (`useTransactionSSE`) for paid/expired/failed status and refreshes the
 * balance (and may request an in-app review) once confirmed.
 * Crypto deposits detect installed wallets (Trust Wallet & co.) and can open them
 * pre-filled via universal links (`helpers/walletDeeplinks`).
 */
// `navigation` se desestructura pero la pantalla no navega a ningún sitio (todo
// ocurre en modales): se conserva la desestructuración y se marca con `_` según
// la convención del eslint del proyecto
const Add = ({ navigation: _navigation }: AddProps) => {

	// User Context
	const { user } = useAuth()
	const queryClient = useQueryClient()
	const { t } = useTranslation()

	// Theme variables, dark and light modes
	const { theme } = useTheme()
	const { coins: coinCatalog, isLoading: loadingCoins } = useCoins('in')
	const containerStyles = createContainerStyles(theme)
	const textStyles = createTextStyles(theme)
	// Coin/amount form (same-named setters keep every call site unchanged)
	const [form, dispatchForm] = useReducer(setFieldReducer<FormState>, { availableCoins: [], selectedCoin: null, amount: '' })
	const { availableCoins, selectedCoin, amount } = form
	const setAvailableCoins = (value: Coin[] | null | undefined) => dispatchForm({ type: 'set', field: 'availableCoins', value })
	const setSelectedCoin = (value: Coin | null) => dispatchForm({ type: 'set', field: 'selectedCoin', value })
	const setAmount = (value: string) => dispatchForm({ type: 'set', field: 'amount', value })

	// Deposit flow
	const [deposit, dispatchDeposit] = useReducer(setFieldReducer<DepositState>, { showDepositModal: false, topupData: null, depositStatus: 'pending' })
	const { showDepositModal, topupData, depositStatus } = deposit
	const setShowDepositModal = (value: boolean) => dispatchDeposit({ type: 'set', field: 'showDepositModal', value })
	const setTopupData = (value: TopupOrder | null) => dispatchDeposit({ type: 'set', field: 'topupData', value })
	const setDepositStatus = (value: DepositStatus) => dispatchDeposit({ type: 'set', field: 'depositStatus', value })

	// Wallet picker
	const [wallet, dispatchWallet] = useReducer(setFieldReducer<WalletState>, { installedWallets: [], showWalletPicker: false })
	const { installedWallets, showWalletPicker } = wallet
	const setInstalledWallets = (value: Wallet[]) => dispatchWallet({ type: 'set', field: 'installedWallets', value })
	const setShowWalletPicker = (value: boolean) => dispatchWallet({ type: 'set', field: 'showWalletPicker', value })

	const [isLoading, setIsLoading] = useState(false)
	const [error, setError] = useState<string | null>(null)
	const [showCoinPicker, setShowCoinPicker] = useState(false)

	// SSE connection for real-time deposit status updates
	const handleDepositStatusChange = useCallback((newStatus: DepositStatus) => {
		setDepositStatus(newStatus)
		if (newStatus === 'paid') {
			if (countdownRef.current) clearInterval(countdownRef.current)
			toast.success(t('add.index.toasts.paymentConfirmed.title'), { description: t('add.index.toasts.paymentConfirmed.description') })
			// Refresca las lecturas de servidor en React Query: con enableFreeze los
			// observadores sobreviven al fondo y sin invalidación seguirían mostrando
			// el pre-depósito hasta remontar. ['home'] incluye ['home','profile'],
			// cuyo efecto vuelca el perfil (y el saldo nuevo) en AuthContext
			queryClient.invalidateQueries({ queryKey: ['home'] })
			// Recorte a página 1 antes de invalidar: cada lista infinita del
			// histórico refresca con UNA petición, no una por página cargada
			queryClient.setQueriesData({ queryKey: ['transactions'] }, trimToFirstPage)
			queryClient.invalidateQueries({ queryKey: ['transactions'] })
			// Close modal after a brief delay so the success toast reads clearly
			setTimeout(() => { setShowDepositModal(false) }, 2000)
			// Ask for app review after modal closes
			setTimeout(() => { maybeRequestReview() }, 3500)
		} else if (newStatus === 'expired') {
			if (countdownRef.current) clearInterval(countdownRef.current)
			setCountdown(0)
		} else if (newStatus === 'failed') { if (countdownRef.current) clearInterval(countdownRef.current) }
	}, [queryClient, t])

	const { isConnected: sseConnected } = useTransactionSSE(
		showDepositModal ? topupData?.transaction_uuid : null,
		handleDepositStatusChange
	)

	// El estado del depósito se resetea en handleTopup al crear cada orden (no en un
	// efecto al abrir el modal: el PaymentSheet de CARD puede resolver 'processing'
	// justo después y un reset por efecto lo pisaría)

	// Detect installed wallets compatible with the issued deposit address.
	// Only relevant for the crypto flow (no redirect_url like PayPal; en CARD el
	// "wallet" es el id del PaymentIntent, no una dirección).
	useEffect(() => {
		if (!topupData?.wallet || topupData?.redirect_url || topupData?.client_secret) { setInstalledWallets([]); return }
		let cancelled = false
			; (async () => {
				const wallets = await detectInstalledWallets(topupData.coin, topupData.network || selectedCoin?.network)
				if (!cancelled) setInstalledWallets(wallets)
			})()
		return () => { cancelled = true }
	}, [topupData?.wallet, topupData?.coin, topupData?.network, topupData?.redirect_url, topupData?.client_secret, selectedCoin?.network])

	// Depósito con tarjeta: espejo cliente del gate del backend (KYC + Telegram +
	// teléfono + 30 días + VIP/trustscore) — decide si se PINTA la opción CARD;
	// el gate real (incluida la geolocalización) vive en POST /topup
	const cardEligible = isCardDepositEligible(user)

	// Usuarios elegibles ven la tarjeta como primera pill de acceso rápido
	// (la etiqueta se resuelve en render para seguir el idioma activo)
	const defaultDepositCoins = useMemo(
		() => (cardEligible ? [{ tick: 'CARD', label: t('add.index.cardPillLabel') }, ...DEFAULT_DEPOSIT_COINS] : DEFAULT_DEPOSIT_COINS),
		[cardEligible, t],
	)

	// Catálogo desde la caché compartida (useCoins): la lista aparece al
	// instante en vez de esperar un viaje a la red en cada entrada
	useEffect(() => {
		if (coinCatalog.length) {
			// OJO (pre-existente, NO tocado): `useCoins` devuelve una lista PLANA de
			// monedas y `filterCardFromCatalog` espera el catálogo AGRUPADO
			// (`{ name, coins }`), así que hoy no filtra nada — la moneda CARD la
			// sigue ocultando el gate real del backend. Casts locales, sin cambiar
			// el comportamiento
			setAvailableCoins(filterCardFromCatalog(coinCatalog as unknown as { coins?: { tick?: string }[] }[], cardEligible) as unknown as Coin[])
			setError(null)
		} else if (!loadingCoins) {
			// Sin catálogo y sin carga en curso: la red falló y no había copia
			setError(t('add.index.errors.loadCoins'))
		}
	}, [coinCatalog, loadingCoins, cardEligible, t])

	// Modo de fee del depósito CARD: 'on_top' (default, el fee se suma al cobro) o
	// 'included' (paga exacto lo tecleado y se acredita el neto). Solo viaja en el
	// POST cuando el método es CARD; el selector se pinta si además el fee es > 0.
	const [feeMode, setFeeMode] = useState<CardFeeMode>('on_top')
	const isCardCoin = selectedCoin?.tick === 'CARD'
	const cardFeeRate = isCardCoin ? cardFeeRateFor(selectedCoin, user) : 0

	// Handle coin selection
	const handleCoinSelect = (coin: Coin) => {
		setSelectedCoin(coin)
		setFeeMode('on_top')
		setShowCoinPicker(false)
	}

	// Depósito CARD: presenta el PaymentSheet nativo de Stripe sobre la orden ya
	// creada. Éxito → "processing" (el crédito real lo hace el webhook y llega por
	// SSE como 'paid'); cancelar deja el modal abierto con el botón para reintentar
	// (el PaymentIntent vive los mismos 30 min que la orden).
	const launchCardSheet = useCallback(async (data: TopupOrder) => {
		const result = await presentCardDeposit({ topupData: data, theme, user })
		if (result.status === 'paid') { setDepositStatus('processing') }
		else if (result.status === 'failed') { toast.error(t('add.index.toasts.cardPaymentTitle'), { description: result.message }) }
	}, [theme, user, t])

	// Handle topup request
	const handleTopup = async () => {
		const amountValue = parseFloat(amount)
		if (isNaN(amountValue) || amountValue <= 0) { toast.error(t('add.index.toasts.invalidAmount')); return }
		if (!selectedCoin || !amount) { toast.error(t('add.index.toasts.missingCoinOrAmount')); return }
		if (amountValue < parseFloat(selectedCoin.min_in as string)) { toast.error(t('add.index.toasts.minAmount', { name: selectedCoin.name, min: selectedCoin.min_in })); return }
		try {
			setIsLoading(true)
			setError(null)
			const response = await apiClient.post('/topup', {
				pay_method: selectedCoin.tick,
				amount: Number(amount),
				...(isCardCoin && { fee_mode: feeMode }),
			})
			if (response.data && response.status === 200) {
				const data = response.data.data
				setTopupData(data)
				setDepositStatus('pending')
				setShowDepositModal(true)
				if (data?.client_secret) {
					launchCardSheet(data)
				} else if (data?.redirect_url) {
					Linking.openURL(data.redirect_url)
				}
			} else { toast.error(t('add.index.toasts.createFailed')) }
		} catch (err) {
			// El gate de tarjeta y el tope diario responden 400/429 con mensaje propio
			const serverMessage = (err as ApiClientError)?.response?.data?.error
			setError(serverMessage || t('add.index.errors.createRetry'))
		}
		finally { setIsLoading(false) }
	}

	// Countdown timer state
	const [countdown, setCountdown] = useState(1800)
	const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null)

	// Start countdown when deposit modal opens
	useEffect(() => {
		if (showDepositModal) {
			setCountdown(1800)
			countdownRef.current = setInterval(() => {
				setCountdown(prev => {
					if (prev <= 1) {
						clearInterval(countdownRef.current!)
						return 0
					}
					return prev - 1
				})
			}, 1000)
		} else { if (countdownRef.current) { clearInterval(countdownRef.current) } }
		return () => { if (countdownRef.current) { clearInterval(countdownRef.current) } }
	}, [showDepositModal])

	return (
		<>
			<QPKeyboardView
				actions={
					<QPButton
						title={t('add.index.generateButton')}
						onPress={handleTopup}
						disabled={!selectedCoin || !amount}
						loading={isLoading}
						icon="plus"
						iconStyle="solid"
						iconColor={theme.colors.almostWhite}
						textStyle={{ color: theme.colors.almostWhite }}
					/>
				}

			>

				{/* Amount Input Component */}
				<AmountInput
					amount={amount}
					onAmountChange={setAmount}
					placeholder={t('add.index.amountPlaceholder')}
					style={{ marginTop: 0 }}
					// Pantalla solo alcanzable autenticado: aserción, sin tocar el runtime
				balance={user!.balance!}
				/>

				{/* Coin Selection */}
				<View style={{ marginVertical: 20 }}>

					{selectedCoin && (
						<Text style={[textStyles.h5, { color: theme.colors.tertiaryText, marginBottom: 12 }]}>
							{t('add.index.selectCoinLabel')}
						</Text>
					)}

					<Pressable style={[styles.coinSelector, { backgroundColor: theme.colors.surface, borderColor: selectedCoin ? theme.colors.primary : theme.colors.elevation }]} onPress={() => setShowCoinPicker(true)} disabled={loadingCoins} >
						{selectedCoin ? (
							<View style={styles.selectedCoin}>
								<QPCoinRow coin={selectedCoin} amount={amount} direction="in" />
								<FontAwesome6 name="chevron-down" size={12} color={theme.colors.secondaryText} iconStyle="solid" style={{ marginLeft: 8 }} />
							</View>
						) : (
							<View style={styles.coinSelectorPlaceholder}>
								<Text style={[textStyles.subtitle, { color: theme.colors.tertiaryText }]}>
									{loadingCoins ? t('add.index.loadingCoins') : t('add.index.selectCoinPlaceholder')}
								</Text>
								<FontAwesome6 name="chevron-down" size={16} color={theme.colors.secondaryText} iconStyle="solid" />
							</View>
						)}
					</Pressable>
				</View>

				{/* Fee mode selector — solo para depósitos con tarjeta y fee > 0 */}
				{isCardCoin && cardFeeRate > 0 && (
					<CardFeeModeSelector
						feeRate={cardFeeRate}
						amount={amount}
						value={feeMode}
						onChange={setFeeMode}
					/>
				)}

				{/* Error/Success Messages */}
				{error && (
					<View style={[containerStyles.card, { backgroundColor: theme.colors.danger + '20', marginVertical: 10 }]}>
						<Text style={[textStyles.caption, { color: theme.colors.danger }]}>{error}</Text>
					</View>
				)}


			</QPKeyboardView>

			{/* Deposit Details Modal */}
			<DepositDetailsModal
				visible={showDepositModal}
				onClose={() => setShowDepositModal(false)}
				amount={amount}
				selectedCoin={selectedCoin}
				topupData={topupData}
				depositStatus={depositStatus}
				countdown={countdown}
				sseConnected={sseConnected}
				installedWallets={installedWallets}
				onOpenWalletPicker={() => setShowWalletPicker(true)}
				onPayWithCard={() => topupData?.client_secret && launchCardSheet(topupData)}
				theme={theme}
				textStyles={textStyles}
			/>

			{/* Coin Picker Modal */}
			<QPCoinPicker
				visible={showCoinPicker}
				onClose={() => setShowCoinPicker(false)}
				onSelect={handleCoinSelect}
				coins={availableCoins}
				selectedCoin={selectedCoin}
				isLoading={loadingCoins}
				amount={amount}
				direction="in"
				recentKey={RECENT_DEPOSIT_KEY}
				defaultCoins={defaultDepositCoins}
			/>

			{/* Wallet Picker Sheet — opens installed wallet pre-filled */}
			<WalletPickerSheet
				visible={showWalletPicker}
				wallets={installedWallets}
				// El sheet solo se abre con una orden cripto ya emitida (hay wallet y
				// coin); el tipo del prop los pide obligatorios — cast local
				ctx={{
					address: topupData?.wallet,
					amount: topupData?.value,
					memo: topupData?.memo,
					coin: topupData?.coin,
					network: topupData?.network || selectedCoin?.network,
				} as ComponentProps<typeof WalletPickerSheet>['ctx']}
				onClose={() => setShowWalletPicker(false)}
			/>

		</>
	)
}

const styles = StyleSheet.create({
	coinSelector: {
		flexDirection: 'row',
		alignItems: 'center',
		padding: 12,
		borderRadius: 16,
		borderWidth: 1,
	},
	coinSelectorPlaceholder: {
		flexDirection: 'row',
		alignItems: 'center',
		justifyContent: 'space-between',
		flex: 1,
		paddingVertical: 4,
	},
	selectedCoin: {
		flexDirection: 'row',
		alignItems: 'center',
		flex: 1,
	},
})

export default Add
