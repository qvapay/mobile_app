import { View, Text, StyleSheet } from 'react-native'
import { useTranslation } from 'react-i18next'

import { getDateLocale } from '../../i18n'
import QPButton from '../../ui/particles/QPButton'
import QPInput from '../../ui/particles/QPInput'
import { sanitizeAmountInput } from '../../helpers/amountInput'
import { promoUsd, slotStatus } from './p2pPromo'

import type { Theme } from '../../theme/ThemeContext'
import type { TextStyles } from '../../theme/themeUtils'
import type { P2PPromoSlot } from '../../types/domain'
import type { PromoBlock } from './p2pPromo'

type P2PPromoSlotCardProps = {
	slot: P2PPromoSlot
	userUuid: string | null | undefined
	/** Lado con el que se llegó (push, deep link, enlace del mercado): borde dorado. */
	focused: boolean
	bidText: string
	onChangeBid: (text: string) => void
	block: PromoBlock
	/** Ya tengo la puja más alta por el periodo siguiente (recordado en la sesión). */
	leadingMine: boolean
	balance: number
	loading: boolean
	onPress: () => void
	theme: Theme
	textStyles: TextStyles
}

const longDate = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString(getDateLocale(), { day: 'numeric', month: 'long', year: 'numeric' }) : '')

/**
 * Un puesto (moneda + lado) en la pantalla de compra, calcado del `SlotCard` de
 * `app/(dashboard)/p2p/promote/promote-client.js`: quién lo tiene y hasta cuándo, la puja
 * líder del periodo siguiente y, si se puede, el campo de puja y el botón (comprar a precio
 * de salida si está libre; pujar si está ocupado). La confirmación la abre la pantalla.
 */
const P2PPromoSlotCard = ({ slot, userUuid, focused, bidText, onChangeBid, block, leadingMine, balance, loading, onPress, theme, textStyles }: P2PPromoSlotCardProps) => {

	const { t } = useTranslation()
	const status = slotStatus(slot, userUuid)
	const side = t(slot.offer_type === 'sell' ? 'p2p.common.buy' : 'p2p.common.sell')
	const isFree = slot.state === 'free'
	const canAct = slot.state !== 'rotating' && !(leadingMine && !isFree)

	const now = {
		free: t('p2p.promo.slot.nowFree'),
		rotating: t('p2p.promo.slot.nowRotating'),
		mine: t('p2p.promo.slot.nowMine', { date: longDate(slot.ends_at) }),
		taken: t('p2p.promo.slot.nowTaken', { username: slot.holder?.username || '—', date: longDate(slot.ends_at) }),
	}[status]

	const next = slot.leading_amount
		? t(leadingMine ? 'p2p.promo.slot.nextMine' : 'p2p.promo.slot.nextLeading', { amount: promoUsd(slot.leading_amount) })
		: t('p2p.promo.slot.nextNone')

	const rows = [
		{ label: t('p2p.promo.slot.now'), value: now },
		...(!isFree && slot.state !== 'rotating' ? [{ label: t('p2p.promo.slot.next'), value: next }] : []),
	]

	return (
		<View
			testID={`promo-slot-${slot.offer_type}`}
			style={[
				styles.card,
				{ backgroundColor: theme.colors.surface },
				focused ? [styles.focused, { borderColor: theme.colors.gold }] : !theme.isDark && [styles.border, { borderColor: theme.colors.border }],
			]}
		>
			<Text style={[textStyles.h5, { color: theme.colors.primaryText }]}>{t('p2p.promo.slot.title', { coin: slot.coin, side })}</Text>
			<Text style={[textStyles.caption, styles.hint, { color: theme.colors.secondaryText }]}>{t(slot.offer_type === 'sell' ? 'p2p.promo.slot.hintSell' : 'p2p.promo.slot.hintBuy')}</Text>

			<View style={styles.rows}>
				{rows.map(row => (
					<View key={row.label} style={styles.row}>
						<Text style={[textStyles.caption, { color: theme.colors.secondaryText }]}>{row.label}</Text>
						<Text style={[textStyles.caption, styles.rowValue, { color: theme.colors.primaryText }]}>{row.value}</Text>
					</View>
				))}
			</View>

			{status === 'mine' && (
				<Text style={[textStyles.caption, styles.note, { color: theme.colors.secondaryText }]}>{t('p2p.promo.slot.mineNote')}</Text>
			)}

			{leadingMine && !isFree && (
				<Text style={[textStyles.caption, styles.note, { color: theme.colors.successText }]}>{t('p2p.promo.slot.leadingNote')}</Text>
			)}

			{canAct && (
				<View style={styles.action}>
					{!isFree && (
						<QPInput
							testID={`promo-bid-${slot.offer_type}`}
							prelabel={t('p2p.promo.slot.bidLabel', { min: promoUsd(slot.min_bid) })}
							value={bidText}
							onChangeText={(text) => onChangeBid(sanitizeAmountInput(text, 2))}
							keyboardType="decimal-pad"
							editable={!loading}
							style={{ backgroundColor: theme.colors.background }}
						/>
					)}
					<QPButton
						testID={`promo-submit-${slot.offer_type}`}
						title={isFree ? t('p2p.promo.slot.buy', { amount: promoUsd(slot.start_price) }) : t('p2p.promo.slot.bid')}
						onPress={onPress}
						disabled={!!block || loading}
						loading={loading}
					/>
					{block === 'balance' && (
						<Text style={[textStyles.caption, { color: theme.colors.dangerText }]}>{t('p2p.promo.slot.insufficient', { balance: balance.toFixed(2) })}</Text>
					)}
					{block === 'invalidBid' && !isFree && (
						<Text style={[textStyles.caption, { color: theme.colors.dangerText }]}>{t('p2p.promo.slot.invalidBid', { min: promoUsd(slot.min_bid) })}</Text>
					)}
				</View>
			)}
		</View>
	)
}

const styles = StyleSheet.create({
	card: { borderRadius: 16, borderCurve: 'continuous', padding: 16, gap: 2 },
	focused: { borderWidth: 1.5 },
	border: { borderWidth: 1 },
	hint: { marginTop: 2 },
	rows: { marginTop: 12, gap: 6 },
	row: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
	rowValue: { flexShrink: 1, textAlign: 'right' },
	note: { marginTop: 10 },
	action: { marginTop: 14, gap: 8 },
})

export default P2PPromoSlotCard
