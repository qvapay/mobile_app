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
	/** Why an address can't be used for this purchase (null = usable): dimmed, with the reason. */
	issueFor?: (address: ShippingAddress) => string | null
	/** Whether an unusable address is fixed by completing it (a Cuban one without ID card…). */
	needsCompletion?: (address: ShippingAddress) => boolean
	/** Opens the form to complete that address. */
	onComplete?: (uuid: string) => void
	/** Address being completed right now (its form is open below the list). */
	editingUuid?: string | null
	theme: Theme
	textStyles: Record<string, TextStyle>
}

/**
 * Saved-address radio list + "new address" row, shared by the assisted
 * shopping checkout and the marketplace cart. Presentational: theme and
 * textStyles arrive via props. An address the purchase can't use stays
 * selectable (so the cart can say why per line) but reads dimmed with its
 * reason, and one that only needs data (a Cuban address without the ID card
 * or with a municipality typed by hand) offers «Completar dirección».
 */
const AddressPicker = ({ addresses, useNewAddress, selectedUuid, onSelectAddress, onNewAddress, issueFor, needsCompletion, onComplete, editingUuid = null, theme, textStyles }: Props) => {
	const { t } = useTranslation()
	return (
	<View style={{ marginTop: 12, gap: 8 }}>
		{addresses.map(address => {
			const selected = !useNewAddress && selectedUuid === address.uuid
			const editing = editingUuid === address.uuid
			const issue = editing ? null : issueFor?.(address) || null
			const completable = !editing && !!onComplete && !!needsCompletion?.(address)
			return (
				<Pressable
					key={address.uuid}
					style={[
						styles.addressCard,
						{ backgroundColor: theme.colors.surface },
						!theme.isDark && { borderWidth: 1, borderColor: theme.colors.elevationLight },
						selected && { borderWidth: 1.5, borderColor: theme.colors.primary },
					]}
					onPress={() => onSelectAddress(address.uuid)}
					accessibilityRole="radio"
					accessibilityState={{ selected }}
				>
					<FontAwesome6
						name={selected ? 'circle-check' : 'circle'}
						size={16}
						color={selected ? theme.colors.primary : theme.colors.secondaryText}
						iconStyle={selected ? 'solid' : 'regular'}
					/>
					<View style={{ flex: 1 }}>
						<View style={[issue && !selected && styles.dimmed]}>
							<Text style={[textStyles.h6, { fontWeight: '600' }]}>
								{address.label || t('ui.addressPicker.addressFallback')}{address.is_default ? t('ui.addressPicker.defaultSuffix') : ''}
							</Text>
							<Text style={[textStyles.caption, { color: theme.colors.secondaryText, marginTop: 2 }]} numberOfLines={2}>
								{formatAddress(address)}
							</Text>
						</View>
						{editing && (
							<Text style={[textStyles.caption, styles.note, styles.completing, { color: theme.colors.primary }]}>
								{t('ui.addressPicker.completing')}
							</Text>
						)}
						{!!issue && (
							<Text style={[textStyles.caption, styles.note, { color: selected ? theme.colors.warning : theme.colors.tertiaryText }]}>
								{issue}
							</Text>
						)}
						{completable && (
							<Pressable onPress={() => onComplete!(address.uuid)} hitSlop={8} style={styles.completeLink} accessibilityRole="button">
								<Text style={[textStyles.caption, styles.completeText, { color: theme.colors.primary }]}>{t('ui.addressPicker.complete')}</Text>
							</Pressable>
						)}
					</View>
				</Pressable>
			)
		})}

		<Pressable
			style={[
				styles.addressCard,
				{ backgroundColor: theme.colors.surface },
				!theme.isDark && { borderWidth: 1, borderColor: theme.colors.elevationLight },
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
	dimmed: {
		opacity: 0.55,
	},
	note: {
		marginTop: 4,
	},
	completing: {
		fontWeight: '500',
	},
	completeLink: {
		alignSelf: 'flex-start',
		marginTop: 6,
	},
	completeText: {
		fontWeight: '600',
	},
})

export default AddressPicker
