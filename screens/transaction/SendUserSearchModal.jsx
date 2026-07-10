import { useState, useEffect, useMemo } from 'react'
import { View, Text, Modal, FlatList } from 'react-native'

// Theme
import { useTheme } from '../../theme/ThemeContext'
import { createTextStyles, createContainerStyles } from '../../theme/themeUtils'

// Particles
import QPInput from '../../ui/particles/QPInput'
import QPButton from '../../ui/particles/QPButton'
import QPAvatar from '../../ui/particles/QPAvatar'
import QPPressable from '../../ui/particles/QPPressable'

// Font Awesome
import FontAwesome6 from '@react-native-vector-icons/fontawesome6'

// API
import { userApi } from '../../api/userApi'

// Notifications
import { toast } from 'sonner-native'
import { useOnlineStatus } from '../../hooks/OnlineStatusContext'

// Helpers
import { displayFullName } from '../../helpers/displayName'

// Self-contained "send to" user search: live-filters the carousel + queries the API.
const SendUserSearchModal = ({ visible, onClose, carouselUsers, onSelect }) => {

	const { theme } = useTheme()
	const textStyles = createTextStyles(theme)
	const containerStyles = createContainerStyles(theme)
	const { trackUsers, untrackUsers, isUserOnline } = useOnlineStatus()
	const [userSearch, setUserSearch] = useState('')
	const [searchResults, setSearchResults] = useState([])
	const [isSearching, setIsSearching] = useState(false)

	// Track search results for online status
	useEffect(() => {
		const ids = searchResults.map(u => u.uuid).filter(Boolean)
		if (ids.length) trackUsers(ids)
		return () => { if (ids.length) untrackUsers(ids) }
	}, [searchResults, trackUsers, untrackUsers])

	// Live filter carousel users by search query
	const filteredCarouselUsers = useMemo(() => {
		const q = userSearch.trim().toLowerCase()
		if (!q) return carouselUsers
		return carouselUsers.filter((u) => {
			const name = (u.name || '').toLowerCase()
			const lastname = (u.lastname || '').toLowerCase()
			const username = (u.username || '').toLowerCase()
			return name.includes(q) || lastname.includes(q) || username.includes(q)
		})
	}, [carouselUsers, userSearch])

	const handleSearch = async () => {
		if (!userSearch.trim()) {
			setSearchResults([])
			return
		}
		try {
			setIsSearching(true)
			const result = await userApi.searchUser(userSearch)
			if (result.success) {
				setSearchResults(result.data || [])
			} else {
				setSearchResults([])
				toast.error('Error', { description: result.error })
			}
		} catch (err) {
			setSearchResults([])
			toast.error('Error', { description: err.message })
		} finally { setIsSearching(false) }
	}

	const handleSelect = (selectedUser) => {
		onSelect(selectedUser)
		setUserSearch('')
		setSearchResults([])
	}

	// Merge: local filtered contacts first, then API results (no duplicates)
	const localUuids = new Set(filteredCarouselUsers.map(u => u.uuid))
	const apiOnly = searchResults.filter(u => !localUuids.has(u.uuid))
	const merged = [...filteredCarouselUsers, ...apiOnly]
	const hasQuery = userSearch.trim().length > 0

	return (
		<Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
			<View style={[containerStyles.subContainer, { flex: 1, backgroundColor: theme.colors.background, paddingTop: 20, paddingHorizontal: 0 }]}>

				{/* Modal Header */}
				<View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, paddingHorizontal: 20 }}>
					<Text style={[textStyles.h4, { color: theme.colors.primaryText }]}>Buscar Usuario</Text>
					<QPPressable
						onPress={onClose}
						style={{ backgroundColor: theme.colors.elevation, width: 32, height: 32, borderRadius: 16, justifyContent: 'center', alignItems: 'center' }}
					>
						<FontAwesome6 name="xmark" size={16} color={theme.colors.primaryText} iconStyle="solid" />
					</QPPressable>
				</View>

				{/* Search Input */}
				<View style={{ paddingHorizontal: 20, marginBottom: 20 }}>
					<View style={{ flexDirection: 'row', borderRadius: 10, overflow: 'hidden', borderWidth: 1, borderColor: theme.colors.primary, backgroundColor: theme.colors.surface, alignItems: 'center', height: 50 }}>
						<View style={{ flex: 1 }}>
							<QPInput
								placeholder="Buscar usuario ..."
								value={userSearch}
								onChangeText={setUserSearch}
								disabled={isSearching}
								autoCapitalize="none"
								prefixIconName="user"
								style={{ borderTopRightRadius: 0, borderBottomRightRadius: 0, borderWidth: 0, marginVertical: 0, height: '100%' }}
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
							style={{ width: 50, height: '100%', borderRadius: 0, marginVertical: 0 }}
						/>
					</View>
				</View>

				{/* Search Results / Contacts list */}
				<View style={{ flex: 1, paddingHorizontal: 20 }}>
					{merged.length > 0 ? (
						<FlatList
							data={merged}
							keyExtractor={(item) => item.uuid}
							showsVerticalScrollIndicator={false}
							renderItem={({ item, index }) => {
								const radius = theme.borderRadius?.md ?? 12
								return (
									<QPPressable
										variant="opacity"
										onPress={() => handleSelect(item)}
										style={[containerStyles.card, {
											flexDirection: 'row',
											alignItems: 'center',
											gap: 12,
											marginVertical: 0,
											borderRadius: 0,
											...(index === 0 && { borderTopLeftRadius: radius, borderTopRightRadius: radius }),
											...(index === merged.length - 1 && { borderBottomLeftRadius: radius, borderBottomRightRadius: radius }),
										}]}
									>
										<QPAvatar user={item} size={48} isOnline={isUserOnline(item.uuid)} />
										<View style={{ flex: 1 }}>
											<Text style={[textStyles.h6, { color: theme.colors.primaryText, fontWeight: '600' }]}>
												{displayFullName(item)}
											</Text>
											<Text style={[textStyles.h6, { color: theme.colors.secondaryText }]}>
												@{item.username}
											</Text>
										</View>
										<FontAwesome6 name="chevron-right" size={16} color={theme.colors.tertiaryText} iconStyle="solid" />
									</QPPressable>
								)
							}}
						/>
					) : hasQuery && !isSearching ? (
						<View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', paddingVertical: 40 }}>
							<FontAwesome6 name="user-slash" size={48} color={theme.colors.tertiaryText} iconStyle="solid" />
							<Text style={[textStyles.h6, { color: theme.colors.tertiaryText, marginTop: 16, textAlign: 'center' }]}>
								No se encontraron usuarios
							</Text>
							<Text style={[textStyles.h6, { color: theme.colors.tertiaryText, marginTop: 8, textAlign: 'center' }]}>
								Intenta con otro nombre o username
							</Text>
						</View>
					) : (
						<View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', paddingVertical: 40 }}>
							<FontAwesome6 name="magnifying-glass" size={48} color={theme.colors.tertiaryText} iconStyle="solid" />
							<Text style={[textStyles.h6, { color: theme.colors.tertiaryText, marginTop: 16, textAlign: 'center' }]}>
								Busca por nombre, username o email
							</Text>
						</View>
					)}
				</View>
			</View>
		</Modal>
	)
}

export default SendUserSearchModal
