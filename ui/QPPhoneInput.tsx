import { useState } from 'react'
import type { ComponentProps } from 'react'
import { View, Text, StyleSheet } from 'react-native'
import { useTranslation } from 'react-i18next'
import FontAwesome6 from '@react-native-vector-icons/fontawesome6'

// Theme
import { useTheme } from '../theme/ThemeContext'
import type { Theme } from '../theme/ThemeContext'
import { createTextStyles } from '../theme/themeUtils'

// UI
import QPInput from './particles/QPInput'
import QPPressable from './particles/QPPressable'
import CountryPickerModal from './CountryPickerModal'

// Countries
import { countries } from '../labels/countries'

type QPPhoneInputProps = {
	country?: string
	onChangeCountry?: (code: string) => void
	lockedCountry?: { dial: string, flag?: string }
	valid?: boolean
} & ComponentProps<typeof QPInput>

/**
 * Phone-number row in the registration-wizard style: country dial-code chip +
 * phone input. Used by Register, Settings > Phone and PhoneTopupStep1.
 *
 * Two modes:
 * - Selectable: pass `country` (ISO code, e.g. 'CU') + `onChangeCountry(code)`.
 *   The chip opens the searchable CountryPickerModal, whose open/search state
 *   is managed internally so call sites don't have to.
 * - Locked: pass `lockedCountry` (`{ dial, flag? }`) — static chip, no picker
 *   (e.g. top-ups, where the operator fixes the country).
 *
 * @param props
 * @param props.country - Selected ISO country code (selectable mode).
 * @param props.onChangeCountry - Country selection handler.
 * @param props.lockedCountry - Fixed dial code (locked mode).
 * @param props.valid - Shows a success check inside the input.
 * @param props.inputProps - Remaining props are spread onto the underlying QPInput.
 */
const QPPhoneInput = ({ country, onChangeCountry, lockedCountry, valid, ...inputProps }: QPPhoneInputProps) => {

	const { t } = useTranslation()
	const { theme } = useTheme()
	const textStyles = createTextStyles(theme)

	// Estado interno del picker — los call sites no necesitan manejarlo
	const [showPicker, setShowPicker] = useState(false)
	const [search, setSearch] = useState('')

	const locked = !!lockedCountry
	const countryData = countries.find(c => c.code === country)
	const chipTextStyle = { color: theme.colors.primaryText, fontSize: theme.typography.fontSize.md, fontFamily: theme.typography.fontFamily.medium }
	// OJO: `theme.mode` no existe en el tema (siempre undefined) — bug de runtime
	// pre-existente que se preserva tal cual (el chip nunca pinta borde en light)
	const chipBorder = (theme as Theme & { mode?: string }).mode === 'light' && { borderWidth: 0.3, borderColor: theme.colors.primary }

	return (
		<>
			<View style={styles.row}>
				{locked ? (
					<View style={[styles.chip, { backgroundColor: theme.colors.surface }, chipBorder]}>
						{!!lockedCountry.flag && <Text style={chipTextStyle}>{lockedCountry.flag}</Text>}
						<Text style={chipTextStyle}>{lockedCountry.dial}</Text>
					</View>
				) : (
					<QPPressable
						style={[styles.chip, { backgroundColor: theme.colors.surface }, chipBorder]}
						onPress={() => setShowPicker(true)}
					>
						<Text style={chipTextStyle}>{countryData?.dial_code || '+53'}</Text>
						<FontAwesome6 name="chevron-down" size={12} color={theme.colors.secondaryText} iconStyle="solid" />
					</QPPressable>
				)}

				<View style={styles.inputWrap}>
					<QPInput
						placeholder={t('ui.phoneInput.placeholder')}
						keyboardType="phone-pad"
						textContentType="telephoneNumber"
						autoComplete="tel"
						style={styles.input}
						{...inputProps}
					/>
					{valid && (
						<View style={styles.validBadge} pointerEvents="none">
							<FontAwesome6 name="circle-check" size={18} color={theme.colors.successText} iconStyle="solid" />
						</View>
					)}
				</View>
			</View>

			{!locked && (
				<CountryPickerModal
					visible={showPicker}
					country={country as string}
					countrySearch={search}
					onChangeSearch={setSearch}
					onSelect={(code) => { onChangeCountry?.(code); setShowPicker(false); setSearch('') }}
					onClose={() => { setShowPicker(false); setSearch('') }}
					theme={theme}
					textStyles={textStyles}
				/>
			)}
		</>
	)
}

const styles = StyleSheet.create({
	row: {
		flexDirection: 'row',
		alignItems: 'center',
		gap: 8,
	},
	chip: {
		flexDirection: 'row',
		alignItems: 'center',
		gap: 6,
		height: 50,
		paddingHorizontal: 14,
		borderRadius: 10,
	},
	inputWrap: {
		flex: 1,
	},
	input: {
		marginVertical: 0,
	},
	validBadge: {
		position: 'absolute',
		right: 14,
		top: 0,
		bottom: 0,
		justifyContent: 'center',
	},
})

export default QPPhoneInput
