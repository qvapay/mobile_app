import { useCallback, useEffect, useLayoutEffect, useMemo, useState } from 'react'
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import FontAwesome6 from '@react-native-vector-icons/fontawesome6'

// Theme
import { useTheme } from '../../../theme/ThemeContext'
import type { Theme } from '../../../theme/ThemeContext'
import { useContainerStyles, useTextStyles } from '../../../theme/themeUtils'

// Wallet
import { useWallet } from '../../../wallet/WalletContext'
import { useEffectiveRegistry } from '../../../wallet/registry/appRpcRouter'
import { AllRpcsFailedError } from '../../../wallet/registry/rpcRouter'
import { SolanaExpiredError } from '../../../wallet/solana/tx'
import { addressForKind } from '../../../wallet/assets'
import { displayAmount, formatUnits, parseUnits } from '../../../wallet/chains/units'
import { actionNeedsAmount, actionNeedsTarget } from '../../../wallet/staking/capabilities'
import { summarizePositions, timeLeft } from '../../../wallet/staking/staking'
import { isStakingKind } from '../../../wallet/staking/types'
import type { RegistryStakeTarget } from '../../../wallet/registry/types'
import { useWalletAssets } from './walletQueries'
import { useInvalidateStaking, useStakingConfig, useStakingSnapshot, useTargetApys } from './stakingQueries'
import { TRX_MAX_RESERVE_SUN } from './walletSendActions'
import { broadcastStake, estimateStakeMinimum, estimateStakeReserve, prepareStake, signStake, StakeUnsupportedError } from './walletStakeActions'
import type { PreparedStake, SignedStake, StakeIntent } from './walletStakeActions'
import { maxStakeUnits, validateStakeForm } from './stakeFormModel'
import type { StakeFormError } from './stakeFormModel'
import useWalletTx from './useWalletTx'
import type { TxPhase } from './useWalletTx'
import { shortAddress } from './walletFormat'

// Settings
import { useSettings } from '../../../settings/SettingsContext'

// UI
import QPButton from '../../../ui/particles/QPButton'
import QPPressable from '../../../ui/particles/QPPressable'
import QPAssetIcon from '../../../ui/particles/QPAssetIcon'
import WalletAuthModal from './components/WalletAuthModal'
import StakeTargetPicker from './components/StakeTargetPicker'

// Navigation
import { ROUTES } from '../../../routes'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import type { RootStackParamList } from '../../../types/navigation'

type Props = NativeStackScreenProps<RootStackParamList, 'WalletStakeAction'>

const parseUnitsSafe = (decimal: string, decimals: number): bigint => {
	try { return parseUnits(decimal, decimals) } catch { return 0n }
}

const Row = ({ label, value, theme, last }: { label: string, value: string, theme: Theme, last?: boolean }) => (
	<View style={[styles.row, !last && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.colors.border + '60' }]}>
		<Text style={{ color: theme.colors.secondaryText, fontFamily: theme.typography.fontFamily.regular, fontSize: theme.typography.fontSize.sm }}>{label}</Text>
		<Text selectable style={[styles.rowValue, { color: theme.colors.primaryText, fontFamily: theme.typography.fontFamily.medium, fontSize: theme.typography.fontSize.sm }]}>{value}</Text>
	</View>
)

const Notice = ({ theme, icon, color, text }: { theme: Theme, icon: 'shield-halved' | 'triangle-exclamation', color: string, text: string }) => (
	<View style={[styles.notice, { backgroundColor: color + '12' }]}>
		<FontAwesome6 name={icon} size={14} color={color} iconStyle="solid" style={styles.noticeIcon} />
		<Text style={[styles.noticeText, { color: theme.colors.primaryText, fontFamily: theme.typography.fontFamily.regular, fontSize: theme.typography.fontSize.sm }]}>{text}</Text>
	</View>
)

const CONFIRM_LABEL: Partial<Record<TxPhase, string>> = {
	signing: 'crypto.staking.confirm.signing',
	broadcasting: 'crypto.staking.confirm.broadcasting',
}

/**
 * Una acción de staking, en dos pasos dentro de la misma pantalla:
 *
 * 1. Formulario (solo si la acción lleva importe o destino): a quién y cuánto.
 * 2. Confirmación: la app construye la tx, la VERIFICA (lo que se pinta sale
 *    de la tx, no del formulario) y, tras PIN/biometría, firma y difunde. El
 *    motor es el mismo que Enviar (`useWalletTx`): mismas garantías de doble
 *    tap, re-difusión con la misma firma y reconstrucción si caduca.
 */
const WalletStakeAction = ({ navigation, route }: Props) => {

	const { assetId, action, positionId, targetId } = route.params
	const { t } = useTranslation()
	const { theme } = useTheme()
	const textStyles = useTextStyles(theme)
	const containerStyles = useContainerStyles(theme)

	const { addresses } = useWallet()
	const registry = useEffectiveRegistry()
	const { all } = useWalletAssets()
	const asset = useMemo(() => all.find(a => a.id === assetId), [all, assetId])
	const kind = asset && isStakingKind(asset.kind) ? asset.kind : null
	const chain = asset ? registry.chains[asset.chainKey] : undefined
	const config = useStakingConfig(asset?.chainKey)
	const targets = useMemo(() => config?.targets ?? [], [config])
	const snapshot = useStakingSnapshot(asset)

	const { getSetting } = useSettings()
	const showBalance = getSetting('privacy', 'showBalance', true) as boolean

	const needsAmount = actionNeedsAmount(action, kind ?? undefined)
	const needsTarget = actionNeedsTarget(action)
	const [step, setStep] = useState<'form' | 'confirm'>(needsAmount || needsTarget ? 'form' : 'confirm')
	const [amountText, setAmountText] = useState('')
	const [target, setTarget] = useState<RegistryStakeTarget | null>(null)
	const [pickerOpen, setPickerOpen] = useState(false)
	// APY de cada destino: solo se pide con el selector abierto (y queda en caché una hora)
	const targetApys = useTargetApys(asset?.chainKey, targets, pickerOpen)

	useLayoutEffect(() => { navigation.setOptions({ headerTitle: t(`crypto.staking.actions.${action}`) }) }, [navigation, action, t])

	// Destino preseleccionado solo si llega por params o es el ÚNICO: un partner nunca se elige en silencio
	useEffect(() => {
		if (target || targets.length === 0) return
		const initial = targetId ? targets.find(x => x.id === targetId) : targets.length === 1 ? targets[0] : undefined
		if (initial) setTarget(initial)
	}, [targets, targetId, target])

	// De dónde sale el importe: el saldo gastable para entrar, la posición (o todo lo activo) para salir
	const positions = snapshot.data?.positions
	const sourceUnits = useMemo(() => {
		if (!asset) return 0n
		if (action !== 'unstake') return parseUnitsSafe(asset.amount, asset.decimals)
		const position = positionId ? positions?.find(p => p.id === positionId) : undefined
		return position ? position.amount : summarizePositions(positions).active
	}, [asset, action, positionId, positions])

	// Reserva para MÁX al ENTRAR (salir no gasta del importe): la declara el adaptador de la red
	// (Solana: renta de la nueva stake account + mínimo de la wallet + comisión)
	const [reserve, setReserve] = useState<bigint>(0n)
	useEffect(() => {
		if (!asset || !chain || action === 'unstake') { setReserve(0n); return }
		if (asset.kind === 'tron') { setReserve(TRX_MAX_RESERVE_SUN); return }
		let cancelled = false
		estimateStakeReserve(chain, asset.chainKey).then(value => { if (!cancelled) setReserve(value) }).catch(() => { if (!cancelled) setReserve(0n) })
		return () => { cancelled = true }
	}, [asset, chain, action])

	// Mínimo de la RED para entrar (Solana 1 SOL hoy, TRON 1 TRX): se enseña desde el principio
	// y el botón no se habilita por debajo, en vez de fallar al confirmar
	const [networkMin, setNetworkMin] = useState<bigint>(0n)
	const isEntry = action === 'stake' || action === 'delegate'
	useEffect(() => {
		if (!chain || !asset || !isEntry) { setNetworkMin(0n); return }
		let cancelled = false
		estimateStakeMinimum(chain, asset.chainKey).then(value => { if (!cancelled) setNetworkMin(value) }).catch(() => { if (!cancelled) setNetworkMin(0n) })
		return () => { cancelled = true }
	}, [chain, asset, isEntry])
	const targetMin = target?.minAmount ? BigInt(target.minAmount) : 0n
	const minUnits = networkMin > targetMin ? networkMin : targetMin

	const form = validateStakeForm({
		action,
		kind: kind ?? undefined,
		amountText,
		decimals: asset?.decimals ?? 0,
		sourceUnits,
		minUnits: minUnits > 1n ? minUnits : null,
		hasTarget: !!target,
	})

	const formErrorText = (error: StakeFormError | null): string | null => {
		if (!error || !asset) return null
		if (error.key === 'amountInvalid') return t('crypto.staking.form.errors.amountInvalid', { decimals: error.decimals })
		if (error.key === 'belowMin') return t('crypto.staking.form.errors.belowMin', { amount: displayAmount(formatUnits(error.min, asset.decimals)), symbol: asset.symbol })
		return t(`crypto.staking.form.errors.${error.key}`, { symbol: asset.symbol })
	}

	// Lo elegido en el formulario se CONGELA al pasar a confirmar: la tx no sigue al formulario en vivo.
	// Las acciones sin formulario (retirar, cobrar, revocar) entran ya congeladas y vacías.
	const [frozen, setFrozen] = useState<{ amount: bigint | null, target: RegistryStakeTarget | null } | null>(
		needsAmount || needsTarget ? null : { amount: null, target: null },
	)
	const goConfirm = () => {
		if (!form.canContinue) return
		setFrozen({ amount: needsAmount ? form.amountUnits : null, target: needsTarget ? target : null })
		setStep('confirm')
	}
	const backToForm = () => { setFrozen(null); setStep('form') }

	const intent = useMemo<StakeIntent | null>(() => {
		if (!frozen || !asset || !kind || !addresses) return null
		return {
			chainKey: asset.chainKey,
			kind,
			action,
			from: addressForKind(addresses, asset.kind),
			fromPublicKey: addresses.stxPublicKey,
			amount: frozen.amount,
			target: frozen.target ? { id: frozen.target.id, name: frozen.target.name } : null,
			positionId: positionId ?? null,
		}
	}, [frozen, asset, kind, addresses, action, positionId])

	const invalidateStaking = useInvalidateStaking()
	const describeError = useCallback((err: unknown) => {
		if (err instanceof StakeUnsupportedError) return t('crypto.staking.confirm.errors.unsupported', { network: asset?.chainName ?? '' })
		if (err instanceof AllRpcsFailedError) return t('crypto.staking.confirm.errors.noNodes')
		if (err instanceof SolanaExpiredError) return t('crypto.wallet.send.errors.expired')
		if (err instanceof Error && /VerifyError$/.test(err.name)) return t('crypto.staking.confirm.errors.verifyFailed')
		const message = (err as Error)?.message ?? ''
		// Los rechazos de simulación de Solana no explican nada: se traducen los conocidos
		if (/seguir existiendo|InsufficientFundsForRent/i.test(message)) return t('crypto.wallet.send.errors.solanaRent')
		if (/insufficient funds|insuficiente/i.test(message)) return t('crypto.wallet.send.errors.nodeInsufficient')
		return message ? t('crypto.staking.confirm.errors.generic', { message }) : t('crypto.staking.confirm.errors.unknown')
	}, [t, asset?.chainName])

	const build = useCallback(() => prepareStake(chain!, intent!), [chain, intent])
	const onSent = useCallback((txid: string, prepared: PreparedStake, _duplicate: boolean, note?: string) => {
		invalidateStaking()
		const amount = prepared.summary.amount !== null && asset ? formatUnits(prepared.summary.amount, asset.decimals) : undefined
		navigation.replace(ROUTES.WALLET_STAKE_SUCCESS, { assetId, action, txid, amount, note: note === 'votePending' ? 'votePending' : undefined })
	}, [invalidateStaking, navigation, assetId, action, asset])

	const tx = useWalletTx<PreparedStake, SignedStake>({
		ready: step === 'confirm' && !!intent && !!chain,
		build,
		sign: signStake,
		submit: broadcastStake,
		onSent,
		describeError,
	})
	const { phase, prepared, error, busy } = tx

	if (!asset || !kind || !chain) {
		return <View style={[containerStyles.subContainer, styles.center]}><ActivityIndicator color={theme.colors.primary} /></View>
	}

	const targetKind = t(`crypto.staking.targetKind.${kind}`)
	const actionLabel = t(`crypto.staking.actions.${action}`)
	const nativeFee = (value: bigint) => `${displayAmount(formatUnits(value, chain.native.decimals))} ${chain.native.symbol}`

	if (step === 'form') {
		const sourceLabel = displayAmount(formatUnits(sourceUnits, asset.decimals))
		return (
			<KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={containerStyles.subContainer}>
				<ScrollView style={styles.scroll} contentContainerStyle={styles.formContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>

					<View style={[styles.assetChip, { backgroundColor: theme.colors.surface }]}>
						<QPAssetIcon logoTick={asset.logoTick} networkTick={asset.networkTick} size={28} />
						<Text style={[textStyles.h4, { color: theme.colors.primaryText }]}>{asset.symbol}</Text>
						<Text style={{ color: theme.colors.secondaryText, fontFamily: theme.typography.fontFamily.regular, fontSize: theme.typography.fontSize.sm }}>{asset.chainName}</Text>
					</View>

					{needsTarget && (
						<>
							<Text style={[textStyles.h5, styles.label, { color: theme.colors.secondaryText }]}>{t('crypto.staking.form.targetLabel', { target: targetKind })}</Text>
							<QPPressable
								onPress={() => setPickerOpen(true)}
								testID="stake-target-open"
								style={[styles.field, styles.targetField, { backgroundColor: theme.colors.surface }, !theme.isDark && { borderWidth: StyleSheet.hairlineWidth, borderColor: theme.colors.border }]}
								accessibilityRole="button"
							>
								<View style={styles.targetInfo}>
									<Text style={[textStyles.h4, { color: target ? theme.colors.primaryText : theme.colors.placeholder }]} numberOfLines={1}>
										{target ? target.name : t('crypto.staking.picker.title', { target: targetKind })}
									</Text>
									{!!target && (
										<Text style={{ color: theme.colors.secondaryText, fontFamily: theme.typography.fontFamily.regular, fontSize: theme.typography.fontSize.xs }} numberOfLines={1}>
											{target.partner ? `${t('crypto.staking.picker.partner')} · ` : ''}{shortAddress(target.id)}
										</Text>
									)}
								</View>
								<Text style={{ color: theme.colors.primary, fontFamily: theme.typography.fontFamily.semiBold, fontSize: theme.typography.fontSize.sm }}>{t('crypto.staking.form.pickTarget')}</Text>
							</QPPressable>
						</>
					)}

					{needsAmount && (
						<>
							<View style={styles.amountHeader}>
								<Text style={[textStyles.h5, styles.label, { color: theme.colors.secondaryText }]}>{t('crypto.staking.form.amountLabel')}</Text>
								<Text style={[textStyles.h6, { color: theme.colors.secondaryText }]}>
									{t(action === 'unstake' ? 'crypto.staking.form.stakedAvailable' : 'crypto.staking.form.available', { amount: showBalance ? sourceLabel : '••••', symbol: asset.symbol })}
								</Text>
							</View>
							<View style={[styles.field, styles.amountField, { backgroundColor: theme.colors.surface }, !theme.isDark && { borderWidth: StyleSheet.hairlineWidth, borderColor: theme.colors.border }]}>
								<TextInput
									style={[styles.amountInput, { color: theme.colors.primaryText, fontFamily: theme.typography.fontFamily.semiBold, fontSize: theme.typography.fontSize.xxl }]}
									value={amountText}
									onChangeText={setAmountText}
									placeholder="0"
									placeholderTextColor={theme.colors.placeholder}
									keyboardType="decimal-pad"
									testID="stake-amount"
								/>
								<Text style={[textStyles.h4, { color: theme.colors.secondaryText }]}>{asset.symbol}</Text>
								<Pressable onPress={() => setAmountText(formatUnits(maxStakeUnits(sourceUnits, reserve), asset.decimals))} hitSlop={8} style={[styles.max, { backgroundColor: theme.colors.primary + '18' }]} accessibilityRole="button">
									<Text style={{ color: theme.colors.primary, fontFamily: theme.typography.fontFamily.semiBold, fontSize: theme.typography.fontSize.xs }}>{t('crypto.staking.form.max')}</Text>
								</Pressable>
							</View>
						</>
					)}
					<Text testID={form.error ? 'stake-form-error' : 'stake-form-hint'} style={[textStyles.h6, styles.fieldError, { color: form.error ? theme.colors.danger : theme.colors.secondaryText }]}>
						{formErrorText(form.error) ?? (needsAmount && minUnits > 1n ? t('crypto.staking.form.minimum', { amount: displayAmount(formatUnits(minUnits, asset.decimals)), symbol: asset.symbol }) : ' ')}
					</Text>
				</ScrollView>

				<View style={styles.footer}>
					<QPButton title={t('crypto.staking.form.continue')} onPress={goConfirm} disabled={!form.canContinue} testID="stake-continue" />
				</View>

				<StakeTargetPicker
					visible={pickerOpen}
					kind={kind}
					targets={targets}
					selectedId={target?.id ?? null}
					symbol={asset.symbol}
					decimals={asset.decimals}
					onPick={picked => { setTarget(picked); setPickerOpen(false) }}
					onClose={() => setPickerOpen(false)}
					apys={targetApys.data}
					apyLoading={targetApys.isFetching && !targetApys.data}
				/>
			</KeyboardAvoidingView>
		)
	}

	// --- Confirmación: todo sale de la tx construida y verificada ---
	const summary = prepared?.summary
	const verifiedAmount = summary?.amount != null ? displayAmount(formatUnits(summary.amount, asset.decimals)) : null
	const wait = summary?.waitMs ? timeLeft(Date.now() + summary.waitMs, Date.now()) : null
	const authSubtitle = verifiedAmount
		? t('crypto.staking.confirm.authSubtitle', { action: actionLabel, amount: verifiedAmount, symbol: asset.symbol })
		: t('crypto.staking.confirm.authSubtitleNoAmount', { action: actionLabel, network: asset.chainName })
	const rows: Array<{ label: string, value: string }> = [
		{ label: t('crypto.staking.confirm.action'), value: actionLabel },
		...(verifiedAmount ? [{ label: t('crypto.staking.confirm.amount'), value: `${verifiedAmount} ${asset.symbol}` }] : []),
		...(summary?.target ? [{ label: t('crypto.staking.confirm.target', { target: targetKind }), value: summary.target.name ?? shortAddress(summary.target.id) }] : []),
		{ label: t('crypto.staking.confirm.networkFee'), value: phase === 'preparing' || !summary ? '…' : nativeFee(summary.feeEstimated) },
		...(summary && summary.txCount > 1 ? [{ label: t('crypto.staking.confirm.txCount'), value: t('crypto.staking.confirm.txCountValue', { count: summary.txCount }) }] : []),
		...(summary?.reserve ? [{ label: t('crypto.staking.confirm.reserve'), value: nativeFee(summary.reserve) }] : []),
		...(wait ? [{ label: t('crypto.staking.confirm.wait'), value: t(`crypto.staking.timeLeft.${wait.unit}`, { count: wait.value }) }] : []),
	]

	return (
		<ScrollView style={containerStyles.subContainer} contentContainerStyle={styles.confirmContent} showsVerticalScrollIndicator={false}>
			<View style={styles.hero}>
				<QPAssetIcon logoTick={asset.logoTick} networkTick={asset.networkTick} size={56} ringColor={theme.colors.background} />
				<Text style={[textStyles.amount, styles.heroAmount, { color: theme.colors.primaryText }]}>
					{verifiedAmount ? `${verifiedAmount} ${asset.symbol}` : actionLabel}
				</Text>
				<Text style={[textStyles.h5, { color: theme.colors.secondaryText }]}>{t('crypto.wallet.send.viaNetwork', { network: asset.chainName })}</Text>
			</View>

			<View style={[styles.card, { backgroundColor: theme.colors.surface }, !theme.isDark && { borderWidth: StyleSheet.hairlineWidth, borderColor: theme.colors.border }]}>
				{rows.map((row, index) => <Row key={row.label} theme={theme} label={row.label} value={row.value} last={index === rows.length - 1} />)}
			</View>

			{summary?.notices?.map(notice => (
				<Notice key={notice} theme={theme} icon="triangle-exclamation" color={theme.colors.warning} text={t(`crypto.staking.confirm.notices.${notice}`, { target: summary.target?.name ?? targetKind })} />
			))}
			{phase === 'error' && !!error && <Notice theme={theme} icon="triangle-exclamation" color={theme.colors.danger} text={error} />}
			<Notice theme={theme} icon="shield-halved" color={theme.colors.secondaryText} text={t('crypto.staking.confirm.nonCustodial')} />

			<View style={styles.spacer} />

			<View style={styles.actions}>
				{phase === 'error' ? (
					<QPButton title={t('crypto.staking.confirm.retry')} onPress={tx.retry} />
				) : (
					<QPButton
						title={t(CONFIRM_LABEL[phase] ?? 'crypto.staking.confirm.confirm')}
						onPress={tx.openAuth}
						disabled={phase !== 'ready'}
						loading={phase === 'preparing' || busy}
						testID="stake-confirm"
					/>
				)}
				<QPButton
					title={t('crypto.staking.confirm.back')}
					onPress={() => (needsAmount || needsTarget ? backToForm() : navigation.goBack())}
					outlined
					disabled={busy}
				/>
			</View>

			<WalletAuthModal visible={tx.authVisible} subtitle={authSubtitle} onClose={tx.closeAuth} onAuthorized={tx.onAuthorized} />
		</ScrollView>
	)
}

const styles = StyleSheet.create({
	center: { alignItems: 'center', justifyContent: 'center' },
	scroll: { flex: 1 },
	formContent: { paddingTop: 4, paddingBottom: 16 },
	footer: { paddingTop: 8, paddingBottom: 24 },
	assetChip: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8, paddingHorizontal: 14, borderRadius: 20, alignSelf: 'center', marginBottom: 18 },
	label: { marginBottom: 6 },
	field: { flexDirection: 'row', borderRadius: 12, paddingLeft: 14, paddingRight: 10, gap: 6 },
	targetField: { alignItems: 'center', paddingVertical: 12, marginBottom: 16 },
	targetInfo: { flex: 1, minWidth: 0, gap: 2 },
	amountHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
	amountField: { alignItems: 'center', paddingVertical: 10 },
	amountInput: { flex: 1, minWidth: 60, paddingVertical: 6 },
	max: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, marginLeft: 4 },
	fieldError: { minHeight: 18, marginTop: 6 },
	// flexGrow + el spacer empujan las acciones al fondo cuando el contenido no llena la pantalla
	confirmContent: { gap: 12, paddingTop: 8, paddingBottom: 24, flexGrow: 1 },
	spacer: { flex: 1 },
	hero: { alignItems: 'center', gap: 6, paddingBottom: 8 },
	heroAmount: { fontSize: 32, marginTop: 8, textAlign: 'center' },
	card: { borderRadius: 14, paddingHorizontal: 14 },
	row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12, paddingVertical: 12 },
	rowValue: { flex: 1, textAlign: 'right' },
	notice: { flexDirection: 'row', gap: 10, padding: 12, borderRadius: 12, alignItems: 'flex-start' },
	noticeIcon: { marginTop: 2 },
	noticeText: { flex: 1 },
	actions: { gap: 10, marginTop: 8 },
})

export default WalletStakeAction
