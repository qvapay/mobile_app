import { useState, useEffect, useMemo, useReducer, useRef, useCallback } from 'react'
import type { ComponentProps } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'

// Theme
import { useTheme } from '../../theme/ThemeContext'
import { createContainerStyles, createTextStyles } from '../../theme/themeUtils'

// Context
import { useAuth } from '../../auth/AuthContext'

// UI
import QPKeyboardView from '../../ui/QPKeyboardView'
import QPButton from '../../ui/particles/QPButton'
import QPAmountCard from '../../ui/QPAmountCard'
import QPFlipButton, { FLIP_BUTTON_SIZE } from '../../ui/particles/QPFlipButton'
import QPCoinPicker from '../../ui/QPCoinPicker'
import useCoins from '../../hooks/useCoins'
import WalletPickerSheet from '../../ui/WalletPickerSheet'
import DepositDetailsModal from './DepositDetailsModal'
import DepositReceiveCard from './DepositReceiveCard'

// «Vía P2P»: saldo ETECSA y tarjetas cubanas no se depositan, se venden en el P2P
import DepositViaP2PBlock from './DepositViaP2PBlock'
import { isViaP2PCoin, viaP2PCoinsFrom } from './depositViaP2P'

// Depósito con tarjeta (Stripe PaymentSheet)
import CardFeeModeSelector from './CardFeeModeSelector'
import { cardFeeRateFor } from '../../helpers/cardFeeMode'
import { sanitizeAmountInput } from '../../helpers/amountInput'

// Rieles gateados (tarjeta/PayPal): los decide el servidor, con el cupo del nivel ssn
import useDepositEligibilityQuery from '../../hooks/useDepositEligibilityQuery'
import { USER_CIP_QUERY } from '../../hooks/useOfacQueries'
import { useQuery } from '@tanstack/react-query'
import { filterGatedCoins, formatCapAmount, formatCapDate, railFor, ssnCapFor, ssnCtaVisible } from './depositEligibility'
import SsnTierCta from './SsnTierCta'
import QPPressable from '../../ui/particles/QPPressable'
import { ROUTES } from '../../routes'

// Orden de depósito: creación, modal, cuenta atrás y seguimiento en vivo
import useDepositOrder from './useDepositOrder'
import OfacAttestationModal from '../../ui/OfacAttestationModal'

// Wallet self-custody: pagar el depósito desde la propia wallet (Fase 5 del plan crypto)
import useWalletDepositBridge from './useWalletDepositBridge'

// Icons
import FontAwesome6 from '@react-native-vector-icons/fontawesome6'

// Tipos
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import type { RootStackParamList } from '../../types/navigation'
import type { Coin } from '../../types/domain'
import type { CardFeeMode } from '../../helpers/cardFeeMode'

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
const Add = ({ navigation, route }: AddProps) => {

	// User Context
	const { user } = useAuth()
	const { t } = useTranslation()

	// Theme variables, dark and light modes
	const { theme } = useTheme()
	const { coins: coinCatalog, isLoading: loadingCoins } = useCoins('in')
	// Las monedas «Vía P2P» tienen `enabled_in = 0` y no vienen en el catálogo depositable:
	// salen del catálogo completo (caché compartida) y se añaden al final del selector
	const { coins: allCoins } = useCoins('all')
	const viaP2PCoins = useMemo(() => viaP2PCoinsFrom(allCoins, coinCatalog), [allCoins, coinCatalog])
	const containerStyles = createContainerStyles(theme)
	const textStyles = createTextStyles(theme)
	// Coin/amount form (same-named setters keep every call site unchanged)
	const [form, dispatchForm] = useReducer(setFieldReducer<FormState>, { availableCoins: [], selectedCoin: null, amount: '' })
	const { availableCoins, selectedCoin, amount } = form
	const setAvailableCoins = (value: Coin[] | null | undefined) => dispatchForm({ type: 'set', field: 'availableCoins', value })
	const setSelectedCoin = (value: Coin | null) => dispatchForm({ type: 'set', field: 'selectedCoin', value })
	const setAmount = (value: string) => dispatchForm({ type: 'set', field: 'amount', value })

	const [showCoinPicker, setShowCoinPicker] = useState(false)

	// Moneda e importe prellenados por quien navegó hasta aquí (la pantalla de
	// intercambio cuando el destino es el saldo; `coin` es el mismo dato con el nombre
	// del deep link `qvapay://add?coin=`). Una sola vez cada uno: después manda lo que
	// el usuario elija.
	const preselectedCoin = route.params?.preselectedCoin ?? route.params?.coin
	const prefillAmount = route.params?.amount
	const preselected = useRef(false)
	useEffect(() => {
		if (preselected.current || !preselectedCoin || !availableCoins.length) { return }
		const match = availableCoins.find(coin => coin.tick === preselectedCoin)
		if (match) { preselected.current = true; setSelectedCoin(match) }
	}, [preselectedCoin, availableCoins])

	// El importe entra tras la moneda: la conversión que enseña la fila la necesita puesta
	const prefilled = useRef(false)
	useEffect(() => {
		if (prefilled.current || !prefillAmount || !selectedCoin) { return }
		const value = Number(prefillAmount)
		if (!Number.isFinite(value) || value <= 0) { return }
		prefilled.current = true
		setAmount(String(value))
	}, [prefillAmount, selectedCoin])

	// Tarjeta y PayPal solo si el servidor los acepta para ESTA cuenta desde ESTA app
	// (`GET /user/deposit-eligibility`: nivel full sin tope o nivel ssn con cupo). El
	// catálogo de monedas los lista para todos y no sirve para decidir
	const { data: eligibility, isError: eligibilityFailed, refetch: refetchEligibility } = useDepositEligibilityQuery()
	const cardEligible = eligibility?.card.eligible === true
	// La ficha CIP (ya precargada por la atestación OFAC) decide si se ofrece verificar el SSN
	const { data: cip } = useQuery(USER_CIP_QUERY)

	// Usuarios elegibles ven la tarjeta como primera pill de acceso rápido
	// (la etiqueta se resuelve en render para seguir el idioma activo)
	const defaultDepositCoins = useMemo(
		() => (cardEligible ? [{ tick: 'CARD', label: t('add.index.cardPillLabel') }, ...DEFAULT_DEPOSIT_COINS] : DEFAULT_DEPOSIT_COINS),
		[cardEligible, t],
	)

	// Modo de fee del depósito CARD: 'on_top' (default, el fee se suma al cobro) o
	// 'included' (paga exacto lo tecleado y se acredita el neto). Solo viaja en el
	// POST cuando el método es CARD; el selector se pinta si además el fee es > 0.
	const [feeMode, setFeeMode] = useState<CardFeeMode>('on_top')

	const isCardCoin = selectedCoin?.tick === 'CARD'
	const cardFeeRate = isCardCoin ? cardFeeRateFor(selectedCoin, user) : 0

	// Cupo del nivel ssn ($500 combinados por 30 días) para la moneda elegida: se enseña
	// bajo la moneda y, agotado, apaga el botón. El selector apaga la fila con el motivo
	const ssnCap = useMemo(() => ssnCapFor(eligibility, selectedCoin?.tick), [eligibility, selectedCoin?.tick])
	const capExhausted = !!ssnCap && ssnCap.remaining <= 0
	const exhaustedCopy = useCallback((resetsAt: string | null) => {
		const date = formatCapDate(resetsAt)
		return date ? t('add.index.ssnTier.exhausted', { date }) : t('add.index.ssnTier.exhaustedNoDate')
	}, [t])
	const disabledReasonFor = useCallback((coin: Coin) => {
		const cap = ssnCapFor(eligibility, coin.tick)
		return cap && cap.remaining <= 0 ? exhaustedCopy(cap.resetsAt) : null
	}, [eligibility, exhaustedCopy])
	const showSsnCta = ssnCtaVisible(eligibility, cip)
	const goVerifySsn = useCallback(() => {
		navigation.navigate(ROUTES.SETTINGS_STACK, { screen: ROUTES.USERDATA, initial: false })
	}, [navigation])
	// Moneda que se vende en el P2P en vez de depositarse: importe apagado, botón apagado
	// y el bloque de ofertas debajo
	const isViaP2P = isViaP2PCoin(selectedCoin)
	const viaP2PBadges = useMemo(() => {
		if (!viaP2PCoins.length) return undefined
		const label = t('ui.coinPicker.viaP2P')
		return Object.fromEntries(viaP2PCoins.map(coin => [coin.tick, label]))
	}, [viaP2PCoins, t])

	// Orden de depósito: creación, modal en vivo, cuenta atrás y hoja de tarjeta
	const {
		showDepositModal, setShowDepositModal, topupData, depositStatus, countdown, sseConnected,
		installedWallets, showWalletPicker, setShowWalletPicker,
		handleTopup, launchCardSheet, ofacModalProps,
		isLoading, error, setError,
	} = useDepositOrder({ selectedCoin, amount, isCardCoin, feeMode, isViaP2P, ssnCap, cardFeeRate })

	// Puente con la wallet self-custody: "pagar desde mi wallet" en el modal del depósito
	const closeDepositModal = useCallback(() => setShowDepositModal(false), [setShowDepositModal])
	const payFromWallet = useWalletDepositBridge({ navigation, selectedCoin, topupData, onBeforeNavigate: closeDepositModal })

	// Catálogo desde la caché compartida (useCoins): la lista aparece al
	// instante en vez de esperar un viaje a la red en cada entrada
	useEffect(() => {
		if (coinCatalog.length) {
			// Tarjeta y PayPal salen del catálogo si el servidor no los acepta (o aún no
			// respondió): pedir un depósito que va a rechazar con un 400 genérico es peor
			const depositable = filterGatedCoins(coinCatalog, eligibility)
			// Sin monedas «Vía P2P» se conserva la identidad del catálogo (nada que fusionar)
			setAvailableCoins(viaP2PCoins.length ? [...depositable, ...viaP2PCoins] : depositable)
			setError(null)
		} else if (!loadingCoins) {
			// Sin catálogo y sin carga en curso: la red falló y no había copia
			setError(t('add.index.errors.loadCoins'))
		}
	}, [coinCatalog, viaP2PCoins, loadingCoins, eligibility, t, setError])

	// Si la elegibilidad llega DESPUÉS de elegir tarjeta/PayPal y los niega, se suelta la moneda
	useEffect(() => {
		const rail = railFor(selectedCoin?.tick)
		if (rail && eligibility && !eligibility[rail]?.eligible) { setSelectedCoin(null) }
	}, [eligibility, selectedCoin?.tick])

	// Handle coin selection
	const handleCoinSelect = (coin: Coin) => {
		setSelectedCoin(coin)
		setFeeMode('on_top')
		// Una moneda «Vía P2P» no tiene importe que depositar: lo tecleado para otra moneda
		// se enseñaría convertido bajo un campo apagado
		if (isViaP2PCoin(coin)) setAmount('')
		setShowCoinPicker(false)
	}

	return (
		<>
			<QPKeyboardView
				actions={
					<QPButton
						title={t('add.index.generateButton')}
						onPress={handleTopup}
						disabled={!selectedCoin || !amount || capExhausted}
						loading={isLoading}
						icon="plus"
						iconStyle="solid"
						iconColor={theme.colors.almostWhite}
						textStyle={{ color: theme.colors.almostWhite }}
					/>
				}

			>

				{/* Las dos tarjetas: las MISMAS del swap, el retiro y el P2P. Un depósito es una
				    conversión más — entregas dólares y recibes moneda. */}
				<View style={styles.cards}>
					{/* Con una moneda «Vía P2P» el importe se apaga: no hay nada que depositar */}
					<View style={isViaP2P && styles.dimmed} pointerEvents={isViaP2P ? 'none' : 'auto'}>
						<QPAmountCard
							label={t('add.index.amountPlaceholder')}
							token={{
								symbol: 'USD',
								icon: { kind: 'balance' },
							}}
							amount={amount}
							onChangeAmount={(text: string) => setAmount(sanitizeAmountInput(text))}
							fiatLabel=""
							balanceLabel={`$${user!.balance ?? 0}`}
							accessibilityLabel={t('add.index.amountPlaceholder')}
							disabled={isViaP2P}
						/>
					</View>

					{/* En flujo con márgenes negativos: monta sobre la junta sin medir las tarjetas */}
					<View style={styles.flipWrap} pointerEvents="box-none">
						<QPFlipButton accessibilityLabel={t('add.index.selectCoinLabel')} />
					</View>

					<DepositReceiveCard
						selectedCoin={selectedCoin}
						amount={amount}
						loadingCoins={loadingCoins}
						onPickCoin={() => setShowCoinPicker(true)}
					/>
				</View>

				{/* Nivel ssn: lo que queda del cupo de 30 días bajo la moneda; agotado, cuándo vuelve */}
				{ssnCap && (
					<View style={styles.capNote} testID="ssn-cap-note">
						<FontAwesome6 name={capExhausted ? 'hourglass-half' : 'circle-info'} size={12} color={capExhausted ? theme.colors.warning : theme.colors.secondaryText} iconStyle="solid" />
						<Text style={[textStyles.caption, { color: capExhausted ? theme.colors.warning : theme.colors.secondaryText, flex: 1 }]}>
							{capExhausted
								? exhaustedCopy(ssnCap.resetsAt)
								: t('add.index.ssnTier.remaining', { remaining: formatCapAmount(ssnCap.remaining), cap: formatCapAmount(ssnCap.cap) })}
						</Text>
					</View>
				)}

				{/* Sin tarjeta ni PayPal pero con la verificación del SSN a su alcance */}
				{showSsnCta && <SsnTierCta onPress={goVerifySsn} />}

				{/* No se pudo saber qué rieles acepta el servidor: se dice, con reintento, sin tapar el resto */}
				{eligibilityFailed && !eligibility && (
					<View style={[containerStyles.card, styles.eligibilityError, { backgroundColor: theme.colors.warning + '1A' }]} testID="eligibility-error">
						<Text style={[textStyles.caption, { color: theme.colors.warning, flex: 1 }]}>{t('add.index.errors.eligibility')}</Text>
						<QPPressable onPress={() => refetchEligibility()} accessibilityRole="button">
							<Text style={[textStyles.caption, { color: theme.colors.primary, fontFamily: theme.typography.fontFamily.medium }]}>{t('add.index.errors.retry')}</Text>
						</QPPressable>
					</View>
				)}

				{/* El saldo en esta moneda se vende en el P2P: ofertas abiertas en vez de depósito */}
				{isViaP2P && selectedCoin && (
					<DepositViaP2PBlock coin={selectedCoin} navigation={navigation} />
				)}

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
				onPayFromWallet={payFromWallet}
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
				badges={viaP2PBadges}
				disabledReasonFor={disabledReasonFor}
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

			{/* Certificación OFAC de fondeo (US persons; BANK siempre) */}
			<OfacAttestationModal {...ofacModalProps} />

		</>
	)
}

const styles = StyleSheet.create({
	cards: { marginTop: 4, marginBottom: 16 },
	dimmed: { opacity: 0.4 },
	capNote: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: -8, marginBottom: 12, paddingHorizontal: 4 },
	eligibilityError: { flexDirection: 'row', alignItems: 'center', gap: 12, marginVertical: 10 },
	// Deja 6 px de junta entre las dos tarjetas, igual que en el swap, el retiro y el P2P
	flipWrap: { alignItems: 'center', marginVertical: -(FLIP_BUTTON_SIZE / 2) + 3, zIndex: 2, elevation: 2 },
})

export default Add
