import { useState, useEffect, useMemo, useReducer } from 'react'
import type { ComponentProps } from 'react'
import { StyleSheet, Text, View, Pressable } from 'react-native'
import { useTranslation } from 'react-i18next'

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
import CardFeeModeSelector from './CardFeeModeSelector'
import { isCardDepositEligible, filterCardFromCatalog } from '../../helpers/cardDepositEligibility'
import { cardFeeRateFor } from '../../helpers/cardFeeMode'

// Orden de depósito: creación, modal, cuenta atrás y seguimiento en vivo
import useDepositOrder from './useDepositOrder'

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
// `navigation` se desestructura pero la pantalla no navega a ningún sitio (todo
// ocurre en modales): se conserva la desestructuración y se marca con `_` según
// la convención del eslint del proyecto
const Add = ({ navigation: _navigation }: AddProps) => {

	// User Context
	const { user } = useAuth()
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

	const [showCoinPicker, setShowCoinPicker] = useState(false)

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

	// Modo de fee del depósito CARD: 'on_top' (default, el fee se suma al cobro) o
	// 'included' (paga exacto lo tecleado y se acredita el neto). Solo viaja en el
	// POST cuando el método es CARD; el selector se pinta si además el fee es > 0.
	const [feeMode, setFeeMode] = useState<CardFeeMode>('on_top')
	const isCardCoin = selectedCoin?.tick === 'CARD'
	const cardFeeRate = isCardCoin ? cardFeeRateFor(selectedCoin, user) : 0

	// Orden de depósito: creación, modal en vivo, cuenta atrás y hoja de tarjeta
	const {
		showDepositModal, setShowDepositModal, topupData, depositStatus, countdown, sseConnected,
		installedWallets, showWalletPicker, setShowWalletPicker,
		handleTopup, launchCardSheet,
		isLoading, error, setError,
	} = useDepositOrder({ selectedCoin, amount, isCardCoin, feeMode })

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
	}, [coinCatalog, loadingCoins, cardEligible, t, setError])

	// Handle coin selection
	const handleCoinSelect = (coin: Coin) => {
		setSelectedCoin(coin)
		setFeeMode('on_top')
		setShowCoinPicker(false)
	}

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
