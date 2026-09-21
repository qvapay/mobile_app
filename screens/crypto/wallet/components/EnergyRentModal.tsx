import { useCallback, useMemo } from 'react'
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import FontAwesome6 from '@react-native-vector-icons/fontawesome6'

// Theme
import { useTheme } from '../../../../theme/ThemeContext'
import type { Theme } from '../../../../theme/ThemeContext'
import { useTextStyles } from '../../../../theme/themeUtils'

// Auth (el alquiler sale del saldo QvaPay)
import { useAuth } from '../../../../auth/AuthContext'

// Lógica
import useEnergyRent from '../useEnergyRent'
import type { RentPhase } from '../energyRentMachine'
import { formatUsd, shortAddress } from '../walletFormat'

// UI
import QPButton from '../../../../ui/particles/QPButton'

import type { EnergyDuration, EnergyOrder } from '../../../../types/domain'

type Props = {
	visible: boolean
	/** Dirección que recibe la delegación: la que FIRMA el envío. */
	targetAddress: string
	volume: number
	duration: EnergyDuration
	/** Precio publicado o estimado; también fija el techo que se manda al backend. */
	estimatedUsd: number | null
	/** Congelar el precio con `/quote` antes de comprar (pantalla de recursos). */
	freezePrice?: boolean
	onClose: () => void
	onRented?: (order: EnergyOrder) => void
	/** Enlace al historial, para la orden que se quedó en curso. */
	onSeeOrders?: () => void
}

/** Fases en las que la compra sigue viva y cerrar sería perder de vista un cobro. */
const BUSY: RentPhase[] = ['quoting', 'renting', 'polling']

/**
 * Confirmar y ejecutar un alquiler de energía TRON. Tarjeta centrada, sin PIN
 * —el backend tampoco lo pide para esto—: la fricción es ver el precio, el
 * destino y el saldo que queda.
 *
 * Es la MISMA pieza en los dos sitios donde se compra energía: la pantalla de
 * recursos (que congela el precio con una cotización) y el aviso de confirmar
 * envío (que compra un preset al precio vivo con techo). Ahí no se navega a
 * ninguna parte: salir de la pantalla de envío perdería la transacción ya
 * construida, que además caduca en ~60 s.
 */
const EnergyRentModal = ({ visible, targetAddress, volume, duration, estimatedUsd, freezePrice = false, onClose, onRented, onSeeOrders }: Props) => {

	const { t } = useTranslation()
	const { theme, styles: themeStyles } = useTheme()
	const textStyles = useTextStyles(theme)
	const { user } = useAuth()

	const { state, priceUsd, quoteSecondsLeft, confirm, retry } = useEnergyRent({
		targetAddress, volume, duration, estimatedUsd, freezePrice, active: visible, onRented,
	})

	const busy = BUSY.includes(state.phase)
	const dismiss = useCallback(() => { if (!busy) { onClose() } }, [busy, onClose])

	const balanceAfter = useMemo(() => {
		const balance = Number(user?.balance || 0)
		return typeof priceUsd === 'number' ? balance - priceUsd : balance
	}, [user?.balance, priceUsd])

	const volumeLabel = volume.toLocaleString()
	const durationLabel = t(`crypto.energy.buy.durations.${duration}`)

	return (
		<Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={dismiss}>
			<Pressable style={themeStyles.container.modalOverlay} onPress={dismiss}>
				<Pressable style={themeStyles.container.modalCard} onPress={() => { }}>

					<Head phase={state.phase} theme={theme} />

					<Text style={[textStyles.h4, styles.title]}>{t(TITLE[state.phase] ?? 'crypto.energy.confirm.title')}</Text>

					{state.phase === 'done' && (
						<Text style={[textStyles.body, styles.hint, { color: theme.colors.secondaryText }]}>
							{t('crypto.energy.confirm.doneHint', { volume: volumeLabel, duration: durationLabel })}
						</Text>
					)}
					{state.phase === 'polling' && (
						<Text style={[textStyles.body, styles.hint, { color: theme.colors.secondaryText }]}>{t('crypto.energy.confirm.waitingHint')}</Text>
					)}
					{state.phase === 'slow' && (
						<Text style={[textStyles.body, styles.hint, { color: theme.colors.secondaryText }]}>{t('crypto.energy.confirm.slowHint')}</Text>
					)}

					{state.phase !== 'slow' && (
						<View style={styles.rows}>
							<Row theme={theme} label={t('crypto.energy.confirm.volume')} value={volumeLabel} />
							<Row theme={theme} label={t('crypto.energy.confirm.duration')} value={durationLabel} />
							<Row theme={theme} label={t('crypto.energy.confirm.target')} value={shortAddress(targetAddress)} />
							<Row theme={theme} label={t('crypto.energy.confirm.price')} value={state.phase === 'quoting' ? '…' : typeof priceUsd === 'number' ? formatUsd(priceUsd) : '—'} />
							{state.phase !== 'done' && <Row theme={theme} label={t('crypto.energy.confirm.balanceAfter')} value={formatUsd(balanceAfter)} last />}
						</View>
					)}

					{state.phase === 'confirming' && quoteSecondsLeft !== null && (
						<Text style={[textStyles.caption, styles.hint, { color: theme.colors.tertiaryText }]}>
							{t('crypto.energy.confirm.priceHeld', { seconds: quoteSecondsLeft })}
						</Text>
					)}

					{state.phase === 'failed' && (
						<View style={[styles.error, { backgroundColor: theme.colors.danger + '12' }]}>
							<Text style={[textStyles.body, { color: theme.colors.primaryText }]}>{errorCopy(state.errorCode, state.errorMessage, !!user?.kyc, t)}</Text>
						</View>
					)}

					<View style={styles.actions}>
						{state.phase === 'done' && <QPButton title={t('crypto.energy.confirm.close')} onPress={onClose} />}

						{state.phase === 'slow' && (
							<>
								{!!onSeeOrders && <QPButton title={t('crypto.energy.confirm.seeOrders')} onPress={onSeeOrders} />}
								<QPButton title={t('crypto.energy.confirm.close')} onPress={onClose} outlined />
							</>
						)}

						{state.phase === 'failed' && (
							<>
								<QPButton title={t('crypto.energy.confirm.retry')} onPress={retry} />
								<QPButton title={t('crypto.energy.confirm.close')} onPress={onClose} outlined />
							</>
						)}

						{(state.phase === 'idle' || state.phase === 'quoting' || state.phase === 'confirming' || state.phase === 'renting' || state.phase === 'polling') && (
							<>
								<QPButton
									title={t(CTA[state.phase] ?? 'crypto.energy.confirm.cta')}
									onPress={confirm}
									disabled={state.phase !== 'confirming' || typeof priceUsd !== 'number'}
									loading={busy}
								/>
								<QPButton title={t('crypto.energy.confirm.cancel')} onPress={onClose} outlined disabled={busy} />
							</>
						)}
					</View>
				</Pressable>
			</Pressable>
		</Modal>
	)
}

const TITLE: Partial<Record<RentPhase, string>> = {
	quoting: 'crypto.energy.confirm.quoting',
	renting: 'crypto.energy.confirm.renting',
	polling: 'crypto.energy.confirm.waiting',
	done: 'crypto.energy.confirm.done',
	slow: 'crypto.energy.confirm.slow',
}

const CTA: Partial<Record<RentPhase, string>> = {
	renting: 'crypto.energy.confirm.renting',
	polling: 'crypto.energy.confirm.waiting',
}

/** Ícono de cabecera según en qué punto está la compra. */
const Head = ({ phase, theme }: { phase: RentPhase, theme: Theme }) => {
	if (phase === 'renting' || phase === 'polling' || phase === 'quoting') {
		return <ActivityIndicator color={theme.colors.primary} style={styles.head} />
	}
	const icon = phase === 'done' ? 'circle-check' : phase === 'failed' ? 'triangle-exclamation' : phase === 'slow' ? 'clock' : 'bolt'
	const color = phase === 'done' ? theme.colors.successText : phase === 'failed' ? theme.colors.danger : theme.colors.primary
	return <FontAwesome6 name={icon} size={34} color={color} iconStyle="solid" style={styles.head} />
}

const Row = ({ theme, label, value, last }: { theme: Theme, label: string, value: string, last?: boolean }) => (
	<View style={[styles.row, !last && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.colors.border + '60' }]}>
		<Text style={{ color: theme.colors.secondaryText, fontFamily: theme.typography.fontFamily.regular, fontSize: theme.typography.fontSize.sm }}>{label}</Text>
		<Text style={{ color: theme.colors.primaryText, fontFamily: theme.typography.fontFamily.medium, fontSize: theme.typography.fontSize.sm }}>{value}</Text>
	</View>
)

/**
 * Copy del fallo por código del backend. La prosa cruda del servidor solo se
 * usa cuando el código es desconocido: los mensajes conocidos se traducen,
 * y el del tope diario cambia según haya KYC (sin él el límite es $50, que
 * casi cualquier compra seria supera).
 */
export const errorCopy = (code: string | null, message: string | null, hasKyc: boolean, t: (key: string, opts?: Record<string, unknown>) => string): string => {
	if (code === 'LIMIT_EXCEEDED') { return t(hasKyc ? 'crypto.energy.errors.LIMIT_EXCEEDED' : 'crypto.energy.errors.LIMIT_EXCEEDED_KYC') }
	if (code && KNOWN_CODES.includes(code)) { return t(`crypto.energy.errors.${code}`) }
	return message || t('crypto.energy.errors.generic')
}

const KNOWN_CODES = [
	'INSUFFICIENT_BALANCE', 'ADDRESS_NOT_ACTIVATED', 'INVALID_ADDRESS', 'INVALID_VOLUME', 'INVALID_DURATION',
	'SANCTIONS_BLOCKED', 'QUOTE_EXPIRED', 'PRICE_ABOVE_MAX', 'DELIVERY_FAILED', 'REFUNDED',
	'PROVIDER_UNAVAILABLE', 'RATE_LIMITED',
]

const styles = StyleSheet.create({
	head: { alignSelf: 'center', marginBottom: 12, height: 34 },
	title: { textAlign: 'center' },
	hint: { textAlign: 'center', marginTop: 8 },
	rows: { marginTop: 16 },
	row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12, paddingVertical: 11 },
	error: { marginTop: 14, padding: 12, borderRadius: 12 },
	actions: { marginTop: 20, gap: 10 },
})

export default EnergyRentModal
