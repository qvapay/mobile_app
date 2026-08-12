import { View, Text, StyleSheet, Pressable } from 'react-native'
import FontAwesome6 from '@react-native-vector-icons/fontawesome6'

/**
 * One-line summary of a saved US shipping address, for cards and confirm modals.
 *
 * @param {Object} a - Address `{ recipient_name, line1, line2?, city, state, postal_code }`.
 * @returns {string} Human-readable summary.
 */
export const formatAddress = (a) => `${a.recipient_name} — ${a.line1}${a.line2 ? `, ${a.line2}` : ''}, ${a.city}, ${a.state} ${a.postal_code}`

/**
 * Saved-address radio list + "new address" row, shared by the assisted
 * shopping checkout and the marketplace cart. Presentational: theme and
 * textStyles arrive via props.
 *
 * @param {object} props
 * @param {Object[]} props.addresses - Saved addresses from `shopApi.getShippingAddresses`.
 * @param {boolean} props.useNewAddress - Whether the "new address" row is selected.
 * @param {string|null} props.selectedUuid - Selected saved-address uuid.
 * @param {function} props.onSelectAddress - `(uuid) => void`.
 * @param {function} props.onNewAddress - Selects the "new address" row.
 */
const AddressPicker = ({ addresses, useNewAddress, selectedUuid, onSelectAddress, onNewAddress, theme, textStyles }) => (
	<View style={{ marginTop: 12, gap: 8 }}>
		{addresses.map(address => {
			const selected = !useNewAddress && selectedUuid === address.uuid
			return (
				<Pressable
					key={address.uuid}
					style={[
						styles.addressCard,
						{ backgroundColor: theme.colors.surface },
						theme.mode === 'light' && { borderWidth: 1, borderColor: theme.colors.elevationLight },
						selected && { borderWidth: 1.5, borderColor: theme.colors.primary },
					]}
					onPress={() => onSelectAddress(address.uuid)}
				>
					<FontAwesome6
						name={selected ? 'circle-check' : 'circle'}
						size={16}
						color={selected ? theme.colors.primary : theme.colors.secondaryText}
						iconStyle={selected ? 'solid' : 'regular'}
					/>
					<View style={{ flex: 1 }}>
						<Text style={[textStyles.h6, { fontWeight: '600' }]}>
							{address.label || 'Dirección'}{address.is_default ? ' · Predeterminada' : ''}
						</Text>
						<Text style={[textStyles.caption, { color: theme.colors.secondaryText, marginTop: 2 }]} numberOfLines={2}>
							{formatAddress(address)}
						</Text>
					</View>
				</Pressable>
			)
		})}

		<Pressable
			style={[
				styles.addressCard,
				{ backgroundColor: theme.colors.surface },
				theme.mode === 'light' && { borderWidth: 1, borderColor: theme.colors.elevationLight },
				useNewAddress && { borderWidth: 1.5, borderColor: theme.colors.primary },
			]}
			onPress={onNewAddress}
		>
			<FontAwesome6 name="plus" size={14} color={useNewAddress ? theme.colors.primary : theme.colors.secondaryText} iconStyle="solid" />
			<Text style={[textStyles.h6, { fontWeight: '600', color: useNewAddress ? theme.colors.primary : theme.colors.primaryText }]}>
				Nueva dirección
			</Text>
		</Pressable>
	</View>
)

const styles = StyleSheet.create({
	addressCard: {
		flexDirection: 'row',
		alignItems: 'center',
		gap: 12,
		padding: 14,
		borderRadius: 14,
	},
})

export default AddressPicker
