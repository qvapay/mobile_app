import { useCallback, useEffect, useMemo, useRef } from 'react'
import { Linking, ScrollView, StyleSheet, Text, View } from 'react-native'
import Clipboard from '@react-native-clipboard/clipboard'
import { useTranslation } from 'react-i18next'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner-native'
import FontAwesome6 from '@react-native-vector-icons/fontawesome6'

// Theme
import { useTheme } from '../../../theme/ThemeContext'
import { useContainerStyles, useTextStyles } from '../../../theme/themeUtils'

// Wallet
import { explorerTxUrl } from '../../../wallet/assets'
import { useEffectiveRegistry } from '../../../wallet/registry/appRpcRouter'
import { refreshHistoryAfterSend, useWalletAssets, WALLET_BALANCES_KEY } from './walletQueries'
import { shortAddress } from './walletFormat'
import { useExchangeOrderQuery } from './exchangeQueries'
import { depositAmountLabel, deviationBps, isDeviationNotable, isLive, phaseOf, stepsFor } from './exchangeModel'
import type { ExchangePhase } from './exchangeModel'

// UI
import QPButton from '../../../ui/particles/QPButton'
import QPPressable from '../../../ui/particles/QPPressable'

// Navigation
import { ROUTES } from '../../../routes'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import type { RootStackParamList } from '../../../types/navigation'

type Props = NativeStackScreenProps<RootStackParamList, 'WalletExchangeStatus'>

const ICON: Record<ExchangePhase, { name: 'arrow-up-from-bracket' | 'arrows-rotate' | 'circle-check' | 'rotate-left' | 'triangle-exclamation', tone: 'primary' | 'success' | 'warning' }> = {
	deposit: { name: 'arrow-up-from-bracket', tone: 'primary' },
	working: { name: 'arrows-rotate', tone: 'primary' },
	done: { name: 'circle-check', tone: 'success' },
	returned: { name: 'rotate-left', tone: 'warning' },
	problem: { name: 'triangle-exclamation', tone: 'warning' },
}

/**
 * Seguimiento de un intercambio cripto↔cripto.
 *
 * Es la respuesta a "¿dónde está mi dinero?". Durante unos minutos los fondos no están ni en
 * la wallet del usuario ni en QvaPay, sino en el proveedor, y esta pantalla lo dice con su
 * nombre en vez de disimularlo. El sondeo lo lleva `useExchangeOrderQuery`, que deja de
 * preguntar en cuanto la operación es terminal.
 *
 * Mientras está en `awaiting_deposit` la pantalla es, sobre todo, la dirección de depósito y
 * el IMPORTE EXACTO: enviar de más o de menos dispara recotización o devolución del
 * proveedor, así que el importe se copia de aquí, no se teclea.
 */
const WalletExchangeStatus = ({ navigation, route }: Props) => {

	const { uuid } = route.params
	const { t } = useTranslation()
	const { theme } = useTheme()
	const textStyles = useTextStyles(theme)
	const containerStyles = useContainerStyles(theme)
	const queryClient = useQueryClient()
	const registry = useEffectiveRegistry()
	const { all } = useWalletAssets()

	const query = useExchangeOrderQuery(uuid)
	const order = query.data ?? null

	const fromAsset = useMemo(() => all.find(a => a.id === order?.from_asset), [all, order?.from_asset])
	const toAsset = useMemo(() => all.find(a => a.id === order?.to_asset), [all, order?.to_asset])

	// Al completarse: los saldos on-chain de AMBOS lados cambiaron, y el historial del activo
	// de destino tiene una entrada nueva que el indexador acaba de ver.
	const settledRef = useRef<string | null>(null)
	useEffect(() => {
		if (!order || isLive(order.status) || settledRef.current === order.uuid) { return }
		settledRef.current = order.uuid
		queryClient.invalidateQueries({ queryKey: WALLET_BALANCES_KEY })
		if (toAsset) { refreshHistoryAfterSend(queryClient, toAsset.id) }
	}, [order, toAsset, queryClient])

	const copy = useCallback((value: string) => {
		Clipboard.setString(value)
		toast.success(t('crypto.wallet.exchange.copied'))
	}, [t])

	const phase = order ? phaseOf(order.status) : 'working'
	const icon = ICON[phase]
	const tone = icon.tone === 'success' ? theme.colors.success : icon.tone === 'warning' ? theme.colors.warning : theme.colors.primary

	const exactAmount = order && fromAsset ? depositAmountLabel(order, fromAsset.decimals) : order?.amount_in ?? ''
	const deviation = order ? (order.deviation_bps ?? deviationBps(order)) : null

	const openSend = useCallback(() => {
		if (!order?.deposit_address || !fromAsset) { return }
		navigation.navigate(ROUTES.WALLET_SEND_CONFIRM, {
			assetId: order.from_asset,
			to: order.deposit_address,
			amount: exactAmount,
			exchangeUuid: order.uuid,
		})
	}, [navigation, order, fromAsset, exactAmount])

	const card = [styles.card, { backgroundColor: theme.colors.surface }, !theme.isDark && { borderWidth: StyleSheet.hairlineWidth, borderColor: theme.colors.border }]

	return (
		<ScrollView style={containerStyles.subContainer} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>

			<View style={styles.hero}>
				<View style={[styles.iconWrap, { backgroundColor: tone + '18' }]}>
					<FontAwesome6 name={icon.name} size={28} color={tone} iconStyle="solid" />
				</View>
				<Text style={[textStyles.h2, { color: theme.colors.primaryText }]}>
					{order ? t(`crypto.wallet.exchange.status.${order.status}`) : '…'}
				</Text>
				{!!order && (
					<Text style={[textStyles.h5, styles.hint, { color: theme.colors.secondaryText }]}>
						{t(`crypto.wallet.exchange.hint.${order.status}`)}
					</Text>
				)}
			</View>

			{!!order && <Steps order={order} theme={theme} />}

			{/* Lo que hay que hacer AHORA: el importe exacto y la dirección */}
			{!!order && order.status === 'awaiting_deposit' && !!order.deposit_address && (
				<View style={card}>
					<Text style={[textStyles.h4, styles.cardTitle, { color: theme.colors.primaryText }]}>{t('crypto.wallet.exchange.depositTitle')}</Text>

					<CopyRow
						theme={theme}
						label={t('crypto.wallet.exchange.depositAmount')}
						value={`${exactAmount} ${fromAsset?.symbol ?? ''}`.trim()}
						onCopy={() => copy(exactAmount)}
					/>
					<CopyRow
						theme={theme}
						label={t('crypto.wallet.exchange.depositAddress')}
						value={shortAddress(order.deposit_address, 10, 10)}
						onCopy={() => copy(order.deposit_address!)}
					/>

					<Text style={[styles.warning, { color: theme.colors.warning }]}>
						{t('crypto.wallet.exchange.depositWarning', { chain: fromAsset?.chainName ?? '' })}
					</Text>
				</View>
			)}

			{!!order && (
				<View style={card}>
					<Row theme={theme} label={t('crypto.wallet.exchange.youSend')} value={`${exactAmount} ${fromAsset?.symbol ?? ''}`.trim()} />
					<Row
						theme={theme}
						label={t('crypto.wallet.exchange.youReceive')}
						value={`${order.actual_out ?? order.expected_out ?? '—'} ${toAsset?.symbol ?? ''}`.trim()}
						hint={order.actual_out ? undefined : t('crypto.wallet.exchange.estimated')}
					/>
					<Row theme={theme} label={t('crypto.wallet.exchange.providerLabel')} value={order.provider_label} />
					<Row theme={theme} label={t('crypto.wallet.exchange.refundLabel')} value={shortAddress(order.refund_address)} />
				</View>
			)}

			{/* La tasa es flotante: una desviación grande se cuenta, no se esconde */}
			{isDeviationNotable(deviation) && (
				<Text style={[styles.notice, { color: theme.colors.secondaryText }]}>
					{t(deviation! < 0 ? 'crypto.wallet.exchange.deviationLess' : 'crypto.wallet.exchange.deviationMore', { percent: Math.abs(deviation! / 100).toFixed(1) })}
				</Text>
			)}

			{/* Quién tiene el dinero mientras tanto, dicho con su nombre */}
			{!!order && isLive(order.status) && (
				<Text style={[styles.notice, { color: theme.colors.secondaryText }]}>
					{t('crypto.wallet.exchange.custodyNotice', { provider: order.provider_label })}
				</Text>
			)}

			{/* Las dos pruebas on-chain. El enlace sale del registry, que es donde viven las URLs */}
			{!!order && (!!order.payin_hash || !!order.payout_hash) && (
				<View style={card}>
					{!!order.payin_hash && <TxRow theme={theme} label={t('crypto.wallet.exchange.payinTx')} hash={order.payin_hash} url={explorerTxUrl(registry.chains[order.from_asset.split(':')[0]], order.payin_hash)} />}
					{!!order.payout_hash && <TxRow theme={theme} label={t('crypto.wallet.exchange.payoutTx')} hash={order.payout_hash} url={explorerTxUrl(registry.chains[order.to_asset.split(':')[0]], order.payout_hash)} />}
				</View>
			)}

			<View style={styles.spacer} />

			<View style={styles.actions}>
				{order?.status === 'awaiting_deposit' && !!order.deposit_address && (
					<QPButton title={t('crypto.wallet.exchange.sendNow')} onPress={openSend} />
				)}
				<QPButton title={t('crypto.wallet.exchange.done')} onPress={() => navigation.popToTop()} outlined={order?.status === 'awaiting_deposit'} />
			</View>
		</ScrollView>
	)
}

/**
 * Cuatro pasos, no tres: en cross-chain hay DOS confirmaciones on-chain —la del envío del
 * usuario y la del pago del proveedor— y enseñarlas por separado es lo que hace que la
 * espera se entienda en vez de parecer que no pasa nada.
 */
const Steps = ({ order, theme }: { order: NonNullable<ReturnType<typeof useExchangeOrderQuery>['data']>, theme: ReturnType<typeof useTheme>['theme'] }) => {
	const { t } = useTranslation()
	const steps = stepsFor(order)
	return (
		<View style={[styles.card, styles.steps, { backgroundColor: theme.colors.surface }, !theme.isDark && { borderWidth: StyleSheet.hairlineWidth, borderColor: theme.colors.border }]}>
			{steps.map((step, index) => {
				const color = step.done ? theme.colors.success : step.current ? theme.colors.primary : theme.colors.secondaryText
				return (
					<View key={step.key} style={styles.step}>
						<View style={[styles.dot, { backgroundColor: step.done || step.current ? color : 'transparent', borderColor: color }]} />
						<Text style={[styles.stepLabel, { color, fontFamily: theme.typography.fontFamily.medium, fontSize: theme.typography.fontSize.xs }]} numberOfLines={1}>
							{t(`crypto.wallet.exchange.steps.${step.key}`)}
						</Text>
						{index < steps.length - 1 && <View style={[styles.line, { backgroundColor: steps[index + 1].done ? theme.colors.success : theme.colors.border }]} />}
					</View>
				)
			})}
		</View>
	)
}

const Row = ({ theme, label, value, hint }: { theme: ReturnType<typeof useTheme>['theme'], label: string, value: string, hint?: string }) => (
	<View style={styles.row}>
		<Text style={{ color: theme.colors.secondaryText, fontFamily: theme.typography.fontFamily.regular, fontSize: theme.typography.fontSize.sm }}>{label}</Text>
		<Text style={[styles.rowValue, { color: theme.colors.primaryText, fontFamily: theme.typography.fontFamily.medium, fontSize: theme.typography.fontSize.sm }]} numberOfLines={1}>
			{value}{hint ? ` · ${hint}` : ''}
		</Text>
	</View>
)

const CopyRow = ({ theme, label, value, onCopy }: { theme: ReturnType<typeof useTheme>['theme'], label: string, value: string, onCopy: () => void }) => (
	<QPPressable onPress={onCopy} style={styles.row} accessibilityRole="button" accessibilityLabel={label}>
		<Text style={{ color: theme.colors.secondaryText, fontFamily: theme.typography.fontFamily.regular, fontSize: theme.typography.fontSize.sm }}>{label}</Text>
		<View style={styles.copyValue}>
			<Text style={[styles.rowValue, { color: theme.colors.primaryText, fontFamily: theme.typography.fontFamily.medium, fontSize: theme.typography.fontSize.sm }]} numberOfLines={1}>{value}</Text>
			<FontAwesome6 name="copy" size={13} color={theme.colors.primary} iconStyle="regular" />
		</View>
	</QPPressable>
)

const TxRow = ({ theme, label, hash, url }: { theme: ReturnType<typeof useTheme>['theme'], label: string, hash: string, url: string | null }) => (
	<QPPressable onPress={() => { if (url) Linking.openURL(url) }} style={styles.row} accessibilityRole="link" disabled={!url}>
		<Text style={{ color: theme.colors.secondaryText, fontFamily: theme.typography.fontFamily.regular, fontSize: theme.typography.fontSize.sm }}>{label}</Text>
		<Text style={[styles.rowValue, { color: url ? theme.colors.primary : theme.colors.primaryText, fontFamily: theme.typography.fontFamily.medium, fontSize: theme.typography.fontSize.sm }]} numberOfLines={1}>
			{shortAddress(hash, 8, 8)}
		</Text>
	</QPPressable>
)

const styles = StyleSheet.create({
	content: { paddingTop: 8, paddingBottom: 16, gap: 12, flexGrow: 1 },
	hero: { alignItems: 'center', gap: 8, paddingVertical: 12 },
	iconWrap: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center' },
	hint: { textAlign: 'center', paddingHorizontal: 12 },
	card: { borderRadius: 16, borderCurve: 'continuous', padding: 14, gap: 4 },
	cardTitle: { marginBottom: 4 },
	steps: { flexDirection: 'row', paddingVertical: 16 },
	step: { flex: 1, alignItems: 'center' },
	stepLabel: { marginTop: 6, textAlign: 'center' },
	dot: { width: 14, height: 14, borderRadius: 7, borderWidth: 2 },
	// La línea une este paso con el siguiente: arranca en el centro del punto y va a la mitad del hueco
	line: { position: 'absolute', height: 2, top: 6, left: '50%', right: '-50%', zIndex: -1 },
	row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingVertical: 7 },
	rowValue: { flexShrink: 1, textAlign: 'right' },
	copyValue: { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1 },
	warning: { fontSize: 12, lineHeight: 17, marginTop: 8 },
	notice: { fontSize: 12, lineHeight: 17, textAlign: 'center', paddingHorizontal: 12 },
	spacer: { flex: 1, minHeight: 8 },
	actions: { gap: 10, paddingBottom: 24 },
})

export default WalletExchangeStatus
