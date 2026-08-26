import { View, Text, StyleSheet, Pressable, ScrollView } from 'react-native'
import { useTranslation } from 'react-i18next'
import FontAwesome6 from '@react-native-vector-icons/fontawesome6'

import QPPhoneInput from '../../../ui/QPPhoneInput'

import type { Theme } from '../../../theme/ThemeContext'
import type { TextStyles } from '../../../theme/themeUtils'

// Destino fijo: las recargas por tienda son solo para números cubanos
const CUBA = { flag: '🇨🇺', dial: '+53' }

type TopupPhoneInputProps = {
	/** Local digits as typed (no dial code). */
	phoneNumber: string
	/** Whether the number passes the Cuban mobile pattern. */
	phoneValid: boolean
	onChangePhone: (text: string) => void
	/** E.164 numbers previously topped up. */
	recentNumbers?: string[]
	/** Called with the E.164 number of a tapped chip. */
	onPickRecent?: (phone: string) => void
	theme: Theme
	textStyles: TextStyles
}

/**
 * Recipient phone input for store-billed top-ups: +53 locked chip, validation
 * hint and a row of recently used numbers (chips) for one-tap reuse.
 */
const TopupPhoneInput = ({ phoneNumber, phoneValid, onChangePhone, recentNumbers = [], onPickRecent, theme, textStyles }: TopupPhoneInputProps) => {
	const { t } = useTranslation()
	return (
	<View style={styles.section}>
		<Text style={[textStyles.h6, { color: theme.colors.primaryText, fontWeight: '600', marginBottom: 8 }]}>
			<FontAwesome6 name="phone" size={12} color={theme.colors.primaryText} iconStyle="solid" />  {t('topup.phone.label')}
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
					{t('topup.phone.invalidHint')}
				</Text>
			</View>
		) : (
			<View style={styles.hintRow}>
				<FontAwesome6 name="circle-info" size={11} color={theme.colors.tertiaryText} iconStyle="solid" />
				<Text style={[textStyles.caption, { color: theme.colors.tertiaryText, marginLeft: 6 }]}>
					{t('topup.phone.onlyCuba')}
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
							(theme as Theme & { mode?: 'light' | 'dark' }).mode === 'light' && { borderWidth: 1, borderColor: theme.colors.border },
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
}

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
