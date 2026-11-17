import { View, Text } from "react-native"
import { useTranslation } from "react-i18next"

import QPInput from "../../ui/particles/QPInput"
import { SurfaceHost } from "../../ui/SurfaceContext"
import { sanitizeAmountInput } from "../../helpers/amountInput"
import { checkTakeAmount, takeBounds, formatCents, quoteReceive } from "./p2pFlexible"

import type { Theme } from "../../theme/ThemeContext"
import type { TextStyles } from "../../theme/themeUtils"
import type { P2POffer } from "../../types/domain"

type P2PFlexibleTakeFormProps = {
	/** Oferta por rango sobre la que se toma la parte. */
	offer: P2POffer
	amount: string
	setAmount: (value: string) => void
	/** Saldo QUSD del taker: en una oferta `buy` la parte sale de ahí como garantía. */
	balance: number
	/** Enseña el rango disponible encima del campo (el modal ya lo dice en su cuerpo). */
	hint?: boolean
	theme: Theme
	textStyles: TextStyles
}

/**
 * Campo de monto para tomar una parte de una oferta por rango, con el motivo del
 * rechazo o la contrapartida a la tasa de la oferta. Lo comparten la pantalla
 * (`P2POffer`, donde el input vive a la vista, como en la web) y el modal de
 * confirmación (`P2PApplyModal`), que así no duplica las reglas ni el copy.
 */
const P2PFlexibleTakeForm = ({ offer, amount, setAmount, balance, hint = false, theme, textStyles }: P2PFlexibleTakeFormProps) => {

	const { t } = useTranslation()

	const check = checkTakeAmount(amount, offer, balance)
	const bounds = takeBounds(offer)
	// El motivo solo se enseña con algo tecleado (vacío = aún no ha empezado)
	const reason = !check.ok && check.reason !== 'empty' ? check.reason : null
	const quote = check.ok ? quoteReceive(check.amount, offer) : null
	const coinName = offer.Coin?.name || offer.coin || ''

	return (
		// El campo es el pozo del anfitrión: dentro de una card de pantalla va sobre `surface`
		<SurfaceHost tone="surface">
			<View>
				{hint && (
					<Text style={[textStyles.h7, { color: theme.colors.secondaryText, marginBottom: 2 }]}>
						{t('p2p.flexible.apply.body', { min: formatCents(bounds.minCents), max: formatCents(bounds.maxCents) })}
					</Text>
				)}

				<QPInput
					value={amount}
					onChangeText={(v) => setAmount(sanitizeAmountInput(v))}
					placeholder={formatCents(bounds.minCents)}
					keyboardType="decimal-pad"
					prelabel={t('p2p.flexible.apply.amountLabel')}
					testID="p2p-flexible-amount"
				/>

				{reason ? (
					<Text style={[textStyles.h7, { color: theme.colors.danger, marginTop: 4 }]} testID="p2p-flexible-amount-error">
						{t(`p2p.flexible.errors.${reason}`, { min: formatCents(bounds.minCents), max: formatCents(bounds.maxCents) })}
					</Text>
				) : quote != null ? (
					<Text style={[textStyles.h7, { color: theme.colors.secondaryText, marginTop: 4 }]} testID="p2p-flexible-quote">
						{offer.type === 'sell'
							? t('p2p.flexible.apply.youSend', { amount: Number(quote.toFixed(8)), coin: coinName })
							: t('p2p.flexible.apply.youReceive', { amount: Number(quote.toFixed(8)), coin: coinName })}
					</Text>
				) : null}

				{/* Vender QUSD en una oferta de compra: la parte sale del saldo como garantía */}
				{offer.type === 'buy' && (
					<Text style={[textStyles.h7, { color: theme.colors.tertiaryText, marginTop: 6 }]} testID="p2p-flexible-escrow">
						{t('p2p.flexible.apply.escrowNote', { balance: balance.toFixed(2) })}
					</Text>
				)}
			</View>
		</SurfaceHost>
	)
}

export default P2PFlexibleTakeForm
