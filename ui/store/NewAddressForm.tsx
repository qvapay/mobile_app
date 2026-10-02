import { useState } from 'react'
import { View, Text, StyleSheet, ScrollView, Pressable, Modal, useWindowDimensions } from 'react-native'
import type { TextStyle, ViewStyle } from 'react-native'
import { useTranslation } from 'react-i18next'
import FontAwesome6 from '@react-native-vector-icons/fontawesome6'

import { useTheme } from '../../theme/ThemeContext'
import { createContainerStyles, createTextStyles } from '../../theme/themeUtils'

import QPInput from '../particles/QPInput'
import AddressAutocomplete from '../../screens/store/assisted/AddressAutocomplete'
import { US_STATES } from '../../screens/store/assisted/assistedConstants'

import type { Theme } from '../../theme/ThemeContext'
import type { UsAddressForm } from './shippingAddress'

type StatePickerModalProps = {
	visible: boolean
	currentState: string
	onSelect: (code: string) => void
	onClose: () => void
	theme: Theme
	textStyles: Record<string, TextStyle>
}

// US state picker — centered card modal (house modal pattern)
const StatePickerModal = ({ visible, currentState, onSelect, onClose, theme, textStyles }: StatePickerModalProps) => {
	const { t } = useTranslation()
	const { height: windowHeight } = useWindowDimensions()
	// themeUtils.js aún es JS (@returns {Object}): cast estructural hasta que se tipe
	const containerStyles = createContainerStyles(theme) as Record<string, ViewStyle>
	return (
		<Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={onClose}>
			<Pressable style={containerStyles.modalOverlay} onPress={onClose}>
				<Pressable style={[containerStyles.modalCard, { maxHeight: windowHeight * 0.75 }]} onPress={() => { }}>
					<Text style={[textStyles.h5, { fontWeight: '600', marginBottom: 10 }]}>{t('ui.newAddressForm.statePickerTitle')}</Text>
					<ScrollView showsVerticalScrollIndicator={false}>
						{US_STATES.map(state => (
							<Pressable
								key={state.code}
								style={styles.stateRow}
								onPress={() => onSelect(state.code)}
							>
								<Text style={[textStyles.h6, { color: currentState === state.code ? theme.colors.primary : theme.colors.primaryText, fontWeight: currentState === state.code ? '600' : '400' }]}>
									{state.name}
								</Text>
								<Text style={[textStyles.caption, { color: theme.colors.secondaryText }]}>{state.code}</Text>
							</Pressable>
						))}
					</ScrollView>
				</Pressable>
			</Pressable>
		</Modal>
	)
}

type Props = {
	/** Current form values. */
	form: UsAddressForm
	/** `(updater) => void`, receives a `f => next` updater like setState. */
	onChange: (updater: (f: UsAddressForm) => UsAddressForm) => void
}

/**
 * New US shipping-address form: autocomplete + manual fields + state picker
 * modal, shared by the assisted-shopping checkout and the marketplace cart.
 * Controlled: the form object lives in the parent (`EMPTY_US_ADDRESS` shape),
 * validated with `validateUsAddress` and serialized with `buildAddressBody`.
 */
const NewAddressForm = ({ form, onChange }: Props) => {

	const { t } = useTranslation()
	const { theme } = useTheme()
	// themeUtils.js aún es JS (@returns {Object}): cast estructural hasta que se tipe
	const textStyles = createTextStyles(theme) as Record<string, TextStyle>
	const [statePickerVisible, setStatePickerVisible] = useState(false)

	const setField = (field: keyof UsAddressForm) => (value: string) => onChange(f => ({ ...f, [field]: value }))

	return (
		<View style={{ marginTop: 14, gap: 10 }}>
			<AddressAutocomplete
				onSelect={(address: { line1?: string, city?: string, state?: string, postal_code?: string }) => onChange(f => ({
					...f,
					line1: address.line1 || f.line1,
					city: address.city || f.city,
					state: US_STATES.some(s => s.code === address.state) ? (address.state as string) : f.state,
					postal_code: address.postal_code || f.postal_code,
				}))}
			/>
			<QPInput prelabel={t('ui.newAddressForm.recipientName')} placeholder="John Doe" value={form.recipient_name} onChangeText={setField('recipient_name')} autoCapitalize="words" />
			<QPInput prelabel={t('ui.newAddressForm.phoneOptional')} placeholder="+1 305 555 0100" value={form.phone} onChangeText={setField('phone')} keyboardType="phone-pad" />
			<QPInput prelabel={t('ui.newAddressForm.line1')} placeholder="123 Main St" value={form.line1} onChangeText={setField('line1')} />
			<QPInput prelabel={t('ui.newAddressForm.line2')} placeholder="Apt 4B" value={form.line2} onChangeText={setField('line2')} />
			<QPInput prelabel={t('ui.newAddressForm.city')} placeholder="Miami" value={form.city} onChangeText={setField('city')} autoCapitalize="words" />

			<View style={styles.stateZipRow}>
				<View style={{ flex: 1 }}>
					<Text style={[textStyles.caption, { color: theme.colors.secondaryText, marginBottom: 6 }]}>{t('ui.newAddressForm.state')}</Text>
					<Pressable
						style={[styles.statePicker, { backgroundColor: theme.colors.surface }, (theme as Theme & { mode?: string }).mode === 'light' && { borderWidth: 1, borderColor: theme.colors.elevationLight }]}
						onPress={() => setStatePickerVisible(true)}
					>
						<Text style={[textStyles.h6, { color: form.state ? theme.colors.primaryText : theme.colors.secondaryText }]}>
							{form.state ? `${form.state} — ${US_STATES.find(s => s.code === form.state)?.name}` : t('ui.newAddressForm.statePlaceholder')}
						</Text>
						<FontAwesome6 name="chevron-down" size={12} color={theme.colors.secondaryText} iconStyle="solid" />
					</Pressable>
				</View>
				<View style={{ width: 130 }}>
					<QPInput prelabel={t('ui.newAddressForm.postalCode')} placeholder="33033" value={form.postal_code} onChangeText={setField('postal_code')} keyboardType="numbers-and-punctuation" maxLength={10} />
				</View>
			</View>

			<StatePickerModal
				visible={statePickerVisible}
				currentState={form.state}
				onSelect={(code) => { setField('state')(code); setStatePickerVisible(false) }}
				onClose={() => setStatePickerVisible(false)}
				theme={theme}
				textStyles={textStyles}
			/>
		</View>
	)
}

const styles = StyleSheet.create({
	stateZipRow: {
		flexDirection: 'row',
		gap: 10,
		alignItems: 'flex-end',
	},
	statePicker: {
		flexDirection: 'row',
		alignItems: 'center',
		justifyContent: 'space-between',
		paddingHorizontal: 14,
		height: 50,
		borderRadius: 12,
	},
	stateRow: {
		flexDirection: 'row',
		alignItems: 'center',
		justifyContent: 'space-between',
		paddingVertical: 12,
	},
})

export default NewAddressForm
