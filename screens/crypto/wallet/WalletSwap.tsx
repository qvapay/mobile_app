import { useCallback, useRef, useState } from 'react'
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native'
import type { TextInput } from 'react-native'
import { useTranslation } from 'react-i18next'

// Theme
import { useTheme } from '../../../theme/ThemeContext'
import { useContainerStyles, useTextStyles } from '../../../theme/themeUtils'

// Auth / settings / wallet
import { useAuth } from '../../../auth/AuthContext'
import { useSettings } from '../../../settings/SettingsContext'
import { buildSwapForm, isInUnsupported, percentAmount, sanitizeAmountInput } from './swapModel'
import type { SwapDirection } from './swapModel'
import { buildSwapView } from './swapView'
import useSwapPairs from './useSwapPairs'
import useSwapFlow from './useSwapFlow'

// UI
import QPButton from '../../../ui/particles/QPButton'
import PinConfirmStep from '../../transaction/PinConfirmStep'
import WalletAuthModal from './components/WalletAuthModal'
import SwapAmountCard from './components/swap/SwapAmountCard'
import SwapAssetSheet from './components/swap/SwapAssetSheet'
import SwapDetails from './components/swap/SwapDetails'
import SwapFlipButton, { FLIP_BUTTON_SIZE } from './components/swap/SwapFlipButton'
import SwapNotices from './components/swap/SwapNotices'
import SwapReviewSheet from './components/swap/SwapReviewSheet'

// Navigation
import { ROUTES } from '../../../routes'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import type { RootStackParamList } from '../../../types/navigation'
import type { Swap } from '../../../types/domain'

type Props = NativeStackScreenProps<RootStackParamList, 'WalletSwap'>

export { SWAP_PAIRS_KEY } from './useSwapPairs'
const PERCENT_CHIPS = [25, 50, 100] as const

/**
 * Swap saldo QvaPay ↔ activo de la wallet (hoy QUSD en Stacks), con el patrón de la
 * industria (Uniswap / Jupiter / Binance Convert): tarjetas Pagas/Recibes con píldora de
 * activo, botón de invertir entre ellas, chips de porcentaje, detalles plegables, botón
 * cuyo texto explica qué falta y hoja de revisión antes de firmar.
 *
 * La pantalla es cableado: las reglas viven en `swapModel.ts` (qué se puede hacer), el
 * texto en `swapView.ts` (cómo se ve) y el catálogo en `useSwapPairs`. Los pares salen de
 * `GET /swap/pairs`: la tesorería, el asset y la red vienen del backend, nunca del registry
 * local, así que una cadena nueva entra por datos. Saldo → wallet confirma con el PIN/OTP
 * de cuenta (`useSwapOut`); wallet → saldo firma una tx patrocinada tras el gate de la
 * wallet (`useSwapIn`, solo en las redes de `SWAP_IN_NETWORKS`).
 */
const WalletSwap = ({ navigation, route }: Props) => {

	const { t } = useTranslation()
	const { theme } = useTheme()
	const textStyles = useTextStyles(theme)
	const containerStyles = useContainerStyles(theme)
	const { user } = useAuth()
	const { getSetting } = useSettings()
	const showBalance = getSetting('privacy', 'showBalance', true) as boolean
	const amountRef = useRef<TextInput>(null)

	const [direction, setDirection] = useState<SwapDirection>(route.params?.direction ?? 'out')
	const [amountText, setAmountText] = useState('')
	const [assetSheet, setAssetSheet] = useState(false)

	const { query: pairs, enabledPairs, pair, asset, assetFor, setPairId, registered, walletReady, limitAvailable } = useSwapPairs()

	const custodial = Number(user?.balance || 0)
	const form = buildSwapForm({
		direction, amountText, pair, walletReady, limitAvailable,
		payBalance: direction === 'out' ? custodial : Number(asset?.amount ?? 0),
		loading: pairs.isLoading,
	})

	const onCreated = useCallback((swap: Swap) => {
		navigation.replace(ROUTES.WALLET_SWAP_STATUS, { uuid: swap.uuid })
	}, [navigation])

	const inUnsupported = isInUnsupported(direction, pair)
	const flow = useSwapFlow({ direction, form, pair, asset, registered, inUnsupported, onCreated })
	const { out } = flow

	const view = buildSwapView({
		t, direction, form, pair, asset, registered, limitAvailable, custodial, showBalance,
		busy: flow.busy,
		// Con un único par el selector no abre nada; con varios sí
		pickAsset: enabledPairs.length > 1 ? () => setAssetSheet(true) : undefined,
		retrying: flow.retrying,
		inError: flow.inError,
		pairsLoaded: pairs.isSuccess,
		pairsFailed: pairs.isError && !pairs.data,
	})

	const chips = form.max > 0 ? PERCENT_CHIPS.map(p => ({ key: String(p), label: p === 100 ? t('crypto.wallet.swap.max') : `${p}%`, onPress: () => setAmountText(percentAmount(form.max, p)) })) : undefined

	return (
		<KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={containerStyles.subContainer}>
			<ScrollView style={styles.scroll} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>

				<View>
					<SwapAmountCard
						ref={amountRef}
						label={t('crypto.wallet.swap.pay')}
						token={view.pay}
						amount={amountText}
						onChangeAmount={(text) => setAmountText(sanitizeAmountInput(text))}
						placeholder="0.00"
						fiatLabel={view.payFiat}
						balanceLabel={view.pay.balance}
						chips={chips}
						disabled={flow.busy}
						accessibilityLabel={t('crypto.wallet.swap.pay')}
					/>
					{/* En flujo con márgenes negativos: monta sobre la junta de las dos tarjetas sin medirlas */}
					<View style={styles.flipWrap} pointerEvents="box-none">
						<SwapFlipButton onPress={() => setDirection(d => (d === 'out' ? 'in' : 'out'))} disabled={flow.busy} accessibilityLabel={t('crypto.wallet.swap.flip')} />
					</View>
					<SwapAmountCard
						label={t('crypto.wallet.swap.receive')}
						hint={view.receiveHint}
						token={view.receive}
						amount={view.receiveAmount}
						placeholder="0.00"
						fiatLabel={view.receiveFiat}
						balanceLabel={view.receive.balance}
					/>
				</View>

				<SwapDetails rate={view.rate} badge={view.badge} rows={view.rows} />

				<SwapNotices notices={view.notices} />

			</ScrollView>

			{/* Fuera del scroll: siempre abajo y sube con el teclado */}
			<View style={styles.footer}>
				<QPButton title={view.ctaLabel} onPress={flow.onCta} disabled={!view.ctaEnabled} loading={flow.busy || pairs.isLoading} />
			</View>

			<SwapAssetSheet
				visible={assetSheet}
				selectedPairId={pair?.id ?? null}
				onSelect={setPairId}
				onClose={() => setAssetSheet(false)}
				options={enabledPairs.map(p => {
					const a = assetFor(p)
					return { pairId: p.id, symbol: p.asset_name, network: a?.chainName ?? p.network, logoTick: a?.logoTick ?? p.asset_name, networkTick: a?.networkTick ?? null, balanceLabel: showBalance ? (a?.amountLabel ?? '0') : '••••' }
				})}
			/>

			<SwapReviewSheet
				visible={flow.review}
				title={t('crypto.wallet.swap.reviewTitle')}
				from={view.reviewFrom}
				to={view.reviewTo}
				rate={view.rate}
				badge={view.badge}
				rows={view.rows}
				notice={view.reviewNotice}
				confirmLabel={view.confirmLabel}
				onConfirm={flow.onConfirm}
				confirmDisabled={flow.confirmDisabled}
				busy={flow.busy}
				onClose={flow.closeReview}
			>
				{flow.showPinStep && (
					<PinConfirmStep
						pin={out.pin}
						onChangePin={out.setPin}
						codeLength={out.codeLength}
						twoFactorMethod={out.twoFactorMethod}
						hasOTP={out.hasOTP}
						sendingPin={out.sendingPin}
						onMethodToggle={out.handleMethodToggle}
						onRequestPin={out.handleRequestPin}
						codeInputRef={out.codeInputRef}
						theme={theme}
						textStyles={textStyles}
						containerStyles={containerStyles}
					/>
				)}
			</SwapReviewSheet>

			<WalletAuthModal
				visible={flow.authVisible}
				subtitle={view.authSubtitle}
				onClose={flow.closeAuth}
				onAuthorized={flow.onAuthorized}
			/>
		</KeyboardAvoidingView>
	)
}

const styles = StyleSheet.create({
	scroll: { flex: 1 },
	content: { paddingTop: 8, paddingBottom: 16, gap: 10 },
	footer: { paddingTop: 8, paddingBottom: 24 },
	// Botón de invertir a caballo entre las dos tarjetas (deja 6 px de junta entre ellas)
	flipWrap: { alignItems: 'center', marginVertical: -(FLIP_BUTTON_SIZE / 2) + 3, zIndex: 2, elevation: 2 },
})

export default WalletSwap
