import { View, Text, Pressable, Switch, StyleSheet } from 'react-native'
import FontAwesome6 from '@react-native-vector-icons/fontawesome6'
import { useTranslation } from 'react-i18next'

import QPAmountCard from '../../ui/QPAmountCard'
import QPFlipButton, { FLIP_BUTTON_SIZE } from '../../ui/particles/QPFlipButton'
import QPInput from '../../ui/particles/QPInput'
import QPSwitch from '../../ui/particles/QPSwitch'

import type { Theme } from '../../theme/ThemeContext'
import type { TextStyles, ContainerStyles } from '../../theme/themeUtils'
import type { Coin, CoinWorkingField, User } from '../../types/domain'
import type { P2PCreateFormState, SetP2PCreateField } from './P2PCreate'

type P2PCreateFormProps = {
	form: P2PCreateFormState
	onField: SetP2PCreateField
	selectedCoin: Coin | null
	/** Campos de destino de la moneda (`working_data`), ya parseados por la pantalla. */
	workingFields: CoinWorkingField[]
	/** Valores tecleados, indexados por la clave normalizada del nombre del campo. */
	workingForm: Record<string, string>
	onChangeWorkingField: (key: string, value: string) => void
	onOpenCoinPicker: () => void
	onLaunchSavedMethods: () => void
	user: User
	theme: Theme
	textStyles: TextStyles
	containerStyles: ContainerStyles
}

const keyFromFieldName = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')
import { percentAmount, sanitizeAmountInput } from '../../helpers/amountInput'

// Create-offer form body: type switch, QUSD⇄coin amounts, live ratio, per-coin
// account fields, advanced options and the optional GOLD custom message.
const PERCENT_CHIPS = [25, 50, 100] as const

const P2PCreateForm = ({ form, onField, selectedCoin, workingFields, workingForm, onChangeWorkingField, onOpenCoinPicker, onLaunchSavedMethods, user, theme, textStyles, containerStyles }: P2PCreateFormProps) => {

	const { t } = useTranslation()
	const { type, amount, receive, message, advancedOpen, onlyVIP, privateOffer } = form

	const balance = Number(user?.balance) || 0

	/**
	 * Porcentajes del saldo, solo al VENDER: comprando se entrega moneda, no saldo, así que
	 * un chip sobre el saldo QvaPay no significaría nada.
	 */
	const chips = type === 'sell' && balance > 0
		? PERCENT_CHIPS.map(percent => ({
			key: String(percent),
			label: percent === 100 ? t('p2p.create.form.max') : `${percent}%`,
			onPress: () => onField('amount', percentAmount(balance, percent)),
		}))
		: undefined

	// La tasa vivía en una línea aparte bajo las tarjetas; ahora ocupa el sitio del saldo
	// en la segunda, que es donde se mira mientras se teclea
	const paid = parseFloat(amount)
	const got = parseFloat(receive)
	const rateLabel = selectedCoin && paid > 0 && got > 0
		? `1 QUSD = ${(got / paid).toFixed(4)} ${selectedCoin.tick}`
		: ''

	return (
		<>
			{/* Type Selector */}
			<QPSwitch
				value={type === 'buy' ? 'left' : 'right'}
				onChange={(side) => onField('type', side === 'left' ? 'buy' : 'sell')}
				leftText={t('p2p.common.buy')}
				rightText={t('p2p.common.sell')}
				leftColor={theme.colors.danger}
				rightColor={theme.colors.successFill}
				rightTextColor={theme.colors.successFillText}
			/>

			{/* Las dos tarjetas: las MISMAS del swap de la wallet y del retiro. Una oferta P2P
			    es una conversión, y leerla igual que las otras es lo que evita tener que
			    aprender tres pantallas para la misma operación. */}
			<View style={styles.cards}>
				<QPAmountCard
					label={type === 'buy' ? t('p2p.common.buy') : t('p2p.common.sell')}
					token={{
						symbol: 'QUSD',
						caption: t('p2p.create.form.balance'),
						icon: { kind: 'wallet', logoTick: 'qusd', networkTick: null },
					}}
					amount={amount}
					onChangeAmount={(v: string) => onField('amount', sanitizeAmountInput(v))}
					chips={chips}
					fiatLabel=""
					balanceLabel={`$${user?.balance || 0}`}
					accessibilityLabel={type === 'buy' ? t('p2p.common.buy') : t('p2p.common.sell')}
				/>

				{/* En flujo con márgenes negativos: monta sobre la junta sin medir las tarjetas */}
				<View style={styles.flipWrap} pointerEvents="box-none">
					<QPFlipButton accessibilityLabel={type === 'buy' ? t('p2p.create.form.send') : t('p2p.create.form.receive')} />
				</View>

				<QPAmountCard
					label={type === 'buy' ? t('p2p.create.form.send') : t('p2p.create.form.receive')}
					hint={selectedCoin?.network ?? undefined}
					token={{
						symbol: selectedCoin?.tick ?? t('p2p.common.coin'),
						caption: selectedCoin?.name ?? '',
						icon: selectedCoin ? { kind: 'wallet', logoTick: selectedCoin.logo, networkTick: selectedCoin.network ?? null } : { kind: 'balance' },
						onPress: onOpenCoinPicker,
					}}
					amount={receive}
					onChangeAmount={(v: string) => onField('receive', sanitizeAmountInput(v, 8))}
					fiatLabel=""
					balanceLabel={rateLabel}
					accessibilityLabel={type === 'buy' ? t('p2p.create.form.send') : t('p2p.create.form.receive')}
				/>
			</View>

			{/* Details: Coin working data */}
			{selectedCoin && workingFields.length > 0 && (
				<View style={{ marginTop: 12, marginBottom: 6 }}>
					<View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
						<Text style={[textStyles.h5, { color: theme.colors.secondaryText, marginBottom: 6 }]}>{t('p2p.create.form.detailsTitle')}</Text>
						<Pressable onPress={onLaunchSavedMethods}>
							<FontAwesome6 name="book" size={16} color={theme.colors.primary} iconStyle="solid" />
						</Pressable>
					</View>

					{workingFields.map((field) => {
						const key = keyFromFieldName(field.name)
						return (
							<QPInput
								key={key}
								value={workingForm[key] || ''}
								onChangeText={(text) => onChangeWorkingField(key, text)}
								placeholder={field.name}
								keyboardType={field.type === 'number' ? 'numeric' : 'default'}
								style={{ marginVertical: 6 }}
							/>
						)
					})}
				</View>
			)}

			{/* Advanced */}
			<View style={containerStyles.card}>
				<Pressable onPress={() => onField('advancedOpen', !advancedOpen)} style={containerStyles.rowBetween}>
					<View style={{ flexDirection: 'row', alignItems: 'center' }}>
						<FontAwesome6 name="sliders" size={16} color={theme.colors.primaryText} iconStyle="solid" />
						<Text style={[textStyles.h5, { marginLeft: 8 }]}>{t('p2p.create.form.advanced')}</Text>
					</View>
					<FontAwesome6 name={advancedOpen ? 'angle-up' : 'angle-down'} size={18} color={theme.colors.primaryText} iconStyle="solid" />
				</Pressable>

				{advancedOpen && (
					<View style={{ marginTop: 10, gap: 10 }}>
						<View style={[styles.switchRow, { marginTop: 12 }]}>
							<Text style={textStyles.h6}>{t('p2p.common.onlyVipUsers')}</Text>
							<Switch value={onlyVIP} onValueChange={(v) => onField('onlyVIP', v)} trackColor={{ true: theme.colors.primary }} />
						</View>
						<View style={styles.switchRow}>
							<Text style={textStyles.h6}>{t('p2p.create.form.privateOffer')}</Text>
							<Switch value={privateOffer} onValueChange={(v) => onField('privateOffer', v)} trackColor={{ true: theme.colors.primary }} />
						</View>
					</View>
				)}
			</View>

			{user.golden_check && (
				<QPInput
					value={message}
					onChangeText={(v) => onField('message', v)}
					placeholder={t('p2p.create.form.customMessage')}
					keyboardType="default"
					style={{ marginVertical: 6 }}
				/>
			)}
		</>
	)
}

const styles = StyleSheet.create({
	cards: { marginTop: 10, marginBottom: 6 },
	// Deja 6 px de junta entre las dos tarjetas, igual que en el swap y en el retiro
	flipWrap: { alignItems: 'center', marginVertical: -(FLIP_BUTTON_SIZE / 2) + 3, zIndex: 2, elevation: 2 },
	switchRow: {
		paddingVertical: 4,
		flexDirection: 'row',
		alignItems: 'center',
		justifyContent: 'space-between',
	},
})

export default P2PCreateForm
