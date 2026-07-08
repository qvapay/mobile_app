import { Text, View, ScrollView, Modal, StyleSheet } from 'react-native'
import QPPressable from './particles/QPPressable'

import QPInput from './particles/QPInput'
import FontAwesome6 from '@react-native-vector-icons/fontawesome6'
import { countries } from '../labels/countries'

/**
 * Searchable country picker modal used by phone-entry forms (embedded by
 * QPPhoneInput). Filters the static `labels/countries` list by name or ISO
 * code as the user types; the selected row is highlighted in the primary
 * color. Fully controlled — search text and selection live in the caller
 * (QPPhoneInput manages both internally). Slides up over a dimmed backdrop.
 * `theme`/`textStyles` are injected by the caller instead of read from context.
 *
 * @param {object} props
 * @param {boolean} props.visible - Controls modal visibility.
 * @param {string} props.country - Currently selected ISO country code (e.g. 'CU').
 * @param {string} props.countrySearch - Current search query.
 * @param {(text: string) => void} props.onChangeSearch - Search input handler.
 * @param {(code: string) => void} props.onSelect - Called with the ISO code of the tapped country.
 * @param {() => void} props.onClose - Dismiss handler (close button / back button).
 */
const CountryPickerModal = ({ visible, country, countrySearch, onChangeSearch, onSelect, onClose, theme, textStyles }) => {

	const query = countrySearch.toLowerCase()

	return (
		<Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
			<View style={styles.modalOverlay}>
				<View style={[styles.modalContent, { backgroundColor: theme.colors.surface }]}>
					<View style={styles.modalHeader}>
						<Text style={[textStyles.h4, { color: theme.colors.primaryText }]}>Seleccionar país</Text>
						<QPPressable onPress={onClose}>
							<FontAwesome6 name="circle-xmark" size={24} color={theme.colors.secondaryText} />
						</QPPressable>
					</View>
					<QPInput
						value={countrySearch}
						onChangeText={onChangeSearch}
						placeholder="Buscar país..."
						prefixIconName="magnifying-glass"
						style={{ marginVertical: 0 }}
					/>
					<ScrollView style={{ maxHeight: 400 }}>
						{countries.flatMap((c) => (c.name.toLowerCase().includes(query) || c.code.toLowerCase().includes(query)) ? [
							<QPPressable
								variant="opacity"
								key={`${c.code}-${c.dial_code}`}
								style={[styles.countryItem, { backgroundColor: country === c.code ? theme.colors.primary : theme.colors.background }]}
								onPress={() => onSelect(c.code)}
							>
								<Text style={[styles.countryItemText, { color: country === c.code ? theme.colors.buttonText : theme.colors.primaryText, fontSize: theme.typography.fontSize.md, fontFamily: theme.typography.fontFamily.regular }]}>
									{c.name} ({c.dial_code})
								</Text>
							</QPPressable>
						] : [])}
					</ScrollView>
				</View>
			</View>
		</Modal>
	)
}

const styles = StyleSheet.create({
	modalOverlay: {
		flex: 1,
		backgroundColor: 'rgba(0, 0, 0, 0.5)',
		justifyContent: 'center',
		alignItems: 'center',
	},
	modalContent: {
		width: '90%',
		maxHeight: '80%',
		borderRadius: 16,
		padding: 20,
	},
	modalHeader: {
		flexDirection: 'row',
		justifyContent: 'space-between',
		alignItems: 'center',
		marginBottom: 10,
	},
	countryItem: {
		paddingVertical: 15,
		paddingHorizontal: 20,
		borderRadius: 10,
		marginBottom: 8,
	},
	countryItemText: {
	},
})

export default CountryPickerModal
