import { useCallback, useState } from 'react'
import { View, Text, StyleSheet, Pressable, Modal, useWindowDimensions } from 'react-native'
import { FlashList } from '@shopify/flash-list'
import type { TextStyle, ViewStyle } from 'react-native'
import { useTranslation } from 'react-i18next'
import FontAwesome6 from '@react-native-vector-icons/fontawesome6'

import { useTheme } from '../../theme/ThemeContext'
import { createContainerStyles, createTextStyles } from '../../theme/themeUtils'

import QPInput from '../particles/QPInput'
import QPSwitch from '../particles/QPSwitch'
import AddressAutocomplete from '../AddressAutocomplete'
import CubaAddressFields from './CubaAddressFields'
import { US_STATES } from '../../screens/store/assisted/assistedConstants'
import type { UsState } from '../../screens/store/assisted/assistedConstants'

import type { Theme } from '../../theme/ThemeContext'
import type { AddressCountry, AddressForm } from './shippingAddress'

type StatePickerModalProps = {
	visible: boolean
	currentState: string
	onSelect: (code: string) => void
	onClose: () => void
	theme: Theme
	textStyles: Record<string, TextStyle>
}

const stateKey = (state: UsState) => state.code

// US state picker — centered card modal (house modal pattern)
const StatePickerModal = ({ visible, currentState, onSelect, onClose, theme, textStyles }: StatePickerModalProps) => {
	const { t } = useTranslation()
	const { height: windowHeight } = useWindowDimensions()
	// themeUtils.js aún es JS (@returns {Object}): cast estructural hasta que se tipe
	const containerStyles = createContainerStyles(theme) as Record<string, ViewStyle>

	const renderItem = useCallback(({ item: state }: { item: UsState }) => (
		<Pressable style={styles.stateRow} onPress={() => onSelect(state.code)}>
			<Text style={[textStyles.h6, { color: currentState === state.code ? theme.colors.primary : theme.colors.primaryText, fontWeight: currentState === state.code ? '600' : '400' }]}>
				{state.name}
			</Text>
			<Text style={[textStyles.caption, { color: theme.colors.secondaryText }]}>{state.code}</Text>
		</Pressable>
	), [currentState, theme, textStyles, onSelect])

	return (
		<Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={onClose}>
			<Pressable style={containerStyles.modalOverlay} onPress={onClose}>
				{/* Alto FIJO, no maxHeight: FlashList no se mide por su contenido y sin alto no
				    pinta filas (ver QPAssetSheet); los 51 estados llenan el card de todas formas */}
				<Pressable style={[containerStyles.modalCard, { height: windowHeight * 0.75 }]} onPress={() => { }}>
					<Text style={[textStyles.h5, { fontWeight: '600', marginBottom: 10 }]}>{t('ui.newAddressForm.statePickerTitle')}</Text>
					<View style={styles.stateList}>
						<FlashList
							data={US_STATES}
							keyExtractor={stateKey}
							renderItem={renderItem}
							showsVerticalScrollIndicator={false}
						/>
					</View>
				</Pressable>
			</Pressable>
		</Modal>
	)
}

type Props = {
	/** Current form values. */
	form: AddressForm
	/** `(updater) => void`, receives a `f => next` updater like setState. */
	onChange: (updater: (f: AddressForm) => AddressForm) => void
	/** Country being filled (US by default: the assisted-shopping checkout only ships there). */
	country?: AddressCountry
	/** With it, a «Cuba / Estados Unidos» switch on top; without it the country is fixed. */
	onCountryChange?: (country: AddressCountry) => void
	/** Cuba: provinces the cart can receive in (null = all). */
	provinces?: string[] | null
	/** Cuba: municipalities the cart can receive in, by province (null = no restriction). */
	municipalities?: Record<string, string[]> | null
}

/**
 * New shipping-address form, shared by the assisted-shopping checkout (US only) and the
 * marketplace cart (US or Cuba). US: autocomplete + manual fields + state picker modal. Cuba:
 * `CubaAddressFields` (province, municipality from the closed list, recipient's ID card).
 * Controlled: the form object lives in the parent (`EMPTY_ADDRESS_FORM` shape), validated with
 * `validateAddress` and serialized with `buildAddressBody(form, country)`.
 */
const NewAddressForm = ({ form, onChange, country = 'US', onCountryChange, provinces, municipalities }: Props) => {

	const { t } = useTranslation()
	const { theme } = useTheme()
	// themeUtils.js aún es JS (@returns {Object}): cast estructural hasta que se tipe
	const textStyles = createTextStyles(theme) as Record<string, TextStyle>
	const [statePickerVisible, setStatePickerVisible] = useState(false)

	const setField = (field: keyof AddressForm) => (value: string) => onChange(f => ({ ...f, [field]: value }))

	const countrySwitch = onCountryChange && (
		<QPSwitch
			value={country === 'CU' ? 'left' : 'right'}
			leftText={t('ui.newAddressForm.countryCuba')}
			rightText={t('ui.newAddressForm.countryUs')}
			// Tocar el lado ya elegido lo desmarcaría (null): el país siempre tiene valor
			onChange={(side) => { if (side) onCountryChange(side === 'left' ? 'CU' : 'US') }}
		/>
	)

	// Un estado de otro país (si el formulario cambió de país) no se pinta como de EE. UU.
	const usState = US_STATES.find(st => st.code === form.state) || null

	if (country === 'CU') {
		return (
			<View style={styles.form}>
				{countrySwitch}
				<CubaAddressFields form={form} onChange={onChange} provinces={provinces} municipalities={municipalities} />
			</View>
		)
	}

	return (
		<View style={styles.form}>
			{countrySwitch}
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
						style={[styles.statePicker, { backgroundColor: theme.colors.surface }, !theme.isDark && { borderWidth: 1, borderColor: theme.colors.elevationLight }]}
						onPress={() => setStatePickerVisible(true)}
					>
						<Text style={[textStyles.h6, { color: usState ? theme.colors.primaryText : theme.colors.secondaryText }]}>
							{usState ? `${usState.code} — ${usState.name}` : t('ui.newAddressForm.statePlaceholder')}
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
	form: {
		marginTop: 14,
		gap: 10,
	},
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
	stateList: {
		flex: 1,
	},
	stateRow: {
		flexDirection: 'row',
		alignItems: 'center',
		justifyContent: 'space-between',
		paddingVertical: 12,
	},
})

export default NewAddressForm
