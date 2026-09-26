import { StyleSheet, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'

// UI
import QPAmountCard from '../../ui/QPAmountCard'
import type { QPAmountChip } from '../../ui/QPAmountCard'
import QPFlipButton, { FLIP_BUTTON_SIZE } from '../../ui/particles/QPFlipButton'

// Helpers
import { sanitizeAmountInput } from '../../helpers/amountInput'

import type { Coin, Decimal } from '../../types/domain'
import type { Theme } from '../../theme/ThemeContext'
import type { TextStyles } from '../../theme/themeUtils'

const formatBalance = (val?: Decimal | null) => {
	if (!val) { return '0.00' }
	// Decimal = string | number; parseFloat solo acepta string (el number llega
	// coaccionado en runtime, igual que antes de tipar)
	return parseFloat(val as string).toFixed(2)
}

type WithdrawAmountCardProps = {
	amountQUSD: string
	amountCoin: string
	onChangeQUSD: (value: string) => void
	onChangeAmountCoin: (value: string) => void
	selectedCoin: Coin | null
	balance?: Decimal | null
	currency: string
	onOpenCoinPicker: () => void
	/** Chips de porcentaje sobre el saldo; los arma la pantalla, como en el swap. */
	chips?: QPAmountChip[]
	locked?: boolean
	lockedCaption?: string
	theme: Theme
	textStyles: TextStyles
}

/**
 * Las dos tarjetas del retiro: lo que sale del saldo y lo que se recibe en la moneda.
 *
 * Son las MISMAS piezas del swap de la wallet (`QPAmountCard` + `QPFlipButton`), no una
 * imitación: un retiro es una conversión, y leerla igual que un swap es lo que hace que no
 * haya que aprender dos pantallas.
 *
 * La diferencia con el swap está en el botón del medio: aquí el sentido NO se elige —del
 * saldo a la moneda y punto—, así que va sin `onPress` y se queda como indicador.
 *
 * `locked` congela los dos importes (un BOLT11 escaneado fija la cantidad) y
 * `lockedCaption` explica por qué debajo.
 */
const WithdrawAmountCard = ({ amountQUSD, amountCoin, onChangeQUSD, onChangeAmountCoin, selectedCoin, balance, currency, onOpenCoinPicker, chips, locked, lockedCaption, theme, textStyles }: WithdrawAmountCardProps) => {

	const { t } = useTranslation()

	return (
		<View>
			<View>
				<QPAmountCard
					label={t('withdraw.amountCard.withdraw')}
					token={{
						symbol: currency,
						caption: t('withdraw.amountCard.fromBalance'),
						icon: { kind: 'wallet', logoTick: 'qusd', networkTick: null },
					}}
					amount={amountQUSD}
					onChangeAmount={locked ? undefined : (text: string) => onChangeQUSD(sanitizeAmountInput(text))}
					chips={chips}
					fiatLabel=""
					balanceLabel={`${formatBalance(balance)} ${currency}`}
					disabled={locked}
					accessibilityLabel={t('withdraw.amountCard.withdraw')}
				/>

				{/* En flujo con márgenes negativos: monta sobre la junta sin medir las tarjetas */}
				<View style={styles.flipWrap} pointerEvents="box-none">
					<QPFlipButton accessibilityLabel={t('withdraw.amountCard.receive')} />
				</View>

				<QPAmountCard
					label={t('withdraw.amountCard.receive')}
					hint={selectedCoin?.network ?? undefined}
					token={{
						symbol: selectedCoin?.tick ?? t('withdraw.amountCard.coinPlaceholder'),
						caption: selectedCoin?.name ?? '',
						icon: selectedCoin ? { kind: 'wallet', logoTick: selectedCoin.logo, networkTick: selectedCoin.network ?? null } : { kind: 'balance' },
						onPress: onOpenCoinPicker,
					}}
					amount={amountCoin}
					onChangeAmount={locked || !selectedCoin ? undefined : (text: string) => onChangeAmountCoin(sanitizeAmountInput(text, 8))}
					fiatLabel=""
					balanceLabel=""
					disabled={locked}
					accessibilityLabel={t('withdraw.amountCard.receive')}
				/>
			</View>

			{locked && !!lockedCaption && (
				<Text style={[textStyles.h6, styles.locked, { color: theme.colors.tertiaryText }]}>{lockedCaption}</Text>
			)}
		</View>
	)
}

const styles = StyleSheet.create({
	// Deja 6 px de junta entre las dos tarjetas, igual que en el swap
	flipWrap: { alignItems: 'center', marginVertical: -(FLIP_BUTTON_SIZE / 2) + 3, zIndex: 2, elevation: 2 },
	locked: { textAlign: 'center', marginTop: 10 },
})

export default WithdrawAmountCard
