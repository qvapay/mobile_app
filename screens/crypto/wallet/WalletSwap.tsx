import { useCallback, useEffect, useMemo, useState } from 'react'
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import FontAwesome6 from '@react-native-vector-icons/fontawesome6'

// Theme
import { useTheme } from '../../../theme/ThemeContext'
import type { Theme } from '../../../theme/ThemeContext'
import { useContainerStyles, useTextStyles } from '../../../theme/themeUtils'

// Auth / wallet
import { useAuth } from '../../../auth/AuthContext'
import { useWallet } from '../../../wallet/WalletContext'
import { isHouseToken } from '../../../wallet/assets'
import { parseUnits } from '../../../wallet/chains/units'
import { useWalletAssets } from './walletQueries'
import { formatUsd } from './walletFormat'
import useSwapOut from './useSwapOut'
import useSwapIn from './useSwapIn'

// API
import { swapApi } from '../../../api/swapApi'
import { ApiError } from '../../../api/unwrap'

// UI
import QPButton from '../../../ui/particles/QPButton'
import QPSwitch from '../../../ui/particles/QPSwitch'
import AssetIcon from './components/AssetIcon'
import WalletAuthModal from './components/WalletAuthModal'
import PinConfirmStep from '../../transaction/PinConfirmStep'

// Navigation
import { ROUTES } from '../../../routes'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import type { RootStackParamList } from '../../../types/navigation'
import type { Swap, SwapPair } from '../../../types/domain'

type Props = NativeStackScreenProps<RootStackParamList, 'WalletSwap'>
type Direction = 'out' | 'in'

export const SWAP_PAIRS_KEY = ['swap', 'pairs']
const PAIR_ID = 'QVAPAY:QUSD_STACKS'

/** Dos decimales exactos (centavos) o null. */
const normalizeAmount = (raw: string): string | null => {
	const text = raw.trim().replace(',', '.')
	if (!/^\d+(\.\d{0,2})?$/.test(text)) return null
	const value = Number(text)
	if (!Number.isFinite(value) || value <= 0) return null
	return value.toFixed(2)
}

/**
 * Swap saldo QvaPay ↔ QUSD en la wallet, 1:1 sin comisión. La tesorería y el asset del par
 * vienen de `GET /swap/pairs` (nunca del registry local): el contrato cambia de versión sin
 * tocar la app. OUT pide el PIN de cuenta (mismo paso que un retiro); IN firma una tx
 * patrocinada tras el gate de la wallet y la manda como hex — QvaPay pone la fee.
 */
const WalletSwap = ({ navigation, route }: Props) => {

	const { t } = useTranslation()
	const { theme } = useTheme()
	const textStyles = useTextStyles(theme)
	const containerStyles = useContainerStyles(theme)
	const { user } = useAuth()
	const { addresses } = useWallet()
	const { all } = useWalletAssets()

	const [direction, setDirection] = useState<Direction>(route.params?.direction ?? 'out')
	const [amount, setAmount] = useState('')

	const pairs = useQuery({
		queryKey: SWAP_PAIRS_KEY,
		queryFn: async () => { const r = await swapApi.getPairs(); if (!r.success) throw new ApiError(r.error ?? 'swap', r.status); if (!r.data) throw new ApiError('swap'); return r.data },
		staleTime: 30_000,
		meta: { noPersist: true },
	})
	const pair: SwapPair | null = useMemo(() => pairs.data?.data.find(p => p.id === PAIR_ID) ?? null, [pairs.data])
	const asset = useMemo(() => (pair ? all.find(a => a.contract === pair.asset) : undefined) ?? all.find(isHouseToken), [all, pair])
	const registeredStx = pairs.data?.wallet.stx ?? null
	const walletMatches = !!registeredStx && registeredStx === addresses?.stx
	const limitAvailable = pairs.data?.limits.available ?? null

	const custodial = Number(user?.balance || 0)
	const onChain = asset ? Number(asset.amount) : 0
	const symbol = pair?.asset_name ?? asset?.symbol ?? 'QUSD'

	const normalized = normalizeAmount(amount)
	const value = normalized === null ? null : Number(normalized)
	const sourceBalance = direction === 'out' ? custodial : onChain
	let amountError: string | null = null
	if (amount.trim() && normalized === null) amountError = t('crypto.wallet.swap.errors.amountInvalid')
	else if (value !== null && pair) {
		if (value < pair.min) amountError = t('crypto.wallet.swap.errors.belowMin', { amount: formatUsd(pair.min) })
		else if (value > pair.max) amountError = t('crypto.wallet.swap.errors.aboveMax', { amount: formatUsd(pair.max) })
		else if (value > sourceBalance + 1e-9) amountError = direction === 'out' ? t('crypto.wallet.swap.errors.insufficientBalance') : t('crypto.wallet.swap.errors.insufficientWallet', { symbol })
		else if (limitAvailable !== null && value > limitAvailable + 1e-9) amountError = t('crypto.wallet.swap.errors.overLimit', { amount: formatUsd(limitAvailable) })
	}
	const amountUnits = value !== null && !amountError && asset ? parseUnits(normalized!, asset.decimals) : null

	const setMax = useCallback(() => {
		if (!pair) return
		const candidates = [sourceBalance, pair.max, ...(limitAvailable !== null ? [limitAvailable] : [])]
		setAmount(Math.max(0, Math.floor(Math.min(...candidates) * 100) / 100).toFixed(2))
	}, [pair, sourceBalance, limitAvailable])

	const onCreated = useCallback((swap: Swap) => { navigation.replace(ROUTES.WALLET_SWAP_STATUS, { uuid: swap.uuid }) }, [navigation])

	const out = useSwapOut({ pairId: pair?.id ?? null, amount: normalized ?? '', toAddress: registeredStx, onCreated })
	const inn = useSwapIn({ pair, asset, amountUnits, amount: normalized ?? '', onCreated })

	// Cambiar de sentido o de importe invalida la tx preparada y cierra el paso de PIN
	useEffect(() => { inn.reset(); out.setShowPinStep(false) }, [direction, normalized]) // eslint-disable-line react-hooks/exhaustive-deps

	const ready = !!pair?.enabled && !!asset && walletMatches && amountUnits !== null
	const busy = out.submitting || inn.phase === 'preparing' || inn.phase === 'signing' || inn.phase === 'submitting'

	const onContinue = () => {
		if (!ready) return
		if (direction === 'out') { out.setShowPinStep(true); return }
		if (inn.phase === 'error') inn.retry()
		else inn.start()
	}

	const rows = direction === 'out'
		? [{ label: t('crypto.wallet.swap.fromLabel'), title: t('crypto.wallet.swap.balanceQvaPay'), balance: formatUsd(custodial), kind: 'qvapay' as const }, { label: t('crypto.wallet.swap.toLabel'), title: t('crypto.wallet.swap.walletQusd', { symbol }), balance: `${asset?.amountLabel ?? '0'} ${symbol}`, kind: 'wallet' as const }]
		: [{ label: t('crypto.wallet.swap.fromLabel'), title: t('crypto.wallet.swap.walletQusd', { symbol }), balance: `${asset?.amountLabel ?? '0'} ${symbol}`, kind: 'wallet' as const }, { label: t('crypto.wallet.swap.toLabel'), title: t('crypto.wallet.swap.balanceQvaPay'), balance: formatUsd(custodial), kind: 'qvapay' as const }]

	const ctaTitle = direction === 'in'
		? (inn.phase === 'error' ? t('crypto.wallet.swap.status.retry') : inn.phase === 'signing' ? t('crypto.wallet.send.signing') : inn.phase === 'submitting' ? t('crypto.wallet.send.broadcasting') : t('crypto.wallet.swap.ctaIn'))
		: t('crypto.wallet.swap.cta')

	return (
		<KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={containerStyles.subContainer}>
			<ScrollView style={styles.scroll} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>

				<View style={styles.switchWrap}>
					<QPSwitch
						value={direction === 'out' ? 'left' : 'right'}
						leftText={t('crypto.wallet.swap.directionOut')}
						rightText={t('crypto.wallet.swap.directionIn')}
						leftColor={theme.colors.primary}
						rightColor={theme.colors.primary}
						onChange={(side) => { if (side) setDirection(side === 'left' ? 'out' : 'in') }}
					/>
				</View>

				<View style={[styles.card, { backgroundColor: theme.colors.surface }, !theme.isDark && { borderWidth: StyleSheet.hairlineWidth, borderColor: theme.colors.border }]}>
					{rows.map((row, index) => (
						<View key={row.label} style={[styles.row, index === 0 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.colors.border + '60' }]}>
							{row.kind === 'qvapay'
								? <View style={[styles.qvapayIcon, { backgroundColor: theme.colors.primary + '18' }]}><FontAwesome6 name="building-columns" size={16} color={theme.colors.primary} iconStyle="solid" /></View>
								: <AssetIcon logoTick={asset?.logoTick ?? 'QUSD'} networkTick={asset?.networkTick ?? 'STX'} size={36} />}
							<View style={styles.rowTexts}>
								<Text style={[textStyles.h6, { color: theme.colors.secondaryText }]}>{row.label}</Text>
								<Text style={[textStyles.h4, { color: theme.colors.primaryText }]}>{row.title}</Text>
							</View>
							<Text style={[textStyles.h5, { color: theme.colors.secondaryText }]}>{row.balance}</Text>
						</View>
					))}
				</View>

				<View style={styles.amountHeader}>
					<Text style={[textStyles.h5, { color: theme.colors.secondaryText }]}>{t('crypto.wallet.swap.amountLabel')}</Text>
					<Text style={[textStyles.h6, { color: theme.colors.secondaryText }]}>{t('crypto.wallet.send.available', { amount: direction === 'out' ? formatUsd(custodial) : asset?.amountLabel ?? '0', symbol: direction === 'out' ? '' : symbol }).trim()}</Text>
				</View>
				<View style={[styles.field, { backgroundColor: theme.colors.surface }, !theme.isDark && { borderWidth: StyleSheet.hairlineWidth, borderColor: theme.colors.border }]}>
					<Text style={[textStyles.h4, { color: theme.colors.secondaryText }]}>$</Text>
					<TextInput
						style={[styles.amountInput, { color: theme.colors.primaryText, fontFamily: theme.typography.fontFamily.semiBold, fontSize: theme.typography.fontSize.xxl }]}
						value={amount}
						onChangeText={setAmount}
						placeholder="0.00"
						placeholderTextColor={theme.colors.placeholder}
						keyboardType="decimal-pad"
						editable={!busy}
						accessibilityLabel={t('crypto.wallet.swap.amountLabel')}
					/>
					<Pressable onPress={setMax} hitSlop={8} style={[styles.max, { backgroundColor: theme.colors.primary + '18' }]} accessibilityRole="button" disabled={!pair}>
						<Text style={{ color: theme.colors.primary, fontFamily: theme.typography.fontFamily.semiBold, fontSize: theme.typography.fontSize.xs }}>{t('crypto.wallet.send.max')}</Text>
					</Pressable>
				</View>
				<View style={styles.amountFooter}>
					<Text style={[textStyles.h6, { color: theme.colors.danger }]}>{amountError ?? ' '}</Text>
					<Text style={[textStyles.h6, { color: theme.colors.secondaryText }]}>{value !== null && !amountError ? t('crypto.wallet.swap.receive', { amount: direction === 'out' ? `${normalized} ${symbol}` : formatUsd(value) }) : ' '}</Text>
				</View>

				<View style={styles.notes}>
					<Line theme={theme} icon="equals" text={t('crypto.wallet.swap.rate', { symbol })} />
					<Line theme={theme} icon="gauge-high" text={limitAvailable === null ? t('crypto.wallet.swap.limitUnlimited') : t('crypto.wallet.swap.limitToday', { amount: formatUsd(limitAvailable) })} />
					<Line theme={theme} icon={direction === 'in' ? 'gas-pump' : 'clock'} text={direction === 'in' ? t('crypto.wallet.swap.sponsoredNote') : t('crypto.wallet.swap.outNote')} />
				</View>

				{pairs.isSuccess && !!pair && !pair.enabled && <Notice theme={theme} color={theme.colors.warning} text={t('crypto.wallet.swap.disabled')} />}
				{pairs.isSuccess && !walletMatches && <Notice theme={theme} color={theme.colors.warning} text={t('crypto.wallet.swap.notRegistered')} />}
				{direction === 'in' && inn.phase === 'error' && !!inn.error && <Notice theme={theme} color={theme.colors.danger} text={inn.error} />}

				{direction === 'out' && out.showPinStep && (
					<View style={styles.pinStep}>
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
					</View>
				)}

			</ScrollView>

			{/* Fuera del scroll: siempre abajo y sube con el teclado */}
			<View style={styles.footer}>
				<QPButton
					title={direction === 'out' && out.showPinStep ? t('crypto.wallet.send.confirm') : ctaTitle}
					onPress={direction === 'out' && out.showPinStep ? out.submit : onContinue}
					disabled={!ready || busy || pairs.isLoading}
					loading={busy}
				/>
			</View>

			{!!asset && (
				<WalletAuthModal
					visible={inn.authVisible}
					subtitle={t('crypto.wallet.swap.authSubtitle', { amount: normalized ?? '', symbol })}
					onClose={inn.closeAuth}
					onAuthorized={inn.onAuthorized}
				/>
			)}
		</KeyboardAvoidingView>
	)
}

const Line = ({ theme, icon, text }: { theme: Theme, icon: 'equals' | 'gauge-high' | 'gas-pump' | 'clock', text: string }) => (
	<View style={styles.line}>
		<FontAwesome6 name={icon} size={12} color={theme.colors.tertiaryText} iconStyle="solid" />
		<Text style={[styles.lineText, { color: theme.colors.secondaryText, fontFamily: theme.typography.fontFamily.regular, fontSize: theme.typography.fontSize.sm }]}>{text}</Text>
	</View>
)

const Notice = ({ theme, color, text }: { theme: Theme, color: string, text: string }) => (
	<View style={[styles.notice, { backgroundColor: color + '12' }]}>
		<FontAwesome6 name="triangle-exclamation" size={14} color={color} iconStyle="solid" style={styles.noticeIcon} />
		<Text style={[styles.noticeText, { color: theme.colors.primaryText, fontFamily: theme.typography.fontFamily.regular, fontSize: theme.typography.fontSize.sm }]}>{text}</Text>
	</View>
)

const styles = StyleSheet.create({
	scroll: { flex: 1 },
	content: { paddingTop: 4, paddingBottom: 16, gap: 12 },
	footer: { paddingTop: 8, paddingBottom: 24 },
	switchWrap: { alignItems: 'center' },
	card: { borderRadius: 14, paddingHorizontal: 14 },
	row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
	rowTexts: { flex: 1, gap: 2 },
	qvapayIcon: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
	amountHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 4 },
	field: { flexDirection: 'row', alignItems: 'center', borderRadius: 12, paddingLeft: 14, paddingRight: 10, paddingVertical: 10, gap: 6 },
	amountInput: { flex: 1, minWidth: 60, paddingVertical: 6 },
	max: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, marginLeft: 4 },
	amountFooter: { flexDirection: 'row', justifyContent: 'space-between', minHeight: 18 },
	notes: { gap: 6, paddingHorizontal: 2 },
	line: { flexDirection: 'row', alignItems: 'center', gap: 8 },
	lineText: { flex: 1 },
	notice: { flexDirection: 'row', gap: 10, padding: 12, borderRadius: 12, alignItems: 'flex-start' },
	noticeIcon: { marginTop: 2 },
	noticeText: { flex: 1 },
	pinStep: { marginTop: 4 },
})

export default WalletSwap
