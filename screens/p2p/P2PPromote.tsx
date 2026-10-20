import { useMemo, useState } from 'react'
import { View, Text, ScrollView, StyleSheet, ActivityIndicator } from 'react-native'
import { useTranslation } from 'react-i18next'
import FontAwesome6 from '@react-native-vector-icons/fontawesome6'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'

import { getDateLocale } from '../../i18n'
import { useTheme } from '../../theme/ThemeContext'
import { useContainerStyles, useTextStyles } from '../../theme/themeUtils'
import { useAuth } from '../../auth/AuthContext'
import useCoins from '../../hooks/useCoins'
import QPCoin from '../../ui/particles/QPCoin'
import QPPressable from '../../ui/particles/QPPressable'
import QPCoinPicker from '../../ui/QPCoinPicker'
import QPKeyboardAvoidingView from '../../ui/QPKeyboardAvoidingView'
import P2PConfirmModal from './P2PConfirmModal'
import P2PPromoSlotCard from './P2PPromoSlotCard'
import useP2PPromote from './useP2PPromote'
import { PROMO_OFFER_TYPES, defaultPromoCoin, promoTypeOf, promoUsd, slotFor } from './p2pPromo'

import type { RootStackParamList } from '../../types/navigation'
import type { Coin, P2PPromoMissing } from '../../types/domain'
import type { TFunction } from 'i18next'

type P2PPromoteProps = NativeStackScreenProps<RootStackParamList, 'P2PPromote'>

/** Requisito de reputación que falta, traducido (la `label` del servidor llega en español). */
const missingText = (m: P2PPromoMissing, t: TFunction) => {
	if (m.key === 'min_completed') return t('p2p.promo.requirements.minCompleted', { count: m.required })
	if (m.key === 'min_rating') return t('p2p.promo.requirements.minRating', { rating: Number(m.required).toFixed(1) })
	return m.label || m.key
}

/**
 * Puesto promocionado del mercado P2P (`GET`/`POST /p2p/promo`, guía de qpweb
 * `content/docs/p2p/promo.mdx`), calcado de `/p2p/promote` de la web: por moneda, un puesto
 * para Comprar (`sell`) y otro para Vender (`buy`). Libre ⇒ se compra al precio de salida
 * y es tuyo un periodo; ocupado ⇒ se puja por el periodo siguiente. Cada pago pasa por un
 * modal de confirmación con el importe exacto.
 *
 * Se llega desde la tarjeta dorada del mercado («¿Quieres este puesto?»), desde el aviso
 * de puesto libre, desde las pushes `p2p_promo_*` y desde /p2p/promote?coin=&type=.
 */
const P2PPromote = ({ route }: P2PPromoteProps) => {

	const { t } = useTranslation()
	const { theme } = useTheme()
	const textStyles = useTextStyles(theme)
	const containerStyles = useContainerStyles(theme)
	const { user } = useAuth()

	const { coins, isLoading: loadingCoins } = useCoins('p2p')
	const ticks = useMemo(() => coins.map(c => c.tick), [coins])
	const [picked, setPicked] = useState<string | null>(null)
	const [pickerOpen, setPickerOpen] = useState(false)
	const coin = picked ?? defaultPromoCoin(route.params?.coin, ticks)
	// El lado con el que se llegó solo se resalta mientras no se cambie de moneda
	const focusType = picked ? undefined : promoTypeOf(route.params?.type)
	const coinInfo = coins.find(c => c.tick === coin) ?? null

	const promo = useP2PPromote(coin)
	const { payload, query } = promo
	const firstSlot = slotFor(payload, 'sell') ?? slotFor(payload, 'buy')
	const days = firstSlot?.period_days ?? 30
	const requirements = payload?.rules?.requirements
	const reputation = [
		requirements?.min_completed ? t('p2p.promo.requirements.minCompleted', { count: requirements.min_completed }) : null,
		requirements?.min_rating ? t('p2p.promo.requirements.minRating', { rating: Number(requirements.min_rating).toFixed(1) }) : null,
	].filter(Boolean).join(t('p2p.promo.requirements.and'))
	const missing = (payload?.eligibility?.missing || []).map(m => missingText(m, t))
	const canP2P = !!user?.kyc && !!user?.p2p_enabled

	// Confirmación: el importe exacto y qué pasa con él
	const confirmSlot = promo.confirming ? slotFor(payload, promo.confirming) : null
	const confirmAmount = confirmSlot ? promoUsd(promo.priceOf(confirmSlot)) : ''
	const confirmSide = confirmSlot ? t(confirmSlot.offer_type === 'sell' ? 'p2p.common.buy' : 'p2p.common.sell') : ''
	const confirmBuy = confirmSlot?.state === 'free'
	const confirmStart = confirmSlot?.ends_at ? new Date(confirmSlot.ends_at).toLocaleDateString(getDateLocale(), { day: 'numeric', month: 'long' }) : ''

	return (
		<QPKeyboardAvoidingView style={containerStyles.subContainer}>
			<ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>

				<Text style={[textStyles.body, { color: theme.colors.secondaryText }]}>{t('p2p.promo.intro', { days })}</Text>

				<QPPressable
					testID="promo-coin"
					onPress={() => setPickerOpen(true)}
					style={[styles.coinRow, { backgroundColor: theme.colors.surface }, !theme.isDark && [styles.border, { borderColor: theme.colors.border }]]}
				>
					{coin ? <QPCoin coin={coinInfo?.logo || coin} size={28} /> : null}
					<View style={styles.fill}>
						<Text style={[textStyles.caption, { color: theme.colors.secondaryText }]}>{t('p2p.promo.coinLabel')}</Text>
						<Text style={[textStyles.h6, { color: theme.colors.primaryText }]} numberOfLines={1}>
							{coin ? `${coinInfo?.name || coin} (${coin})` : t('p2p.promo.pickCoin')}
						</Text>
					</View>
					<FontAwesome6 name="chevron-down" size={12} color={theme.colors.secondaryText} iconStyle="solid" />
				</QPPressable>

				{query.isLoading && <ActivityIndicator style={styles.loader} color={theme.colors.primary} />}

				{query.isError && !payload && (
					<View style={[styles.notice, { backgroundColor: theme.colors.surface }]}>
						<Text style={[textStyles.caption, { color: theme.colors.secondaryText }]}>{t('p2p.promo.loadError')}</Text>
						<QPPressable onPress={() => query.refetch()} variant="opacity" style={styles.retry}>
							<Text style={[textStyles.caption, { color: theme.colors.primary, fontFamily: theme.typography.fontFamily.semiBold }]}>{t('common.actions.retry')}</Text>
						</QPPressable>
					</View>
				)}

				{payload && !payload.enabled && (
					<View style={[styles.notice, { backgroundColor: theme.colors.surface }]}>
						<Text style={[textStyles.caption, { color: theme.colors.secondaryText }]}>{t('p2p.promo.disabled')}</Text>
					</View>
				)}

				{payload?.enabled && (
					<>
						{!canP2P ? (
							<Text style={[textStyles.caption, { color: theme.colors.warning }]}>{t('p2p.promo.needsP2P')}</Text>
						) : missing.length > 0 && (
							<Text testID="promo-missing" style={[textStyles.caption, { color: theme.colors.warning }]}>{t('p2p.promo.needsReputation', { list: missing.join(', ') })}</Text>
						)}

						{PROMO_OFFER_TYPES.map(type => {
							const slot = slotFor(payload, type)
							if (!slot) return null
							return (
								<P2PPromoSlotCard
									key={`${slot.coin}-${type}`}
									slot={slot}
									userUuid={user?.uuid}
									focused={focusType === type}
									bidText={promo.bidText(slot)}
									onChangeBid={(text) => promo.setBid(slot, text)}
									block={promo.blockOf(slot)}
									leadingMine={promo.leadingMine(type)}
									balance={promo.balance}
									loading={promo.submitting === type}
									onPress={() => promo.openConfirm(type)}
									theme={theme}
									textStyles={textStyles}
								/>
							)
						})}

						<View style={styles.how}>
							<Text style={[textStyles.h6, { color: theme.colors.primaryText }]}>{t('p2p.promo.how.title')}</Text>
							{[
								t('p2p.promo.how.free', { days }),
								t('p2p.promo.how.bid'),
								t('p2p.promo.how.refund'),
								t('p2p.promo.how.rollover'),
								t('p2p.promo.how.offer'),
								...(reputation ? [t('p2p.promo.how.reputation', { list: reputation })] : []),
								...(payload.rules?.max_rate_gap_pct != null ? [t('p2p.promo.how.rate', { pct: payload.rules.max_rate_gap_pct, hours: payload.rules.market_window_hours })] : []),
							].map(line => (
								<View key={line} style={styles.bullet}>
									<Text style={[textStyles.caption, { color: theme.colors.secondaryText }]}>•</Text>
									<Text style={[textStyles.caption, styles.fill, { color: theme.colors.secondaryText }]}>{line}</Text>
								</View>
							))}
						</View>
					</>
				)}
			</ScrollView>

			<P2PConfirmModal
				visible={!!confirmSlot}
				onClose={promo.closeConfirm}
				onConfirm={promo.submit}
				loading={!!promo.submitting}
				icon="star"
				iconColor={theme.colors.gold}
				title={confirmBuy ? t('p2p.promo.confirm.buyTitle') : t('p2p.promo.confirm.bidTitle')}
				body={confirmBuy
					? t('p2p.promo.confirm.buyBody', { amount: confirmAmount, coin, side: confirmSide, days })
					: t('p2p.promo.confirm.bidBody', { amount: confirmAmount, date: confirmStart })}
				confirmLabel={t('p2p.promo.confirm.label', { amount: confirmAmount })}
				confirmBg={theme.colors.primary}
				confirmTextColor={theme.colors.almostWhite}
				theme={theme}
				textStyles={textStyles}
				containerStyles={containerStyles}
			/>

			<QPCoinPicker
				visible={pickerOpen}
				onClose={() => setPickerOpen(false)}
				onSelect={(c: Coin) => { setPicked(c.tick); setPickerOpen(false) }}
				coins={coins}
				selectedCoin={coinInfo}
				isLoading={loadingCoins}
				showFees={false}
			/>
		</QPKeyboardAvoidingView>
	)
}

const styles = StyleSheet.create({
	content: { paddingTop: 8, paddingBottom: 32, gap: 14 },
	fill: { flex: 1 },
	border: { borderWidth: 1 },
	coinRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 16, borderCurve: 'continuous' },
	loader: { marginVertical: 24 },
	notice: { padding: 14, borderRadius: 12, gap: 8 },
	retry: { alignSelf: 'flex-start' },
	how: { marginTop: 8, gap: 6 },
	bullet: { flexDirection: 'row', gap: 8 },
})

export default P2PPromote
