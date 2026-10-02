import { View, Text, StyleSheet, Pressable } from 'react-native'
import { useTranslation } from 'react-i18next'
import FontAwesome6 from '@react-native-vector-icons/fontawesome6'

import type { TextStyle } from 'react-native'
import type { Theme } from '../../theme/ThemeContext'

import { formatAddress } from './shippingAddress'
import type { ShippingAddress } from './shippingAddress'

type Props = {
	/** Saved addresses from `shopApi.getShippingAddresses`. */
	addresses: ShippingAddress[]
	/** Whether the "new address" row is selected. */
	useNewAddress: boolean
	/** Selected saved-address uuid. */
	selectedUuid: string | null
	/** `(uuid) => void`. */
	onSelectAddress: (uuid: string) => void
	/** Selects the "new address" row. */
	onNewAddress: () => void
	theme: Theme
	textStyles: Record<string, TextStyle>
}

/**
 * Saved-address radio list + "new address" row, shared by the assisted
 * shopping checkout and the marketplace cart. Presentational: theme and
 * textStyles arrive via props.
 */
const AddressPicker = ({ addresses, useNewAddress, selectedUuid, onSelectAddress, onNewAddress, theme, textStyles }: Props) => {
	const { t } = useTranslation()
	return (
	<View style={{ marginTop: 12, gap: 8 }}>
		{addresses.map(address => {
			const selected = !useNewAddress && selectedUuid === address.uuid
			return (
				<Pressable
					key={address.uuid}
					style={[
						styles.addressCard,
						{ backgroundColor: theme.colors.surface },
						(theme as Theme & { mode?: string }).mode === 'light' && { borderWidth: 1, borderColor: theme.colors.elevationLight },
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
							{address.label || t('ui.addressPicker.addressFallback')}{address.is_default ? t('ui.addressPicker.defaultSuffix') : ''}
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
				(theme as Theme & { mode?: string }).mode === 'light' && { borderWidth: 1, borderColor: theme.colors.elevationLight },
				useNewAddress && { borderWidth: 1.5, borderColor: theme.colors.primary },
			]}
			onPress={onNewAddress}
		>
			<FontAwesome6 name="plus" size={14} color={useNewAddress ? theme.colors.primary : theme.colors.secondaryText} iconStyle="solid" />
			<Text style={[textStyles.h6, { fontWeight: '600', color: useNewAddress ? theme.colors.primary : theme.colors.primaryText }]}>
				{t('ui.addressPicker.newAddress')}
			</Text>
		</Pressable>
	</View>
	)
}

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
