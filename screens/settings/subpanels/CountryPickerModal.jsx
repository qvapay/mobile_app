import { Text, View, ScrollView, TouchableOpacity, Modal, StyleSheet } from 'react-native'

import QPInput from '../../../ui/particles/QPInput'
import FontAwesome6 from '@react-native-vector-icons/fontawesome6'
import { countries } from '../../../labels/countries'

// Searchable country picker modal used by the phone-verification form.
const CountryPickerModal = ({ visible, country, countrySearch, onChangeSearch, onSelect, onClose, theme, textStyles }) => (
	<Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
		<View style={styles.modalOverlay}>
			<View style={[styles.modalContent, { backgroundColor: theme.colors.surface }]}>
				<View style={styles.modalHeader}>
					<Text style={[textStyles.h4, { color: theme.colors.primaryText }]}>Seleccionar país</Text>
					<TouchableOpacity onPress={onClose}>
						<FontAwesome6 name="circle-xmark" size={24} color={theme.colors.secondaryText} />
					</TouchableOpacity>
				</View>
				<QPInput
					value={countrySearch}
					onChangeText={onChangeSearch}
					placeholder="Buscar país..."
					prefixIconName="magnifying-glass"
					style={{ marginVertical: 0 }}
				/>
				<ScrollView style={{ maxHeight: 400 }}>
					{countries.filter(c => c.name.toLowerCase().includes(countrySearch.toLowerCase()) || c.code.toLowerCase().includes(countrySearch.toLowerCase())).map((c) => (
						<TouchableOpacity
							key={`${c.code}-${c.dial_code}`}
							style={[styles.countryItem, { backgroundColor: country === c.code ? theme.colors.primary : theme.colors.background }]}
							onPress={() => onSelect(c.code)}
						>
							<Text style={[styles.countryItemText, { color: country === c.code ? theme.colors.buttonText : theme.colors.primaryText, fontSize: theme.typography.fontSize.md, fontFamily: theme.typography.fontFamily.regular }]}>
								{c.name} ({c.dial_code})
							</Text>
						</TouchableOpacity>
					))}
				</ScrollView>
			</View>
		</View>
	</Modal>
)

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
