import { View, Text, Pressable, TextInput, Switch, StyleSheet } from 'react-native'
import FontAwesome6 from '@react-native-vector-icons/fontawesome6'
import { useTranslation } from 'react-i18next'

import QPCoin from '../../ui/particles/QPCoin'
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
import { sanitizeAmountInput } from '../../helpers/amountInput'

// Create-offer form body: type switch, QUSD⇄coin amounts, live ratio, per-coin
// account fields, advanced options and the optional GOLD custom message.
const P2PCreateForm = ({ form, onField, selectedCoin, workingFields, workingForm, onChangeWorkingField, onOpenCoinPicker, onLaunchSavedMethods, user, theme, textStyles, containerStyles }: P2PCreateFormProps) => {

	const { t } = useTranslation()
	const { type, amount, receive, message, advancedOpen, onlyVIP, privateOffer } = form

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

			{/* Swap Card (Vender / Recibir) */}
			<View style={{ backgroundColor: theme.colors.elevation, borderRadius: 16, padding: 16, marginTop: 10, marginBottom: 6, borderWidth: 2, borderColor: theme.colors.primary }}>

				{/* Vender amount input */}
				<View style={{ paddingVertical: 2 }}>
					<View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
						<Text style={[textStyles.h6, { color: theme.colors.tertiaryText, marginBottom: 2 }]}>
							{type === 'buy' ? t('p2p.common.buy') : t('p2p.common.sell')}
						</Text>
						<Pressable onPress={() => { if (type === 'sell') onField('amount', String(user?.balance || 0)) }}>
							<Text style={[textStyles.h7, { color: theme.colors.tertiaryText, marginBottom: 2 }]}>
								{t('p2p.create.form.balance')} <Text style={[textStyles.h7, { color: theme.colors.primary, fontWeight: '600' }]}>${user?.balance || 0}</Text>
							</Text>
						</Pressable>
					</View>

					<View style={{ backgroundColor: theme.colors.surface, borderRadius: 12, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
						<View style={{ flex: 1 }}>
							<TextInput
								value={amount}
								onChangeText={(v) => onField('amount', sanitizeAmountInput(v))}
								placeholder="0.00"
								placeholderTextColor={theme.colors.placeholder}
								keyboardType="decimal-pad"
								style={[textStyles.h2, { color: theme.colors.primaryText, fontSize: theme.typography.fontSize.xxxl, fontWeight: '600', padding: 0, margin: 0 }]}
							/>
						</View>
						<View style={[styles.currencyButton, { backgroundColor: theme.colors.elevation, borderColor: theme.colors.border }]}>
							<View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
								<QPCoin coin="qusd" size={20} />
								<Text style={[textStyles.h6, { color: theme.colors.primaryText, fontWeight: '600' }]}>QUSD</Text>
							</View>
						</View>
					</View>
				</View>

				{/* Recibir amount input */}
				<View style={{ paddingTop: 2 }}>
					<Text style={[textStyles.h6, { color: theme.colors.tertiaryText, marginBottom: 2 }]}>
						{type === 'buy' ? t('p2p.create.form.send') : t('p2p.create.form.receive')}
					</Text>

					<View style={{ backgroundColor: theme.colors.surface, borderRadius: 12, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
						<View style={{ flex: 1 }}>
							<TextInput
								value={receive}
								onChangeText={(v) => onField('receive', sanitizeAmountInput(v, 8))}
								placeholder="0.00"
								placeholderTextColor={theme.colors.placeholder}
								keyboardType="decimal-pad"
								style={[textStyles.h2, { color: theme.colors.primaryText, fontSize: theme.typography.fontSize.xxxl, fontWeight: '600', padding: 0, margin: 0 }]}
							/>
						</View>
						<Pressable style={[styles.currencyButton, { backgroundColor: theme.colors.elevation, borderColor: theme.colors.border }]} onPress={onOpenCoinPicker}>
							{selectedCoin ? (
								<View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
									<QPCoin coin={selectedCoin.logo} size={20} />
									<Text style={[textStyles.h6, { color: theme.colors.primaryText, fontWeight: '600' }]}>{selectedCoin.tick}</Text>
									<FontAwesome6 name="chevron-down" size={12} color={theme.colors.secondaryText} iconStyle="solid" />
								</View>
							) : (
								<View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
									<Text style={[textStyles.h6, { color: theme.colors.tertiaryText }]}>{t('p2p.common.coin')}</Text>
									<FontAwesome6 name="chevron-down" size={12} color={theme.colors.secondaryText} iconStyle="solid" />
								</View>
							)}
						</Pressable>
					</View>
				</View>
			</View>

			{/* Live Ratio Display */}
			{selectedCoin && parseFloat(amount) > 0 && parseFloat(receive) > 0 && (
				<View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 8 }}>
					<FontAwesome6 name="money-bill-transfer" size={14} color={theme.colors.primary} iconStyle="solid" />
					<Text style={[textStyles.h6, { color: theme.colors.primary, fontWeight: '600' }]}>
						1 QUSD = {(parseFloat(receive) / parseFloat(amount)).toFixed(4)} {selectedCoin.tick}
					</Text>
				</View>
			)}

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
	currencyButton: {
		paddingHorizontal: 16,
		paddingVertical: 10,
		borderRadius: 12,
		borderCurve: 'continuous',
		borderWidth: 0.5,
	},
	switchRow: {
		paddingVertical: 4,
		flexDirection: 'row',
		alignItems: 'center',
		justifyContent: 'space-between',
	},
})

export default P2PCreateForm
