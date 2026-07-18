import { View, Text, StyleSheet, Pressable, ScrollView } from 'react-native'
import FontAwesome6 from '@react-native-vector-icons/fontawesome6'

import QPPhoneInput from '../../../ui/QPPhoneInput'

// Destino fijo: las recargas por tienda son solo para números cubanos
const CUBA = { flag: '🇨🇺', dial: '+53' }

/**
 * Recipient phone input for store-billed top-ups: +53 locked chip, validation
 * hint and a row of recently used numbers (chips) for one-tap reuse.
 *
 * @param {object} props
 * @param {string} props.phoneNumber - Local digits as typed (no dial code).
 * @param {boolean} props.phoneValid - Whether the number passes the Cuban mobile pattern.
 * @param {(text: string) => void} props.onChangePhone
 * @param {string[]} [props.recentNumbers] - E.164 numbers previously topped up.
 * @param {(phone: string) => void} [props.onPickRecent] - Called with the E.164 number of a tapped chip.
 */
const TopupPhoneInput = ({ phoneNumber, phoneValid, onChangePhone, recentNumbers = [], onPickRecent, theme, textStyles }) => (
	<View style={styles.section}>
		<Text style={[textStyles.h6, { color: theme.colors.primaryText, fontWeight: '600', marginBottom: 8 }]}>
			<FontAwesome6 name="phone" size={12} color={theme.colors.primaryText} iconStyle="solid" />  Número a recargar
		</Text>

		<QPPhoneInput
			lockedCountry={CUBA}
			valid={phoneValid}
			value={phoneNumber}
			onChangeText={onChangePhone}
			placeholder="5XXXXXXX"
			maxLength={8}
		/>

		{!phoneValid && phoneNumber.length > 0 ? (
			<View style={styles.hintRow}>
				<FontAwesome6 name="circle-exclamation" size={11} color={theme.colors.danger} iconStyle="solid" />
				<Text style={[textStyles.caption, { color: theme.colors.danger, marginLeft: 6 }]}>
					Debe empezar con 5 y tener 8 dígitos
				</Text>
			</View>
		) : (
			<View style={styles.hintRow}>
				<FontAwesome6 name="circle-info" size={11} color={theme.colors.tertiaryText} iconStyle="solid" />
				<Text style={[textStyles.caption, { color: theme.colors.tertiaryText, marginLeft: 6 }]}>
					Solo números móviles de 🇨🇺 Cuba
				</Text>
			</View>
		)}

		{recentNumbers.length > 0 && (
			<ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.recentRow} keyboardShouldPersistTaps="handled">
				{recentNumbers.map((phone) => (
					<Pressable
						key={phone}
						onPress={() => onPickRecent?.(phone)}
						style={[
							styles.recentChip,
							{ backgroundColor: theme.colors.surface },
							theme.mode === 'light' && { borderWidth: 1, borderColor: theme.colors.border },
						]}
					>
						<FontAwesome6 name="clock-rotate-left" size={10} color={theme.colors.tertiaryText} iconStyle="solid" />
						<Text style={[textStyles.caption, { color: theme.colors.secondaryText, marginLeft: 6 }]}>{phone}</Text>
					</Pressable>
				))}
			</ScrollView>
		)}
	</View>
)

const styles = StyleSheet.create({
	section: {
		marginBottom: 18,
	},
	hintRow: {
		flexDirection: 'row',
		alignItems: 'center',
		marginTop: 8,
		paddingHorizontal: 4,
	},
	recentRow: {
		marginTop: 10,
	},
	recentChip: {
		flexDirection: 'row',
		alignItems: 'center',
		paddingHorizontal: 12,
		paddingVertical: 7,
		borderRadius: 16,
		marginRight: 8,
	},
})

export default TopupPhoneInput
