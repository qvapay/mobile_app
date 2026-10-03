import { useCallback, useEffect, useMemo, useState } from 'react'
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import Clipboard from '@react-native-clipboard/clipboard'
import FontAwesome6 from '@react-native-vector-icons/fontawesome6'

// Theme
import { useTheme } from '../../../theme/ThemeContext'
import { useContainerStyles, useTextStyles } from '../../../theme/themeUtils'

// Wallet
import { useWallet } from '../../../wallet/WalletContext'
import { addressForKind } from '../../../wallet/assets'
import type { AssetView } from '../../../wallet/assets'
import { displayAmount, formatUnits, parseUnits } from '../../../wallet/chains/units'
import { useEffectiveRegistry } from '../../../wallet/registry/appRpcRouter'
import { usePriceMap, useWalletAssets } from './walletQueries'
import { canSendAsset, estimateNativeReserve, isValidAddressFor, maxSendableUnits, TRX_MAX_RESERVE_SUN } from './walletSendActions'
import { addressPlaceholder, formatUsd } from './walletFormat'
import { canToggleUsd, unitsToInput, usdToUnits, USD_DECIMALS } from './sendAmountModel'
import type { AmountMode } from './sendAmountModel'
import { splitAddress } from '../../../helpers/addressHighlight'

// Settings
import { useSettings } from '../../../settings/SettingsContext'

// UI
import QPButton from '../../../ui/particles/QPButton'
import QPPressable from '../../../ui/particles/QPPressable'
import QPAssetIcon from '../../../ui/particles/QPAssetIcon'
import { AddressSpans } from '../../../ui/particles/QPAddress'

// Navigation
import { ROUTES } from '../../../routes'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import type { RootStackParamList } from '../../../types/navigation'

type Props = NativeStackScreenProps<RootStackParamList, 'WalletSend'>

/**
 * Enviar desde la wallet self-custody, paso 1: activo, destino y cantidad.
 * Sin `assetId` lista los activos enviables (TRON y EVM). Valida en local
 * (checksum del destino según la familia, decimales, saldo) y pasa la intención a
 * WalletSendConfirm, que construye/verifica la tx y pide el PIN. El
 * escáner devuelve la dirección por params (`route.params.address`).
 */
const WalletSend = ({ navigation, route }: Props) => {

	const { assetId, address: scannedAddress } = route.params ?? {}
	const { t } = useTranslation()
	const { theme } = useTheme()
	const textStyles = useTextStyles(theme)
	const containerStyles = useContainerStyles(theme)

	const { addresses } = useWallet()
	const registry = useEffectiveRegistry()
	const { all } = useWalletAssets()
	const prices = usePriceMap()
	const { getSetting } = useSettings()
	const showBalance = getSetting('privacy', 'showBalance', true) as boolean

	const sendable = useMemo(() => all.filter(canSendAsset), [all])
	const asset = useMemo(() => all.find(a => a.id === assetId), [all, assetId])
	const ownAddress = asset && addresses ? addressForKind(addresses, asset.kind) : null

	const [to, setTo] = useState('')
	const toParts = splitAddress(to)
	const [amount, setAmount] = useState('')
	// Token ⇄ USD (solo activos volátiles con precio). Lo que manda siempre son
	// unidades del token; `exactUnits` fija las exactas tras MÁX o al conmutar,
	// para que el redondeo del texto no las mueva hasta que el usuario teclee
	// Ligado al activo: con otro activo vuelve solo a token y sin unidades fijadas
	// (derivado en render; un efecto de reseteo pintaba un frame con lo anterior)
	const [unitState, setUnitState] = useState<{ assetId: string | undefined, mode: AmountMode, exact: bigint | null }>({ assetId: undefined, mode: 'token', exact: null })
	const currentAssetId = asset?.id
	const sameAsset = unitState.assetId === currentAssetId
	const mode: AmountMode = sameAsset ? unitState.mode : 'token'
	const exactUnits = sameAsset ? unitState.exact : null
	const setExactUnits = useCallback((next: bigint | null) => {
		setUnitState(prev => ({ assetId: currentAssetId, mode: prev.assetId === currentAssetId ? prev.mode : 'token', exact: next }))
	}, [currentAssetId])
	const price = asset?.priceTick ? prices[asset.priceTick] ?? null : null
	const usdToggle = !!asset && canToggleUsd(asset, price)
	const activeMode: AmountMode = usdToggle ? mode : 'token'
	const onChangeAmount = useCallback((value: string) => { setAmount(value); setExactUnits(null) }, [setExactUnits])
	// Reserva de gas para MAX en nativos EVM (fee actual del nodo); TRON usa la fija
	const [nativeReserve, setNativeReserve] = useState<bigint | null>(null)
	useEffect(() => {
		if (!asset || asset.contract !== null || (asset.kind !== 'evm' && asset.kind !== 'solana')) { setNativeReserve(null); return }
		let cancelled = false
		const chain = registry.chains[asset.chainKey]
		estimateNativeReserve(chain, asset.chainKey).then(value => { if (!cancelled) setNativeReserve(value) }).catch(() => { if (!cancelled) setNativeReserve(null) })
		return () => { cancelled = true }
	}, [asset, registry])

	// El escáner vuelve con la dirección en params (navigate a esta pantalla las fusiona)
	useEffect(() => { if (scannedAddress) setTo(scannedAddress.trim()) }, [scannedAddress])

	const paste = useCallback(async () => {
		const text = (await Clipboard.getString()).trim()
		if (text) setTo(text)
	}, [])

	const scan = useCallback(() => {
		if (!asset) return
		navigation.navigate(ROUTES.SCAN_SCREEN, { view: 'scan', returnTo: 'WalletSend', assetId: asset.id })
	}, [navigation, asset])

	// Validación local; los mensajes se calculan una vez por render, no en cada tecla
	const toTrimmed = to.trim()
	const toError = !toTrimmed ? null
		: !asset || !isValidAddressFor(asset.kind, toTrimmed) ? t('crypto.wallet.send.errors.invalidAddress', { network: asset?.chainName ?? '' })
			: toTrimmed === ownAddress ? t('crypto.wallet.send.errors.ownAddress')
				: null

	const balanceUnits = asset ? BigInt(asset.amount === '' ? '0' : parseUnitsSafe(asset.amount, asset.decimals)) : 0n
	let amountUnits: bigint | null = null
	let amountError: string | null = null
	if (asset && amount.trim()) {
		try {
			amountUnits = exactUnits ?? (activeMode === 'usd' && price
				? usdToUnits(amount, price, asset.decimals)
				: parseUnits(amount, asset.decimals))
			if (amountUnits <= 0n) amountError = t('crypto.wallet.send.errors.amountZero')
			else if (amountUnits > balanceUnits) amountError = t('crypto.wallet.send.errors.insufficient', { symbol: asset.symbol })
		} catch {
			amountError = t('crypto.wallet.send.errors.amountInvalid', { decimals: activeMode === 'usd' ? USD_DECIMALS : asset.decimals })
		}
	}

	const setMax = useCallback(() => {
		if (!asset) return
		const max = maxSendableUnits({
			balance: balanceUnits,
			isNative: asset.contract === null,
			kind: asset.kind,
			reserve: asset.kind === 'tron' ? TRX_MAX_RESERVE_SUN : (nativeReserve ?? 0n),
		})
		setExactUnits(max)
		setAmount(unitsToInput(max, activeMode, price, asset.decimals))
	}, [asset, balanceUnits, nativeReserve, activeMode, price, setExactUnits])

	// Conmutar convierte lo escrito (no lo borra) y conserva las unidades exactas
	const toggleMode = () => {
		if (!asset || !usdToggle) return
		const next: AmountMode = activeMode === 'token' ? 'usd' : 'token'
		let exact = exactUnits
		if (amountUnits !== null && !amountError) {
			exact = amountUnits
			setAmount(unitsToInput(amountUnits, next, price, asset.decimals))
		} else if (amountError) {
			exact = null
			setAmount('')
		}
		// Una sola actualización: modo y unidades exactas juntos (dos setters se pisarían)
		setUnitState({ assetId: currentAssetId, mode: next, exact })
	}

	const canContinue = !!asset && !!toTrimmed && !toError && amountUnits !== null && !amountError

	const goConfirm = () => {
		if (!canContinue || !asset || amountUnits === null) return
		navigation.navigate(ROUTES.WALLET_SEND_CONFIRM, { assetId: asset.id, to: toTrimmed, amount: formatUnits(amountUnits, asset.decimals) })
	}

	if (!asset) {
		return (
			<ScrollView style={containerStyles.subContainer} contentContainerStyle={styles.pickerContent} showsVerticalScrollIndicator={false}>
				<Text style={[textStyles.h2, { color: theme.colors.primaryText }]}>{t('crypto.wallet.send.pickTitle')}</Text>
				<View style={[styles.card, { backgroundColor: theme.colors.surface }, !theme.isDark && { borderWidth: StyleSheet.hairlineWidth, borderColor: theme.colors.border }]}>
					{sendable.map((item: AssetView, index) => (
						<QPPressable
							key={item.id}
							onPress={() => navigation.setParams({ assetId: item.id })}
							style={[styles.pickerRow, index < sendable.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.colors.border + '60' }]}
						>
							<QPAssetIcon logoTick={item.logoTick} networkTick={item.networkTick} size={36} />
							<View style={styles.pickerInfo}>
								<Text style={[textStyles.h4, { color: theme.colors.primaryText }]}>{item.symbol}</Text>
								<Text style={{ color: theme.colors.secondaryText, fontFamily: theme.typography.fontFamily.regular, fontSize: theme.typography.fontSize.sm }}>{item.chainName}</Text>
							</View>
							<Text style={[textStyles.h5, { color: theme.colors.secondaryText }]}>{showBalance ? item.amountLabel : '••••'}</Text>
						</QPPressable>
					))}
				</View>
			</ScrollView>
		)
	}

	const usd = amountUnits !== null && !amountError && asset.priceTick && prices[asset.priceTick]
		? Number(formatUnits(amountUnits, asset.decimals)) * prices[asset.priceTick]
		: asset.stable && amountUnits !== null && !amountError ? Number(formatUnits(amountUnits, asset.decimals)) : null

	const amountTextStyle = { fontFamily: theme.typography.fontFamily.semiBold, fontSize: theme.typography.fontSize.xxl }

	return (
		<KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={containerStyles.subContainer}>
			<ScrollView style={styles.scroll} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>

				<QPPressable onPress={() => navigation.setParams({ assetId: undefined })} style={[styles.assetChip, { backgroundColor: theme.colors.surface }]} accessibilityRole="button">
					<QPAssetIcon logoTick={asset.logoTick} networkTick={asset.networkTick} size={28} />
					<Text style={[textStyles.h4, { color: theme.colors.primaryText }]}>{asset.symbol}</Text>
					<Text style={{ color: theme.colors.secondaryText, fontFamily: theme.typography.fontFamily.regular, fontSize: theme.typography.fontSize.sm }}>{asset.chainName}</Text>
					<FontAwesome6 name="chevron-down" size={11} color={theme.colors.secondaryText} iconStyle="solid" />
				</QPPressable>

				{/* Destino */}
				<Text style={[textStyles.h5, styles.label, { color: theme.colors.secondaryText }]}>{t('crypto.wallet.send.toLabel')}</Text>
				<View style={[styles.field, { backgroundColor: theme.colors.surface }, !theme.isDark && { borderWidth: StyleSheet.hairlineWidth, borderColor: theme.colors.border }]}>
					<TextInput
						style={[styles.input, textStyles.h5, { color: theme.colors.primaryText }]}
						// Dirección resaltada (6+6 en primary): SIEMPRE Text anidado, nunca `value`;
						// pasar de uno a otro a mitad de escribir movía el cursor en iOS
						onChangeText={setTo}
						placeholder={addressPlaceholder(asset.kind)}
						// Muy tenue (~40 %): es solo una pista de la forma, no compite con lo que se pega
						placeholderTextColor={theme.colors.placeholder + '66'}
						autoCapitalize="none"
						autoCorrect={false}
						spellCheck={false}
						multiline
						scrollEnabled={false}
						// Una dirección no lleva saltos de línea: Intro cierra el teclado
						submitBehavior="blurAndSubmit"
						returnKeyType="done"
					>
						<Text>{toParts ? <AddressSpans parts={toParts} color={theme.colors.primary} /> : to}</Text>
					</TextInput>
					<View style={styles.fieldActions}>
						<Pressable onPress={paste} hitSlop={8} style={styles.fieldAction} accessibilityRole="button" accessibilityLabel={t('crypto.wallet.send.paste')}>
							<FontAwesome6 name="paste" size={16} color={theme.colors.primary} iconStyle="solid" />
						</Pressable>
						<Pressable onPress={scan} hitSlop={8} style={styles.fieldAction} accessibilityRole="button" accessibilityLabel={t('crypto.wallet.send.scan')}>
							<FontAwesome6 name="qrcode" size={16} color={theme.colors.primary} iconStyle="solid" />
						</Pressable>
					</View>
				</View>
				<Text style={[textStyles.h6, styles.fieldError, { color: theme.colors.danger }]}>{toError ?? ' '}</Text>

				{/* Cantidad */}
				<View style={styles.amountHeader}>
					<Text style={[textStyles.h5, styles.label, { color: theme.colors.secondaryText }]}>{t('crypto.wallet.send.amountLabel')}</Text>
					<Text style={[textStyles.h6, { color: theme.colors.secondaryText }]}>
						{t('crypto.wallet.send.available', { amount: showBalance ? asset.amountLabel : '••••', symbol: asset.symbol })}
					</Text>
				</View>
				<View style={[styles.field, styles.amountField, { backgroundColor: theme.colors.surface }, !theme.isDark && { borderWidth: StyleSheet.hairlineWidth, borderColor: theme.colors.border }]}>
					<View style={styles.amountInput}>
						{/* Placeholder propio (no el nativo): iOS recorta `attributedPlaceholder` por
						    arriba con fuentes grandes. Mismo arreglo que QPAmountCard */}
						{!amount && <Text style={[styles.amountPlaceholder, amountTextStyle, { color: theme.colors.placeholder }]} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no">0</Text>}
						<TextInput
							style={[amountTextStyle, { color: theme.colors.primaryText, height: Math.ceil(theme.typography.fontSize.xxl * 1.5), paddingVertical: 0 }]}
							value={amount}
							onChangeText={onChangeAmount}
							keyboardType="decimal-pad"
							accessibilityLabel={t('crypto.wallet.send.amountLabel')}
						/>
					</View>
					{usdToggle ? (
						// La unidad ES el conmutador: tocar el tick alterna token ⇄ USD
						<Pressable onPress={toggleMode} hitSlop={8} style={[styles.unitToggle, { backgroundColor: theme.colors.primary + '12' }]} accessibilityRole="button" accessibilityLabel={t('crypto.wallet.send.switchUnit', { symbol: asset.symbol })} testID="wallet-send-toggle-unit">
							<Text style={[textStyles.h5, { color: theme.colors.primaryText }]}>{activeMode === 'usd' ? 'USD' : asset.symbol}</Text>
							<FontAwesome6 name="arrows-up-down" size={11} color={theme.colors.primary} iconStyle="solid" />
						</Pressable>
					) : (
						<Text style={[textStyles.h4, { color: theme.colors.secondaryText }]}>{asset.symbol}</Text>
					)}
					<Pressable onPress={setMax} hitSlop={8} style={[styles.max, { backgroundColor: theme.colors.primary + '18' }]} accessibilityRole="button">
						<Text style={{ color: theme.colors.primary, fontFamily: theme.typography.fontFamily.semiBold, fontSize: theme.typography.fontSize.xs }}>{t('crypto.wallet.send.max')}</Text>
					</Pressable>
				</View>
				<View style={styles.amountFooter}>
					<Text style={[textStyles.h6, { color: theme.colors.danger }]}>{amountError ?? ' '}</Text>
					<Text style={[textStyles.h6, { color: theme.colors.secondaryText }]}>
						{activeMode === 'usd'
							? `≈ ${amountUnits !== null && !amountError ? displayAmount(formatUnits(amountUnits, asset.decimals)) : '0'} ${asset.symbol}`
							: usd !== null ? `≈ ${formatUsd(usd)}` : ' '}
					</Text>
				</View>

			</ScrollView>

			{/* Fuera del scroll: siempre abajo, y sube con el teclado (KAV) */}
			<View style={styles.footer}>
				<QPButton title={t('crypto.wallet.send.continue')} onPress={goConfirm} disabled={!canContinue} />
			</View>
		</KeyboardAvoidingView>
	)
}

/** `AssetView.amount` ya viene normalizado por formatUnits: nunca lanza, pero el tipo de parseUnits sí. */
const parseUnitsSafe = (decimal: string, decimals: number): bigint => {
	try { return parseUnits(decimal, decimals) } catch { return 0n }
}

const styles = StyleSheet.create({
	pickerContent: { gap: 14, paddingBottom: 40 },
	card: { borderRadius: 14, paddingHorizontal: 12 },
	pickerRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
	pickerInfo: { flex: 1 },
	scroll: { flex: 1 },
	content: { paddingTop: 4, paddingBottom: 16 },
	footer: { paddingTop: 8, paddingBottom: 24 },
	assetChip: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8, paddingHorizontal: 14, borderRadius: 20, alignSelf: 'center', marginBottom: 18 },
	label: { marginBottom: 6 },
	// Fila centrada: con una línea el texto queda a la altura de los iconos, y si la
	// dirección parte en dos los iconos siguen al centro del bloque
	field: { flexDirection: 'row', alignItems: 'center', borderRadius: 12, paddingLeft: 14, paddingRight: 6, minHeight: 52, gap: 6 },
	// Padding explícito: el TextInput multiline de iOS mete su propio inset arriba y
	// descuadra la primera línea; lineHeight fijo para que una o dos líneas midan lo esperado
	input: { flex: 1, paddingTop: 14, paddingBottom: 14, lineHeight: 22, textAlignVertical: 'center' },
	fieldActions: { flexDirection: 'row', alignItems: 'center' },
	fieldAction: { width: 36, height: 40, alignItems: 'center', justifyContent: 'center' },
	fieldError: { minHeight: 18, marginTop: 4, marginBottom: 10 },
	amountHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
	amountField: { alignItems: 'center', paddingVertical: 10, paddingRight: 10 },
	amountInput: { flex: 1, minWidth: 60, justifyContent: 'center' },
	amountPlaceholder: { position: 'absolute', left: 0, right: 0 },
	max: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, marginLeft: 4 },
	unitToggle: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10, borderCurve: 'continuous' },
	amountFooter: { flexDirection: 'row', justifyContent: 'space-between', minHeight: 18, marginTop: 6 },
})

export default WalletSend
