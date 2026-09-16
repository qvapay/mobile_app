import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native'
import type { TextInput } from 'react-native'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import FontAwesome6 from '@react-native-vector-icons/fontawesome6'

// Theme
import { useTheme } from '../../../theme/ThemeContext'
import type { Theme } from '../../../theme/ThemeContext'
import { useContainerStyles, useTextStyles } from '../../../theme/themeUtils'

// Auth / settings / wallet
import { useAuth } from '../../../auth/AuthContext'
import { useSettings } from '../../../settings/SettingsContext'
import { useWallet } from '../../../wallet/WalletContext'
import { addressForKind, isHouseToken } from '../../../wallet/assets'
import { parseUnits } from '../../../wallet/chains/units'
import { useWalletAssets } from './walletQueries'
import { formatUsd, shortAddress } from './walletFormat'
import { buildSwapForm, percentAmount, sanitizeAmountInput, SWAP_IN_NETWORKS, WALLET_FAMILY_BY_NETWORK } from './swapModel'
import type { SwapDirection } from './swapModel'
import useSwapOut from './useSwapOut'
import useSwapIn from './useSwapIn'

// API
import { swapApi } from '../../../api/swapApi'
import { ApiError } from '../../../api/unwrap'

// UI
import QPButton from '../../../ui/particles/QPButton'
import PinConfirmStep from '../../transaction/PinConfirmStep'
import WalletAuthModal from './components/WalletAuthModal'
import SwapAmountCard from './components/swap/SwapAmountCard'
import SwapAssetSheet from './components/swap/SwapAssetSheet'
import SwapDetails from './components/swap/SwapDetails'
import type { SwapDetailRow } from './components/swap/SwapDetails'
import SwapFlipButton, { FLIP_BUTTON_SIZE } from './components/swap/SwapFlipButton'
import SwapReviewSheet from './components/swap/SwapReviewSheet'
import type { SwapTokenIcon } from './components/swap/SwapTokenBadge'

// Navigation
import { ROUTES } from '../../../routes'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import type { RootStackParamList } from '../../../types/navigation'
import type { Swap, SwapPair } from '../../../types/domain'

type Props = NativeStackScreenProps<RootStackParamList, 'WalletSwap'>

export const SWAP_PAIRS_KEY = ['swap', 'pairs']
/** Espera entre cerrar la hoja de revisión y abrir el gate de la wallet (dos Modal a la vez fallan en iOS). */
const SHEET_HANDOFF_MS = 350
const PERCENT_CHIPS = [25, 50, 100] as const

/**
 * Swap saldo QvaPay ↔ activo de la wallet (hoy QUSD en Stacks), con el patrón de la
 * industria (Uniswap / Jupiter / Binance Convert): tarjetas Pagas/Recibes con píldora de
 * activo, botón de invertir entre ellas, chips de porcentaje, detalles plegables, botón
 * cuyo texto explica qué falta y hoja de revisión antes de firmar.
 *
 * La lógica vive en `swapModel.ts` (pura) y los pares en `GET /swap/pairs`: la tesorería,
 * el asset y la red salen del backend, nunca del registry local, así que una cadena nueva
 * entra por datos. Saldo → wallet confirma con el PIN/OTP de cuenta (`useSwapOut`); wallet →
 * saldo firma una tx patrocinada tras el gate de la wallet (`useSwapIn`, solo en las redes
 * de `SWAP_IN_NETWORKS`).
 */
const WalletSwap = ({ navigation, route }: Props) => {

	const { t } = useTranslation()
	const { theme } = useTheme()
	const textStyles = useTextStyles(theme)
	const containerStyles = useContainerStyles(theme)
	const { user } = useAuth()
	const { getSetting } = useSettings()
	const showBalance = getSetting('privacy', 'showBalance', true) as boolean
	const { addresses } = useWallet()
	const { all } = useWalletAssets()
	const amountRef = useRef<TextInput>(null)

	const [direction, setDirection] = useState<SwapDirection>(route.params?.direction ?? 'out')
	const [amountText, setAmountText] = useState('')
	const [pairId, setPairId] = useState<string | null>(null)
	const [assetSheet, setAssetSheet] = useState(false)
	const [review, setReview] = useState(false)

	const pairs = useQuery({
		queryKey: SWAP_PAIRS_KEY,
		queryFn: async () => { const r = await swapApi.getPairs(); if (!r.success) throw new ApiError(r.error ?? 'swap', r.status); if (!r.data) throw new ApiError('swap'); return r.data },
		staleTime: 30_000,
		meta: { noPersist: true },
	})
	const enabledPairs = useMemo(() => (pairs.data?.data ?? []).filter(p => p.enabled), [pairs.data])
	const pair: SwapPair | null = useMemo(() => {
		const list = pairs.data?.data ?? []
		return list.find(p => p.id === pairId) ?? list.find(p => p.enabled) ?? list[0] ?? null
	}, [pairs.data, pairId])
	const assetFor = useCallback((p: SwapPair | null) => (p ? all.find(a => a.contract === p.asset) : undefined) ?? all.find(isHouseToken), [all])
	const asset = assetFor(pair)

	// Dirección registrada en el backend para la familia de la red del par vs la local
	const family = pair ? WALLET_FAMILY_BY_NETWORK[pair.network] : undefined
	const registered = family ? (pairs.data?.wallet as Record<string, string | null> | undefined)?.[family] ?? null : null
	const localAddress = asset && addresses ? addressForKind(addresses, asset.kind) : null
	const walletReady = !!registered && registered === localAddress
	const limitAvailable = pairs.data?.limits.available ?? null

	const custodial = Number(user?.balance || 0)
	const onChain = asset ? Number(asset.amount) : 0
	const symbol = pair?.asset_name ?? asset?.symbol ?? 'QUSD'
	const chainName = asset?.chainName ?? pair?.network ?? ''

	const form = buildSwapForm({
		direction, amountText, pair, walletReady, limitAvailable,
		payBalance: direction === 'out' ? custodial : onChain,
		loading: pairs.isLoading,
	})
	const inUnsupported = direction === 'in' && !!pair && !SWAP_IN_NETWORKS.has(pair.network)
	const amountUnits = form.canReview && form.amount && asset ? parseUnits(form.amount, asset.decimals) : null

	const onCreated = useCallback((swap: Swap) => {
		setReview(false)
		navigation.replace(ROUTES.WALLET_SWAP_STATUS, { uuid: swap.uuid })
	}, [navigation])

	const out = useSwapOut({ pairId: pair?.id ?? null, amount: form.amount ?? '', toAddress: registered, onCreated })
	const inn = useSwapIn({ pair, asset, amountUnits, amount: form.amount ?? '', onCreated })

	// Cambiar sentido, importe o par invalida la tx preparada y el paso de PIN
	useEffect(() => { inn.reset(); out.setShowPinStep(false); out.setPin('') }, [direction, form.amount, pair?.id]) // eslint-disable-line react-hooks/exhaustive-deps

	// Con un único par el selector no abre nada; con varios sí
	const pickAsset = enabledPairs.length > 1 ? () => setAssetSheet(true) : undefined

	const balanceIcon: SwapTokenIcon = { kind: 'balance' }
	const walletIcon: SwapTokenIcon = { kind: 'wallet', logoTick: asset?.logoTick ?? symbol, networkTick: asset?.networkTick ?? null }
	const hidden = '••••'
	const balanceSide = { symbol: 'USD', caption: t('crypto.wallet.swap.balanceQvaPay'), icon: balanceIcon, balance: showBalance ? formatUsd(custodial) : hidden }
	const walletSide = { symbol, caption: t('crypto.wallet.swap.walletOn', { network: chainName }), icon: walletIcon, balance: showBalance ? `${asset?.amountLabel ?? '0'} ${symbol}` : hidden, onPress: pickAsset }
	const pay = direction === 'out' ? balanceSide : walletSide
	const receive = direction === 'out' ? walletSide : balanceSide

	const busy = out.submitting || inn.phase === 'preparing' || inn.phase === 'signing' || inn.phase === 'submitting'
	const chips = form.max > 0 ? PERCENT_CHIPS.map(p => ({ key: String(p), label: p === 100 ? t('crypto.wallet.swap.max') : `${p}%`, onPress: () => setAmountText(percentAmount(form.max, p)) })) : undefined

	const flip = () => { setDirection(d => (d === 'out' ? 'in' : 'out')) }

	const rate = direction === 'out' ? `1 USD = ${pair?.rate ?? 1} ${symbol}` : `1 ${symbol} = ${pair?.rate ?? 1} USD`
	const feeFree = !pair || pair.fee_bps === 0
	const rows: SwapDetailRow[] = [
		{ key: 'fee', label: t('crypto.wallet.swap.details.fee'), value: feeFree ? t('crypto.wallet.swap.details.free') : formatUsd(form.fee), highlight: feeFree },
		{ key: 'network', label: t('crypto.wallet.swap.details.networkFee'), value: t('crypto.wallet.swap.details.networkFeePaid'), highlight: true },
		{ key: 'destination', label: t('crypto.wallet.swap.details.destination'), value: direction === 'out' ? t('crypto.wallet.swap.details.toWallet', { address: shortAddress(registered, 4, 4) }) : t('crypto.wallet.swap.balanceQvaPay') },
		{ key: 'chain', label: t('crypto.wallet.swap.details.network'), value: chainName },
		{ key: 'eta', label: t('crypto.wallet.swap.details.eta'), value: direction === 'out' ? t('crypto.wallet.swap.details.etaOut') : t('crypto.wallet.swap.details.etaIn') },
		{ key: 'limit', label: t('crypto.wallet.swap.details.limit'), value: limitAvailable === null ? t('crypto.wallet.swap.details.noLimit') : formatUsd(limitAvailable) },
	]

	const retrying = direction === 'in' && inn.phase === 'error'
	const ctaLabel = retrying ? t('crypto.wallet.swap.cta.retry') : inUnsupported ? t('crypto.wallet.swap.cta.unavailable') : t(`crypto.wallet.swap.cta.${form.cta}`, form.ctaParams)
	const ctaEnabled = retrying || (form.canReview && !inUnsupported && !busy)

	const onCta = () => {
		if (retrying) { inn.retry(); return }
		if (!form.canReview || inUnsupported) return
		setReview(true)
	}

	const closeReview = () => { if (busy) return; setReview(false); out.setShowPinStep(false); out.setPin('') }

	const onConfirm = () => {
		if (direction === 'out') {
			if (!out.showPinStep) { out.setShowPinStep(true); return }
			out.submit()
			return
		}
		// La firma pide su propio Modal (Face ID / PIN de la wallet): primero se cierra la hoja
		setReview(false)
		setTimeout(() => { inn.start() }, SHEET_HANDOFF_MS)
	}

	const receiveAmount = form.receive !== null ? form.receive.toFixed(2) : ''
	const fiat = (value: number | null) => `≈ ${formatUsd(value ?? 0)}`

	return (
		<KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={containerStyles.subContainer}>
			<ScrollView style={styles.scroll} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>

				<View>
					<SwapAmountCard
						ref={amountRef}
						label={t('crypto.wallet.swap.pay')}
						token={{ symbol: pay.symbol, caption: pay.caption, icon: pay.icon, onPress: 'onPress' in pay ? pay.onPress : undefined }}
						amount={amountText}
						onChangeAmount={(text) => setAmountText(sanitizeAmountInput(text))}
						placeholder="0.00"
						fiatLabel={fiat(form.value)}
						balanceLabel={pay.balance}
						chips={chips}
						disabled={busy}
						accessibilityLabel={t('crypto.wallet.swap.pay')}
					/>
					{/* En flujo con márgenes negativos: monta sobre la junta de las dos tarjetas sin medirlas */}
					<View style={styles.flipWrap} pointerEvents="box-none">
						<SwapFlipButton onPress={flip} disabled={busy} accessibilityLabel={t('crypto.wallet.swap.flip')} />
					</View>
					<SwapAmountCard
						label={t('crypto.wallet.swap.receive')}
						hint={direction === 'out' ? t('crypto.wallet.swap.toYourWallet') : t('crypto.wallet.swap.toYourBalance')}
						token={{ symbol: receive.symbol, caption: receive.caption, icon: receive.icon, onPress: 'onPress' in receive ? receive.onPress : undefined }}
						amount={receiveAmount}
						placeholder="0.00"
						fiatLabel={fiat(form.receive)}
						balanceLabel={receive.balance}
					/>
				</View>

				<SwapDetails rate={rate} badge={feeFree ? t('crypto.wallet.swap.noFee') : undefined} rows={rows} />

				{direction === 'in' && !!pair && !inUnsupported && (
					<Notice theme={theme} icon="gas-pump" color={theme.colors.primary} text={t('crypto.wallet.swap.sponsoredNote')} />
				)}
				{pairs.isSuccess && form.cta === 'unavailable' && <Notice theme={theme} icon="triangle-exclamation" color={theme.colors.warning} text={t('crypto.wallet.swap.disabled')} />}
				{inUnsupported && <Notice theme={theme} icon="triangle-exclamation" color={theme.colors.warning} text={t('crypto.wallet.swap.inUnsupported', { network: chainName })} />}
				{pairs.isSuccess && form.cta === 'walletNotRegistered' && <Notice theme={theme} icon="wallet" color={theme.colors.warning} text={t('crypto.wallet.swap.notRegistered')} />}
				{pairs.isError && !pairs.data && <Notice theme={theme} icon="triangle-exclamation" color={theme.colors.danger} text={t('crypto.wallet.swap.loadError')} />}
				{retrying && !!inn.error && <Notice theme={theme} icon="triangle-exclamation" color={theme.colors.danger} text={inn.error} />}

			</ScrollView>

			{/* Fuera del scroll: siempre abajo y sube con el teclado */}
			<View style={styles.footer}>
				<QPButton title={ctaLabel} onPress={onCta} disabled={!ctaEnabled} loading={busy || pairs.isLoading} />
			</View>

			<SwapAssetSheet
				visible={assetSheet}
				selectedPairId={pair?.id ?? null}
				onSelect={setPairId}
				onClose={() => setAssetSheet(false)}
				options={enabledPairs.map(p => {
					const a = assetFor(p)
					return { pairId: p.id, symbol: p.asset_name, network: a?.chainName ?? p.network, logoTick: a?.logoTick ?? p.asset_name, networkTick: a?.networkTick ?? null, balanceLabel: showBalance ? (a?.amountLabel ?? '0') : hidden }
				})}
			/>

			<SwapReviewSheet
				visible={review}
				title={t('crypto.wallet.swap.reviewTitle')}
				from={{ amount: form.amount ?? '0.00', symbol: pay.symbol, caption: pay.caption, icon: pay.icon }}
				to={{ amount: receiveAmount || '0.00', symbol: receive.symbol, caption: receive.caption, icon: receive.icon }}
				rate={rate}
				badge={feeFree ? t('crypto.wallet.swap.noFee') : undefined}
				rows={rows}
				notice={direction === 'out' ? t('crypto.wallet.swap.reviewNoticeOut') : t('crypto.wallet.swap.reviewNoticeIn')}
				confirmLabel={direction === 'out' ? t('crypto.wallet.swap.confirmOut') : t('crypto.wallet.swap.confirmIn')}
				onConfirm={onConfirm}
				confirmDisabled={direction === 'out' && out.showPinStep && out.pin.length !== out.codeLength}
				busy={busy}
				onClose={closeReview}
			>
				{direction === 'out' && out.showPinStep && (
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

			{!!asset && (
				<WalletAuthModal
					visible={inn.authVisible}
					subtitle={t('crypto.wallet.swap.authSubtitle', { amount: form.amount ?? '', symbol })}
					onClose={inn.closeAuth}
					onAuthorized={inn.onAuthorized}
				/>
			)}
		</KeyboardAvoidingView>
	)
}

type NoticeIcon = 'gas-pump' | 'triangle-exclamation' | 'wallet'
const Notice = ({ theme, icon, color, text }: { theme: Theme, icon: NoticeIcon, color: string, text: string }) => (
	<View style={[styles.notice, { backgroundColor: color + '12' }]}>
		<FontAwesome6 name={icon} size={13} color={color} iconStyle="solid" style={styles.noticeIcon} />
		<Text style={[styles.noticeText, { color: theme.colors.primaryText, fontFamily: theme.typography.fontFamily.regular, fontSize: theme.typography.fontSize.sm }]}>{text}</Text>
	</View>
)

const styles = StyleSheet.create({
	scroll: { flex: 1 },
	content: { paddingTop: 8, paddingBottom: 16, gap: 10 },
	footer: { paddingTop: 8, paddingBottom: 24 },
	// Botón de invertir a caballo entre las dos tarjetas (deja 6 px de junta entre ellas)
	flipWrap: { alignItems: 'center', marginVertical: -(FLIP_BUTTON_SIZE / 2) + 3, zIndex: 2, elevation: 2 },
	notice: { flexDirection: 'row', gap: 10, padding: 12, borderRadius: 12, alignItems: 'flex-start' },
	noticeIcon: { marginTop: 2 },
	noticeText: { flex: 1 },
})

export default WalletSwap
