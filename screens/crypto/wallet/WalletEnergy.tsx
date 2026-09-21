import { useCallback, useEffect, useMemo, useState } from 'react'
import { ScrollView, StyleSheet, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import FontAwesome6 from '@react-native-vector-icons/fontawesome6'

// Theme
import { useTheme } from '../../../theme/ThemeContext'
import type { Theme } from '../../../theme/ThemeContext'
import { useContainerStyles, useTextStyles } from '../../../theme/themeUtils'

// Auth
import { useAuth } from '../../../auth/AuthContext'

// Wallet
import { useWallet } from '../../../wallet/WalletContext'
import { addressForKind } from '../../../wallet/assets'
import { getAppRpcRouter } from '../../../wallet/registry/appRpcRouter'
import { isValidTronAddress, tronAccountExists, TRON_TX_RPC } from '../../../wallet/tron/tx'
import { ENERGY_MAX_VOLUME, ENERGY_MIN_VOLUME, ENERGY_PRESETS } from '../../../wallet/tron/energy'
import { useTronResourcesQuery } from './walletQueries'
import { estimatePrice, flattenOrders, useEnergyOrdersQuery, useEnergyPricesQuery } from './energyQueries'
import { clearPendingOrder, readPendingOrder } from './energyPending'
import { isTerminalOrder } from './energyRentMachine'
import { energyApi } from '../../../api/energyApi'
import { formatUsd, shortAddress } from './walletFormat'

// UI
import QPButton from '../../../ui/particles/QPButton'
import QPInput from '../../../ui/particles/QPInput'
import QPPressable from '../../../ui/particles/QPPressable'
import { createHiddenRefreshControl } from '../../../ui/QPRefreshIndicator'
import ResourceGauge from './components/ResourceGauge'
import EnergyRentModal from './components/EnergyRentModal'
import EnergyOrderRow from './components/EnergyOrderRow'

// Navigation
import { ROUTES } from '../../../routes'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import type { RootStackParamList } from '../../../types/navigation'
import type { EnergyDuration, EnergyOrder } from '../../../types/domain'

type Props = NativeStackScreenProps<RootStackParamList, 'WalletEnergy'>

type AmountChoice = 'usdt_known' | 'usdt_new' | 'custom'

const AMOUNT_BY_CHOICE: Record<Exclude<AmountChoice, 'custom'>, number> = {
	usdt_known: ENERGY_PRESETS[0],
	usdt_new: ENERGY_PRESETS[1],
}

const RECENT_ORDERS = 5

/**
 * Energía y ancho de banda de la cuenta TRON de la wallet, y compra de
 * energía cobrada del saldo QvaPay.
 *
 * Los medidores son lectura on-chain pura: funcionan siempre, aunque el
 * alquiler esté caído. El bloque de compra depende de la tabla de precios y
 * desaparece entero si el backend no la sirve — un botón muerto es peor que
 * ningún botón.
 */
const WalletEnergy = ({ navigation, route }: Props) => {

	const { t } = useTranslation()
	const { theme } = useTheme()
	const textStyles = useTextStyles(theme)
	const containerStyles = useContainerStyles(theme)
	const { user } = useAuth()
	const { addresses } = useWallet()

	const selfAddress = addresses ? addressForKind(addresses, 'tron') : ''
	const resources = useTronResourcesQuery(selfAddress)
	const prices = useEnergyPricesQuery()
	const rows = prices.data?.data
	const canBuy = !!rows?.length

	/**
	 * Las dos bolsas de ancho de banda NO suman: una de ellas tiene que cubrir
	 * la transacción entera o se quema TRX igual (ver `computeTronBurnBreakdown`).
	 * Enseñar 300 + 300 como "600 disponibles" haría que el medidor contradijera
	 * al aviso del envío para una transferencia de 350 bytes.
	 */
	const bandwidth = useMemo(() => {
		const free = resources.data?.freeBandwidth ?? 0n
		const staked = resources.data?.stakedBandwidth ?? 0n
		const usable = free >= staked ? 'free' : 'staked'
		return usable === 'free'
			? { available: free, total: resources.data?.freeBandwidthLimit ?? 0n }
			: { available: staked, total: resources.data?.stakedBandwidthLimit ?? 0n }
	}, [resources.data])

	const minVolume = prices.data?.meta?.min_volume ?? ENERGY_MIN_VOLUME
	const maxVolume = prices.data?.meta?.max_volume ?? ENERGY_MAX_VOLUME
	const durations = prices.data?.meta?.durations ?? (['1h', '1d', '3d', '7d'] as EnergyDuration[])

	// --- Qué se compra ------------------------------------------------------

	const [choice, setChoice] = useState<AmountChoice>('usdt_known')
	const [customVolume, setCustomVolume] = useState('')
	const [duration, setDuration] = useState<EnergyDuration>(route.params?.duration ?? '1h')
	const [useOther, setUseOther] = useState(!!route.params?.address)
	const [otherAddress, setOtherAddress] = useState(route.params?.address ?? '')
	const [modalOpen, setModalOpen] = useState(false)

	const volume = choice === 'custom' ? Math.trunc(Number(customVolume) || 0) : AMOUNT_BY_CHOICE[choice]
	const volumeValid = Number.isInteger(volume) && volume >= minVolume && volume <= maxVolume
	const target = useOther ? otherAddress.trim() : selfAddress
	const targetValid = isValidTronAddress(target)
	const priceUsd = volumeValid ? estimatePrice(rows, volume, duration) : null
	const enoughBalance = typeof priceUsd !== 'number' || Number(user?.balance || 0) >= priceUsd

	// Una dirección que nunca recibió nada no existe en TRON y no admite
	// delegaciones: se comprueba antes de cobrar, no después del 400
	const activation = useQuery({
		queryKey: ['wallet', 'tron', 'exists', target],
		queryFn: () => getAppRpcRouter().call('tron', (rpc, signal) => tronAccountExists(rpc, target, { signal }), { accept: TRON_TX_RPC }),
		enabled: useOther && targetValid,
		staleTime: 5 * 60_000,
		meta: { noPersist: true },
	})
	const targetInactive = useOther && targetValid && activation.data === false

	const ready = canBuy && volumeValid && targetValid && !targetInactive && enoughBalance && typeof priceUsd === 'number'

	// --- Órdenes ------------------------------------------------------------

	const orders = useEnergyOrdersQuery()
	const recent = useMemo(() => flattenOrders(orders.data?.pages).slice(0, RECENT_ORDERS), [orders.data])
	const pending = usePendingOrder()

	const onRented = useCallback(() => { resources.refetch(); orders.refetch() }, [resources, orders])
	const seeOrders = useCallback(() => { setModalOpen(false); navigation.navigate(ROUTES.WALLET_ENERGY_ORDERS) }, [navigation])

	const onRefresh = useCallback(() => { resources.refetch(); prices.refetch(); orders.refetch() }, [resources, prices, orders])

	return (
		<ScrollView
			style={containerStyles.subContainer}
			contentContainerStyle={styles.content}
			showsVerticalScrollIndicator={false}
			refreshControl={createHiddenRefreshControl(false, onRefresh)}
		>

			<View style={styles.gauges}>
				<ResourceGauge
					label={t('crypto.energy.resources.energy')}
					icon="bolt"
					tint={theme.colors.warning}
					available={resources.data?.energy ?? 0n}
					total={resources.data?.energyLimit ?? 0n}
					totalLabel={t('crypto.energy.resources.ofTotal', { total: (resources.data?.energyLimit ?? 0n).toLocaleString() })}
				/>
				<ResourceGauge
					label={t('crypto.energy.resources.bandwidth')}
					icon="gauge-high"
					tint={theme.colors.primary}
					available={bandwidth.available}
					total={bandwidth.total}
					totalLabel={t('crypto.energy.resources.ofTotal', { total: bandwidth.total.toLocaleString() })}
				/>
			</View>

			<Text style={[textStyles.caption, styles.explainer, { color: theme.colors.secondaryText }]}>{t('crypto.energy.resources.explainer')}</Text>

			{resources.isError && !resources.data && (
				<Notice theme={theme} icon="triangle-exclamation" color={theme.colors.danger} text={t('crypto.energy.resources.error')} />
			)}

			{!!pending && (
				<Notice theme={theme} icon="clock" color={theme.colors.primary} text={t('crypto.energy.orders.pendingBanner')} onPress={seeOrders} />
			)}

			{!canBuy ? (
				<Notice theme={theme} icon="circle-info" color={theme.colors.secondaryText} text={t('crypto.energy.buy.unavailable')} />
			) : (
				<>
					<Section title={t('crypto.energy.buy.amount')} theme={theme} />
					<View style={styles.choices}>
						{(['usdt_known', 'usdt_new'] as const).map(key => (
							<AmountCard
								key={key}
								theme={theme}
								selected={choice === key}
								title={t(`crypto.energy.buy.presets.${key}`)}
								detail={t(`crypto.energy.buy.presets.${key}Detail`)}
								volume={AMOUNT_BY_CHOICE[key].toLocaleString()}
								price={estimatePrice(rows, AMOUNT_BY_CHOICE[key], duration)}
								onPress={() => setChoice(key)}
							/>
						))}
						<AmountCard
							theme={theme}
							selected={choice === 'custom'}
							title={t('crypto.energy.buy.custom')}
							detail={t('crypto.energy.buy.customHint', { min: minVolume.toLocaleString(), max: maxVolume.toLocaleString() })}
							volume={choice === 'custom' && volumeValid ? volume.toLocaleString() : ''}
							price={choice === 'custom' ? priceUsd : null}
							onPress={() => setChoice('custom')}
						/>
					</View>

					{choice === 'custom' && (
						<QPInput
							value={customVolume}
							onChangeText={setCustomVolume}
							keyboardType="number-pad"
							placeholder={String(minVolume)}
							prefixIconName="bolt"
						/>
					)}
					{choice === 'custom' && customVolume.length > 0 && !volumeValid && (
						<Text style={[textStyles.caption, { color: theme.colors.danger }]}>
							{t('crypto.energy.buy.customInvalid', { min: minVolume.toLocaleString(), max: maxVolume.toLocaleString() })}
						</Text>
					)}

					<Section title={t('crypto.energy.buy.duration')} theme={theme} />
					<View style={styles.chips}>
						{durations.map(value => (
							<Chip key={value} theme={theme} selected={duration === value} label={t(`crypto.energy.buy.durations.${value}`)} onPress={() => setDuration(value)} />
						))}
					</View>
					<Text style={[textStyles.caption, { color: theme.colors.tertiaryText }]}>{t('crypto.energy.buy.durationHint')}</Text>

					<Section title={t('crypto.energy.buy.target')} theme={theme} />
					<View style={styles.chips}>
						<Chip theme={theme} selected={!useOther} label={t('crypto.energy.buy.targetSelf')} onPress={() => setUseOther(false)} />
						<Chip theme={theme} selected={useOther} label={t('crypto.energy.buy.targetOther')} onPress={() => setUseOther(true)} />
					</View>
					{useOther ? (
						<QPInput
							value={otherAddress}
							onChangeText={setOtherAddress}
							placeholder={t('crypto.energy.buy.targetPlaceholder')}
							autoCapitalize="none"
							autoCorrect={false}
							prefixIconName="wallet"
						/>
					) : (
						<Text style={[textStyles.caption, { color: theme.colors.secondaryText }]}>{shortAddress(selfAddress, 10, 10)}</Text>
					)}
					{useOther && otherAddress.trim().length > 0 && !targetValid && (
						<Text style={[textStyles.caption, { color: theme.colors.danger }]}>{t('crypto.energy.buy.invalidAddress')}</Text>
					)}
					{targetInactive && (
						<Text style={[textStyles.caption, { color: theme.colors.danger }]}>{t('crypto.energy.buy.inactiveAddress')}</Text>
					)}
					<Text style={[textStyles.caption, { color: theme.colors.tertiaryText }]}>{t('crypto.energy.buy.targetHint')}</Text>

					{!enoughBalance && (
						<Notice theme={theme} icon="triangle-exclamation" color={theme.colors.danger} text={t('crypto.energy.errors.INSUFFICIENT_BALANCE')} />
					)}

					<QPButton
						title={typeof priceUsd === 'number' ? `${t('crypto.energy.buy.cta')} · ${formatUsd(priceUsd)}` : t('crypto.energy.buy.cta')}
						onPress={() => setModalOpen(true)}
						disabled={!ready}
						style={styles.cta}
					/>
				</>
			)}

			<View style={styles.ordersHead}>
				<Text style={[textStyles.caption, { color: theme.colors.secondaryText }]}>{t('crypto.energy.orders.recent').toUpperCase()}</Text>
				{recent.length > 0 && (
					<QPPressable onPress={seeOrders} accessibilityRole="button">
						<Text style={[textStyles.caption, { color: theme.colors.primary }]}>{t('crypto.energy.orders.seeAll')}</Text>
					</QPPressable>
				)}
			</View>
			{recent.length === 0 ? (
				<Text style={[textStyles.caption, { color: theme.colors.tertiaryText }]}>{t('crypto.energy.orders.empty')}</Text>
			) : (
				recent.map(order => <EnergyOrderRow key={order.uuid} order={order} />)
			)}

			<EnergyRentModal
				visible={modalOpen}
				targetAddress={target}
				volume={volume}
				duration={duration}
				estimatedUsd={priceUsd}
				freezePrice
				onClose={() => setModalOpen(false)}
				onRented={onRented}
				onSeeOrders={seeOrders}
			/>
		</ScrollView>
	)
}

/**
 * La orden que quedó en curso al cerrarse la app. Se consulta una vez al
 * entrar: si ya cerró, la nota se borra; si sigue viva, se avisa en vez de
 * dejar que el usuario compre otra creyendo que la primera se perdió.
 */
const usePendingOrder = (): EnergyOrder | null => {

	const [order, setOrder] = useState<EnergyOrder | null>(null)

	useEffect(() => {
		let cancelled = false
		readPendingOrder().then(async pending => {
			if (!pending || cancelled) { return }
			const result = await energyApi.order(pending.uuid)
			if (cancelled) { return }
			const fresh = result.success ? result.data?.data ?? null : null
			if (!fresh) { return }
			if (isTerminalOrder(fresh)) { clearPendingOrder(); return }
			setOrder(fresh)
		})
		return () => { cancelled = true }
	}, [])

	return order
}

const Section = ({ title, theme }: { title: string, theme: Theme }) => (
	<Text style={{ color: theme.colors.secondaryText, fontFamily: theme.typography.fontFamily.medium, fontSize: theme.typography.fontSize.xs, letterSpacing: 0.6, marginTop: 10 }}>
		{title.toUpperCase()}
	</Text>
)

const Chip = ({ theme, selected, label, onPress }: { theme: Theme, selected: boolean, label: string, onPress: () => void }) => (
	<QPPressable
		onPress={onPress}
		accessibilityRole="button"
		accessibilityState={{ selected }}
		style={[styles.chip, selected ? { backgroundColor: theme.colors.primary } : { backgroundColor: 'transparent', borderWidth: StyleSheet.hairlineWidth, borderColor: theme.colors.border }]}
	>
		<Text style={{ color: selected ? theme.colors.buttonText : theme.colors.primaryText, fontFamily: theme.typography.fontFamily.medium, fontSize: theme.typography.fontSize.xs }}>{label}</Text>
	</QPPressable>
)

const AmountCard = ({ theme, selected, title, detail, volume, price, onPress }: {
	theme: Theme, selected: boolean, title: string, detail: string, volume: string, price: number | null, onPress: () => void
}) => (
	<QPPressable
		onPress={onPress}
		accessibilityRole="button"
		accessibilityState={{ selected }}
		style={[
			styles.amountCard,
			{ backgroundColor: theme.colors.surface },
			selected ? { borderWidth: 1.5, borderColor: theme.colors.primary } : !theme.isDark && { borderWidth: StyleSheet.hairlineWidth, borderColor: theme.colors.border },
		]}
	>
		<View style={styles.amountHead}>
			<Text style={{ color: theme.colors.primaryText, fontFamily: theme.typography.fontFamily.medium, fontSize: theme.typography.fontSize.sm, flex: 1 }}>{title}</Text>
			{typeof price === 'number' && (
				<Text style={{ color: theme.colors.primaryText, fontFamily: theme.typography.fontFamily.semiBold, fontSize: theme.typography.fontSize.sm }}>{formatUsd(price)}</Text>
			)}
		</View>
		<Text style={{ color: theme.colors.tertiaryText, fontFamily: theme.typography.fontFamily.regular, fontSize: theme.typography.fontSize.xs }}>{detail}</Text>
		{!!volume && <Text style={{ color: theme.colors.secondaryText, fontFamily: theme.typography.fontFamily.regular, fontSize: theme.typography.fontSize.xs }}>{volume}</Text>}
	</QPPressable>
)

const Notice = ({ theme, icon, color, text, onPress }: { theme: Theme, icon: 'circle-info' | 'triangle-exclamation' | 'clock', color: string, text: string, onPress?: () => void }) => {
	const body = (
		<View style={[styles.notice, { backgroundColor: color + '12' }]}>
			<FontAwesome6 name={icon} size={14} color={color} iconStyle="solid" style={styles.noticeIcon} />
			<Text style={[styles.noticeText, { color: theme.colors.primaryText, fontFamily: theme.typography.fontFamily.regular, fontSize: theme.typography.fontSize.sm }]}>{text}</Text>
		</View>
	)
	return onPress ? <QPPressable onPress={onPress} accessibilityRole="button">{body}</QPPressable> : body
}

const styles = StyleSheet.create({
	content: { gap: 10, paddingTop: 8, paddingBottom: 32 },
	gauges: { flexDirection: 'row', gap: 10 },
	explainer: { lineHeight: 18 },
	choices: { gap: 8 },
	amountCard: { borderRadius: 14, borderCurve: 'continuous', padding: 14, gap: 3 },
	amountHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
	chips: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
	chip: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: 999 },
	cta: { marginTop: 12 },
	ordersHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 22 },
	notice: { flexDirection: 'row', gap: 10, padding: 12, borderRadius: 12, alignItems: 'flex-start' },
	noticeIcon: { marginTop: 2 },
	noticeText: { flex: 1 },
})

export default WalletEnergy
