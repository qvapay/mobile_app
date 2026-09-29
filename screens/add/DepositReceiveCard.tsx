import { useTranslation } from 'react-i18next'

import QPAmountCard from '../../ui/QPAmountCard'
import { coinConverted, coinTerms, formatCoinAmount } from '../../helpers/coinFormat'

import type { Coin } from '../../types/domain'

type Props = {
	selectedCoin: Coin | null
	amount: string
	loadingCoins: boolean
	onPickCoin: () => void
}

/**
 * Lado "Recibes" del depósito. No editable: en un depósito eliges la moneda y los
 * dólares, y lo que llega lo calcula el catálogo. Mismo papel que el lado "Recibes"
 * del swap. Lo que llega va con las condiciones de la moneda al lado: las dos cosas
 * que se miran mientras se teclea.
 */
const DepositReceiveCard = ({ selectedCoin, amount, loadingCoins, onPickCoin }: Props) => {

	const { t } = useTranslation()

	if (!selectedCoin) {
		return (
			<QPAmountCard
				label={t('add.index.selectCoinLabel')}
				token={{
					symbol: loadingCoins ? t('add.index.loadingCoins') : t('add.index.selectCoinPlaceholder'),
					icon: { kind: 'balance' },
					onPress: loadingCoins ? undefined : onPickCoin,
				}}
				amount=""
				fiatLabel=""
				balanceLabel=""
			/>
		)
	}

	const converted = coinConverted(selectedCoin, amount)
	return (
		<QPAmountCard
			label={t('add.index.selectCoinLabel')}
			hint={selectedCoin.network ?? undefined}
			token={{
				symbol: selectedCoin.tick,
				icon: { kind: 'wallet', logoTick: selectedCoin.logo, networkTick: selectedCoin.network ?? null },
				onPress: loadingCoins ? undefined : onPickCoin,
			}}
			amount={converted > 0 ? formatCoinAmount(converted) : ''}
			fiatLabel=""
			balanceLabel={coinTerms(t, selectedCoin, 'in').join(' · ')}
		/>
	)
}

export default DepositReceiveCard
