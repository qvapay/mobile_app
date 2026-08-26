import { useState, useEffect } from 'react'
import { FlashList } from '@shopify/flash-list'
import { Text, View, Modal } from 'react-native'
import { useTranslation } from 'react-i18next'

// UI Particles
import QPInput from '../../../ui/particles/QPInput'
import QPButton from '../../../ui/particles/QPButton'
import QPAvatar from '../../../ui/particles/QPAvatar'
import QPPressable from '../../../ui/particles/QPPressable'

// Fonts
import FontAwesome6 from '@react-native-vector-icons/fontawesome6'

// API
import { userApi } from '../../../api/userApi'

// Notifications
import { toast } from 'sonner-native'
import { useOnlineStatus } from '../../../hooks/OnlineStatusContext'

// Helpers
import { displayFullName } from '../../../helpers/displayName'

// Tipos
import type { Theme } from '../../../theme/ThemeContext'
import type { TextStyles, ContainerStyles } from '../../../theme/themeUtils'

/** Resultado de `POST /user/search`: subset del perfil que la fila pinta. */
type SearchedUser = {
	uuid: string
	name?: string
	lastname?: string
	username?: string
	image?: string | null
	vip?: boolean
	golden_check?: boolean
}

type AddContactModalProps = {
	visible: boolean
	onClose: () => void
	onAdded: () => void
	theme: Theme
	textStyles: TextStyles
	containerStyles: ContainerStyles
}

// Self-contained "add contact" modal: user search + add. Reports success via onAdded.
const AddContactModal = ({ visible, onClose, onAdded, theme, textStyles, containerStyles }: AddContactModalProps) => {

	const { t } = useTranslation()
	const { trackUsers, untrackUsers, isUserOnline } = useOnlineStatus()

	const [userSearch, setUserSearch] = useState('')
	const [searchResults, setSearchResults] = useState<SearchedUser[]>([])
	const [isSearching, setIsSearching] = useState(false)

	// Track search results for online status
	useEffect(() => {
		const ids = searchResults.map(u => u.uuid).filter(Boolean)
		if (ids.length) trackUsers(ids)
		return () => { if (ids.length) untrackUsers(ids) }
	}, [searchResults, trackUsers, untrackUsers])

	// Search handler
	const handleSearch = async () => {
		if (!userSearch.trim()) {
			setSearchResults([])
			return
		}
		try {
			setIsSearching(true)
			const result = await userApi.searchUser(userSearch)
			if (result.success) {
				// userApi.searchUser declara `ApiResult<unknown>`: forma local del listado.
				setSearchResults((result.data as SearchedUser[] | undefined) || [])
			} else {
				setSearchResults([])
				toast.error(result.error || t('settings.contacts.addModal.toasts.searchError'))
			}
		} catch (e) {
			setSearchResults([])
			toast.error((e as Error).message || t('settings.contacts.toasts.networkError'))
		} finally { setIsSearching(false) }
	}

	// Add contact handler
	const handleAddContact = async (selectedUser: SearchedUser) => {
		try {
			// `name` es opcional en el resultado de búsqueda pero addContact lo declara requerido.
			const res = await userApi.addContact(selectedUser.uuid, selectedUser.name as string)
			if (res.success) {
				toast.success(t('settings.contacts.addModal.toasts.added'))
				onClose()
				setUserSearch('')
				setSearchResults([])
				onAdded()
			} else { toast.error(res.error || t('settings.contacts.addModal.toasts.addFailed')) }
		} catch (e) { toast.error((e as Error).message || t('settings.contacts.toasts.networkError')) }
	}

	return (
		<Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>

			<View style={[containerStyles.subContainer, { flex: 1, backgroundColor: theme.colors.background, paddingTop: 20, paddingHorizontal: 0 }]}>

				{/* Modal Header */}
				<View style={{
					flexDirection: 'row',
					alignItems: 'center',
					justifyContent: 'space-between',
					marginBottom: 20,
					paddingHorizontal: 20
				}}>
					<Text style={[textStyles.h4, { color: theme.colors.primaryText }]}>
						{t('settings.contacts.addModal.title')}
					</Text>
					<QPPressable
						onPress={onClose}
						style={{
							backgroundColor: theme.colors.elevation,
							width: 32,
							height: 32,
							borderRadius: 16,
							justifyContent: 'center',
							alignItems: 'center'
						}}
					>
						<FontAwesome6 name="xmark" size={16} color={theme.colors.primaryText} iconStyle="solid" />
					</QPPressable>
				</View>

				{/* Search Input */}
				<View style={{ paddingHorizontal: 20, marginBottom: 20 }}>
					<View style={{ flexDirection: 'row', borderRadius: 10, overflow: 'hidden', borderWidth: 1, borderColor: theme.colors.primary, backgroundColor: theme.colors.surface, alignItems: 'center', height: 50 }}>
						<View style={{ flex: 1 }}>
							{/* OJO (pre-existente): QPInput es TextInputProps y NO declara `disabled`
							    (RN usa `editable`) — el prop llega al TextInput y se ignora. */}
							<QPInput
								placeholder={t('settings.contacts.addModal.searchPlaceholder')}
								value={userSearch}
								onChangeText={setUserSearch}
								{...({ disabled: isSearching } as object)}
								autoCapitalize="none"
								prefixIconName="user"
								style={{
									borderTopRightRadius: 0,
									borderBottomRightRadius: 0,
									borderWidth: 0,
									marginVertical: 0,
									height: '100%',
								}}
							/>
						</View>
						<QPButton
							title=""
							onPress={handleSearch}
							disabled={isSearching}
							loading={isSearching}
							textStyle={{ color: theme.colors.almostWhite }}
							icon="magnifying-glass"
							iconStyle="solid"
							iconColor={theme.colors.almostWhite}
							style={{
								width: 50,
								height: '100%',
								borderRadius: 0,
								marginVertical: 0,
							}}
						/>
					</View>
				</View>

				{/* Search Results */}
				<View style={{ flex: 1, paddingHorizontal: 20 }}>
					{searchResults.length > 0 ? (
						<FlashList
							data={searchResults}
							keyExtractor={(item) => item.uuid}
							showsVerticalScrollIndicator={false}
							{...({ estimatedItemSize: 80 } as object)}
							renderItem={({ item }) => (
								<View style={{
									backgroundColor: theme.colors.surface,
									borderRadius: 12,
									padding: 16,
									marginBottom: 8,
									// OJO (pre-existente): el tema expone `isDark`, NO `mode` — esta condición
									// es SIEMPRE falsa y el borde de modo claro nunca se pinta.
									...((theme as Theme & { mode?: string }).mode === 'light' && { borderWidth: 1, borderColor: theme.colors.border }),
									flexDirection: 'row',
									alignItems: 'center',
									gap: 12
								}}>
									<QPAvatar user={item} size={48} isOnline={isUserOnline(item.uuid)} />
									<View style={{ flex: 1 }}>
										<Text style={[textStyles.h6, { color: theme.colors.primaryText, fontWeight: '600' }]}>
											{displayFullName(item)}
										</Text>
										<Text style={[textStyles.h6, { color: theme.colors.secondaryText }]}>
											@{item.username}
										</Text>
									</View>
									<QPPressable
										onPress={() => handleAddContact(item)}
										style={{
											backgroundColor: theme.colors.primary,
											borderRadius: 8,
											paddingHorizontal: 12,
											paddingVertical: 6,
										}}
									>
										<Text style={[textStyles.h6, { color: theme.colors.almostWhite, fontWeight: '600' }]}>{t('settings.contacts.addModal.addButton')}</Text>
									</QPPressable>
								</View>
							)}
						/>
					) : userSearch.trim() && !isSearching ? (
						<View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', paddingVertical: 40 }}>
							<FontAwesome6 name="user-slash" size={48} color={theme.colors.tertiaryText} iconStyle="solid" />
							<Text style={[textStyles.h6, { color: theme.colors.tertiaryText, marginTop: 16, textAlign: 'center' }]}>
								{t('settings.contacts.addModal.noUsersFound')}
							</Text>
							<Text style={[textStyles.h6, { color: theme.colors.tertiaryText, marginTop: 8, textAlign: 'center' }]}>
								{t('settings.contacts.addModal.tryAnotherName')}
							</Text>
						</View>
					) : (
						<View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', paddingVertical: 40 }}>
							<FontAwesome6 name="magnifying-glass" size={48} color={theme.colors.tertiaryText} iconStyle="solid" />
							<Text style={[textStyles.h6, { color: theme.colors.tertiaryText, marginTop: 16, textAlign: 'center' }]}>
								{t('settings.contacts.addModal.searchHint')}
							</Text>
						</View>
					)}
				</View>
			</View>
		</Modal>
	)
}

export default AddContactModal
