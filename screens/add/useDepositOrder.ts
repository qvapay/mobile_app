/**
 * Ciclo de vida de una orden de depósito: creación (`POST /topup`), modal de
 * detalles, cuenta atrás de 30 min, seguimiento en vivo por SSE, detección de
 * wallets instaladas y la hoja nativa de pago con tarjeta.
 *
 * Se extrajo de `Add.tsx` (cuerpo de ~315 líneas) para que la pantalla se
 * quede con el formulario — moneda, monto y modo de fee — y toda la mecánica
 * post-creación viva aquí.
 *
 * El crédito real de un depósito CARD lo hace el webhook y llega como 'paid'
 * por SSE: la hoja nativa solo mueve el estado a 'processing' (igual que antes).
 */

import { useState, useEffect, useRef, useCallback, useReducer } from 'react'
import { Linking } from 'react-native'
import { useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'

// Helpers
import { detectInstalledWallets } from '../../helpers/walletDeeplinks'

// Theme
import { useTheme } from '../../theme/ThemeContext'

// Context
import { useAuth } from '../../auth/AuthContext'
import { useSettings } from '../../settings/SettingsContext'

// Depósito con tarjeta (Stripe PaymentSheet)
import { presentCardDeposit } from './cardPaymentSheet'

// API
import apiClient from '../../api/client'
import { trimToFirstPage } from '../../api/queryUtils'

// Hooks
import useTransactionSSE from '../../hooks/useTransactionSSE'
import { markIncomingSoundPlayed } from '../../hooks/useIncomingMoneySound'

// Sonido de dinero entrante
import playSound from '../../helpers/playSound'

// In-app review
import { maybeRequestReview } from '../../helpers/inAppReview'

// Toast
import { toast } from 'sonner-native'

// Tipos
import type { ApiClientError } from '../../types/api'
import type { Coin } from '../../types/domain'
import type { CardFeeMode } from '../../helpers/cardFeeMode'
import type { Wallet } from '../../helpers/walletDeeplinks'
import type { DepositStatus, TopupOrder } from './DepositDetailsModal'

/** Acción única de los dos slices de estado de abajo. */
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

/** Slice del flujo de depósito: modal, orden creada y estado en vivo. */
type DepositState = { showDepositModal: boolean, topupData: TopupOrder | null, depositStatus: DepositStatus }

/** Slice del picker de wallets instaladas. */
type WalletState = { installedWallets: Wallet[], showWalletPicker: boolean }

/** Lo que la orden necesita saber del formulario de la pantalla. */
type DepositOrderArgs = {
	selectedCoin: Coin | null
	amount: string
	/** La moneda elegida es CARD (el `fee_mode` solo viaja en ese caso). */
	isCardCoin: boolean
	feeMode: CardFeeMode
}

/**
 * Orden de depósito: creación, modal, cuenta atrás y seguimiento en vivo.
 *
 * @param args - Moneda y monto del formulario más el modo de fee de CARD.
 * @returns Estado del modal de depósito y sus acciones.
 */
export default function useDepositOrder({ selectedCoin, amount, isCardCoin, feeMode }: DepositOrderArgs) {

	const { user } = useAuth()
	const { sounds } = useSettings()
	const { theme } = useTheme()
	const queryClient = useQueryClient()
	const { t } = useTranslation()

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

	// Countdown timer state
	const [countdown, setCountdown] = useState(1800)
	const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null)

	// SSE connection for real-time deposit status updates
	const handleDepositStatusChange = useCallback((newStatus: DepositStatus) => {
		setDepositStatus(newStatus)
		if (newStatus === 'paid') {
			if (countdownRef.current) clearInterval(countdownRef.current)
			// La moneda suena AL INSTANTE, junto al toast: el refresco de la lista
			// llegaría después. Se marca el uuid para que useIncomingMoneySound no
			// la repita cuando el mismo depósito aparezca en el histórico
			markIncomingSoundPlayed(topupData?.transaction_uuid)
			if (sounds?.enabled && sounds?.transactionSound) { playSound('money_in') }
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
	}, [queryClient, t, topupData?.transaction_uuid, sounds?.enabled, sounds?.transactionSound])

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

	// Start countdown when deposit modal opens
	useEffect(() => {
		if (showDepositModal) {
			setCountdown(1800)
			// El updater se mantiene PURO — React puede invocarlo más de una vez,
			// así que solo calcula el siguiente valor. Parar el intervalo al
			// llegar a 0 es un efecto aparte (abajo).
			countdownRef.current = setInterval(() => {
				setCountdown(prev => (prev <= 1 ? 0 : prev - 1))
			}, 1000)
		} else { if (countdownRef.current) { clearInterval(countdownRef.current) } }
		return () => { if (countdownRef.current) { clearInterval(countdownRef.current) } }
	}, [showDepositModal])

	// Agotada la ventana de 30 min no queda nada que contar
	useEffect(() => {
		if (countdown === 0 && countdownRef.current) {
			clearInterval(countdownRef.current)
			countdownRef.current = null
		}
	}, [countdown])

	return {
		// Modal de detalles y estado de la orden
		showDepositModal, setShowDepositModal, topupData, depositStatus, countdown, sseConnected,
		// Wallets instaladas
		installedWallets, showWalletPicker, setShowWalletPicker,
		// Acciones
		handleTopup, launchCardSheet,
		// Carga y error (la pantalla también escribe `error` al fallar el catálogo)
		isLoading, error, setError,
	}
}
