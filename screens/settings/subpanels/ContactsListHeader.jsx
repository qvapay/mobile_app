import { Text, View, Pressable, ActivityIndicator } from 'react-native'

import QPInput from '../../../ui/particles/QPInput'
import FontAwesome6 from '@react-native-vector-icons/fontawesome6'

// Header for the contacts list: title, local filter, error/sync banners, sync-agenda CTA.
const ContactsListHeader = ({ contactsCount, filteredCount, filterQuery, onChangeFilter, error, isSyncing, permissionStatus, isResolvingPermission, onSyncPress, theme, textStyles, containerStyles }) => (
	<>
		<Text style={textStyles.h1}>Contactos</Text>
		<Text style={[textStyles.h3, { color: theme.colors.secondaryText }]}>Personas a las que envias con frecuencia</Text>

		{contactsCount > 0 && (
			<QPInput
				placeholder="Buscar contacto ..."
				value={filterQuery}
				onChangeText={onChangeFilter}
				autoCapitalize="none"
				prefixIconName="magnifying-glass"
				style={{ marginTop: 12, marginBottom: 0 }}
			/>
		)}

		{error && (
			<View style={[containerStyles.card, { borderColor: theme.colors.danger, borderWidth: 1 }]}>
				<Text style={[textStyles.h6, { color: theme.colors.danger }]}>{String(error)}</Text>
			</View>
		)}

		{isSyncing && (
			<View style={[containerStyles.card, { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 10 }]}>
				<ActivityIndicator size="small" color={theme.colors.primary} />
				<Text style={[textStyles.h6, { color: theme.colors.secondaryText }]}>Sincronizando contactos...</Text>
			</View>
		)}

		{permissionStatus !== 'authorized' && permissionStatus !== 'limited' && (
			<Pressable
				onPress={isResolvingPermission ? undefined : onSyncPress}
				disabled={isResolvingPermission}
				style={[containerStyles.card, {
					borderColor: theme.colors.primary,
					borderWidth: 1,
					flexDirection: 'row',
					alignItems: 'center',
					gap: 12,
					marginTop: 10,
					opacity: isResolvingPermission ? 0.8 : 1,
				}]}
			>
				{isResolvingPermission ? (
					<ActivityIndicator size="small" color={theme.colors.primary} />
				) : (
					<FontAwesome6 name="address-book" size={28} color={theme.colors.primary} iconStyle="solid" />
				)}
				<View style={{ flex: 1 }}>
					<Text style={[textStyles.h5, { color: theme.colors.primaryText, fontWeight: '600' }]}>
						{isResolvingPermission ? 'Solicitando permiso...' : 'Sincronizar agenda'}
					</Text>
					<Text style={[textStyles.h6, { color: theme.colors.secondaryText }]}>
						Encuentra amigos que usan QvaPay
					</Text>
				</View>
				{!isResolvingPermission && (
					<FontAwesome6 name="chevron-right" size={14} color={theme.colors.tertiaryText} iconStyle="solid" />
				)}
			</Pressable>
		)}

		{filteredCount > 0 && (
			<Text style={[textStyles.h5, { color: theme.colors.primaryText, fontWeight: '600', marginTop: 10, marginBottom: 8 }]}>
				Contactos guardados ({filteredCount})
			</Text>
		)}
	</>
)

export default ContactsListHeader
