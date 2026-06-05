import { useState, useEffect, useReducer } from 'react'
import { View, Text, ScrollView, Pressable } from 'react-native'

// Context and Theme
import { useAuth } from '../../auth/AuthContext'
import { useTheme } from '../../theme/ThemeContext'
import { createTextStyles, createContainerStyles } from '../../theme/themeUtils'

// UI Particles
import AmountInput from '../../ui/AmountInput'
import QPInput from '../../ui/particles/QPInput'
import QPAvatar from '../../ui/particles/QPAvatar'
import QPButton from '../../ui/particles/QPButton'
import QPPressable from '../../ui/particles/QPPressable'
import ProfileContainerHorizontal from '../../ui/ProfileContainerHorizontal'
import QPKeyboardView from '../../ui/QPKeyboardView'
import TransactionSticker from '../../ui/particles/TransactionSticker'


import SendUserSearchModal from './SendUserSearchModal'
import StickerPickerModal from './StickerPickerModal'

// Stickers
import { parseTransactionDescription, buildStickerDescription } from '../../helpers/stickers'

// Routes
import { ROUTES } from '../../routes'

// API
import { userApi } from '../../api/userApi'
import { transferApi } from '../../api/transferApi'

// Toast
import { toast } from 'sonner-native'

// Icons
import FontAwesome6 from '@react-native-vector-icons/fontawesome6'

// Online Status
import { useOnlineStatus } from '../../hooks/OnlineStatusContext'

// Generic field setter for the related-state slices below
function setFieldReducer(state, action) {
	switch (action.type) {
		case 'set':
			return { ...state, [action.field]: action.value }
		default:
			return state
	}
}

// Send Screen, search user, send money and show success message
const Send = ({ navigation, route }) => {

	// Context
	const { user } = useAuth()
	const { theme } = useTheme()
	const textStyles = createTextStyles(theme)
	const containerStyles = createContainerStyles(theme)
	// Params from route
	const { send_amount, user_uuid = null } = route.params || {}

	// Transfer form (amount + message) — same-named setters keep call sites unchanged
	const [form, dispatchForm] = useReducer(setFieldReducer, { amount: send_amount || '', description: '' })
	const { amount, description } = form
	const setAmount = (value) => dispatchForm({ type: 'set', field: 'amount', value })
	const setDescription = (value) => dispatchForm({ type: 'set', field: 'description', value })

	// Recipient selection (resolved user + incoming uuid + carousel of recent/contacts)
	const [recipient, dispatchRecipient] = useReducer(setFieldReducer, { userFound: null, incomingUserUuid: user_uuid || null, carouselUsers: [] })
	const { userFound, incomingUserUuid, carouselUsers } = recipient
	const setUserFound = (value) => dispatchRecipient({ type: 'set', field: 'userFound', value })
	const setIncomingUserUuid = (value) => dispatchRecipient({ type: 'set', field: 'incomingUserUuid', value })
	const setCarouselUsers = (value) => dispatchRecipient({ type: 'set', field: 'carouselUsers', value })

	// Modals + loading
	const [isSearchModalVisible, setIsSearchModalVisible] = useState(false)
	const [isStickerPickerVisible, setIsStickerPickerVisible] = useState(false)
	const [isLoading, setIsLoading] = useState(false)

	// Sticker / derived
	const parsedDescription = parseTransactionDescription(description)
	const isStickerSelected = parsedDescription.type === 'sticker'
	const isGold = !!user?.golden_check
	// Enabled once there's a positive amount and a selected recipient — derive it, don't store it
	const sendEnabled = !!(amount && parseFloat(amount) > 0 && userFound !== null)

	// Online status
	const { trackUsers, untrackUsers, isUserOnline } = useOnlineStatus()

	// Track carousel users for online status
	useEffect(() => {
		const ids = carouselUsers.map(u => u.uuid).filter(Boolean)
		if (ids.length) trackUsers(ids)
		return () => { if (ids.length) untrackUsers(ids) }
	}, [carouselUsers, trackUsers, untrackUsers])

	// Get latest sent transfers users, saved contacts, and synced contacts
	useEffect(() => {
		const fetchCarouselUsers = async () => {
			try {
				const seen = new Set()
				const combined = []

				// 1. Latest sent transfers
				const sentResult = await transferApi.getLatestSentTransfers(10)
				if (sentResult.success) {
					const users = (sentResult.data || []).filter(u => u.image)
					for (const u of users) {
						if (u.uuid && !seen.has(u.uuid)) {
							seen.add(u.uuid)
							combined.push(u)
						}
					}
				}

				// 2. Saved contacts
				const contactsResult = await userApi.getContacts()
				if (contactsResult.success) {
					const list = Array.isArray(contactsResult.data) ? contactsResult.data : (contactsResult.data?.contacts || [])
					for (const c of list) {
						const cu = c?.Contact || {}
						if (cu.uuid && !seen.has(cu.uuid) && cu.image) {
							seen.add(cu.uuid)
							combined.push(cu)
						}
					}
				}

				setCarouselUsers(combined)
			} catch (err) { /* error fetching carousel users */ }
			finally { setIsLoading(false) }
		}
		fetchCarouselUsers()
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [])

	// If user uuid is provided in the route, try to fetch user data
	useEffect(() => {
		if (incomingUserUuid) {
			const fetchUserData = async () => {
				try {
					const result = await userApi.searchUser(incomingUserUuid)
					if (result.success && result.data?.length > 0) { setUserFound(result.data[0]) }
				} catch (err) { /* error fetching user data */ }
			}
			fetchUserData()
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [incomingUserUuid])

	// Handle Send
	const handleSendConfirm = async () => {
		try {
			setIsLoading(true)
			navigation.navigate(ROUTES.SEND_CONFIRM, {
				user_uuid: userFound.uuid,
				send_amount: amount,
				description: description
			})
		} catch (err) {
			toast.error('Error', { description: err.message })
		} finally { setIsLoading(false) }
	}

	// Render
	return (
		<>
			<QPKeyboardView
				actions={
					<QPButton
						title={`Enviar $${amount || '0'}`}
						onPress={handleSendConfirm}
						disabled={!sendEnabled}
						loading={isLoading}
						textStyle={{ color: theme.colors.buttonText }}
					/>
				}
			>

				{/* Amount Input Component */}
				<AmountInput amount={amount} onAmountChange={setAmount} balance={user?.balance} placeholder={incomingUserUuid ? 'Monto a enviar' : 'Monto a enviar a ...'} />

				{/** Latest sent transfers users */}
				<View style={{ marginVertical: 20, gap: 10 }}>

					<View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
						<Text style={[textStyles.h5, { color: theme.colors.tertiaryText }]}>Enviar a:</Text>
						<Pressable onPress={() => navigation.navigate(ROUTES.CONTACTS)} style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
							<Text style={[textStyles.h6, { color: theme.colors.primary }]}>Ver todos</Text>
							<FontAwesome6 name="arrow-right" size={10} color={theme.colors.primary} iconStyle="solid" />
						</Pressable>
					</View>

					{userFound ? (
						<View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 10 }}>
							<View style={{ flex: 1, marginRight: 10 }}>
								<ProfileContainerHorizontal user={userFound} isOnline={isUserOnline(userFound?.uuid)} />
							</View>
							<QPPressable
								onPress={() => setUserFound(null)}
								style={{ backgroundColor: theme.colors.elevation, borderRadius: 16, width: 32, height: 32, justifyContent: 'center', alignItems: 'center' }}
								accessibilityLabel="Eliminar usuario seleccionado"
							>
								<FontAwesome6 name="xmark" size={18} color={theme.colors.primaryText} iconStyle="solid" />
							</QPPressable>
						</View>
					) : (
						<ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 0 }} style={{ marginVertical: 5 }} >
							<View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
								<QPPressable style={{ backgroundColor: theme.colors.elevation, height: 56, width: 56, borderRadius: 28, justifyContent: 'center', alignItems: 'center' }} onPress={() => setIsSearchModalVisible(true)}>
									<FontAwesome6 name="magnifying-glass" size={24} color={theme.colors.primary} iconStyle="solid" />
								</QPPressable>
								{carouselUsers.map((carouselUser, index) => (
									<Pressable key={carouselUser.uuid || index} onPress={() => setIncomingUserUuid(carouselUser.uuid)}>
										<QPAvatar user={carouselUser} size={56} isOnline={isUserOnline(carouselUser.uuid)} />
									</Pressable>
								))}
							</View>
						</ScrollView>
					)}
				</View>

				{userFound && (
					isStickerSelected ? (
						<View style={[containerStyles.card, { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 }]}>
							<TransactionSticker name={parsedDescription.sticker} size={56} />
							<View style={{ flex: 1 }}>
								<Text style={[textStyles.h6, { color: theme.colors.primaryText, fontWeight: '600' }]}>Sticker seleccionado</Text>
								<Text style={[textStyles.h6, { color: theme.colors.secondaryText }]}>{parsedDescription.sticker.replace('.webm', '')}</Text>
							</View>
							<QPPressable onPress={() => setDescription('')} style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: theme.colors.elevation, justifyContent: 'center', alignItems: 'center' }} accessibilityLabel="Quitar sticker">
								<FontAwesome6 name="xmark" size={16} color={theme.colors.primaryText} iconStyle="solid" />
							</QPPressable>
						</View>
					) : (
						<View style={{ position: 'relative' }}>
							<QPInput
								placeholder={`Deja un mensaje para ${userFound.name} ...`}
								value={description}
								onChangeText={setDescription}
								prefixIconName="comment"
								style={{ paddingRight: 50 }}
							/>
							<Pressable
								onPress={() => setIsStickerPickerVisible(true)}
								style={{ position: 'absolute', right: 12, top: 0, bottom: 0, width: 40, justifyContent: 'center', alignItems: 'center' }}
								accessibilityLabel={isGold ? 'Enviar sticker' : 'Stickers disponibles para usuarios GOLD'}
							>
								<View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: theme.colors.surface, justifyContent: 'center', alignItems: 'center' }}>
									<TransactionSticker name="ok.webm" size={24} />
								</View>
							</Pressable>
						</View>
					)
				)}

			</QPKeyboardView>

			{/* Search Modal */}
			<SendUserSearchModal
				visible={isSearchModalVisible}
				onClose={() => setIsSearchModalVisible(false)}
				carouselUsers={carouselUsers}
				onSelect={(selectedUser) => { setUserFound(selectedUser); setIsSearchModalVisible(false) }}
			/>

			{/* Sticker Picker Modal */}
			<StickerPickerModal
				visible={isStickerPickerVisible}
				onClose={() => setIsStickerPickerVisible(false)}
				onSelect={(sticker) => { setDescription(buildStickerDescription(sticker)); setIsStickerPickerVisible(false) }}
				isGold={isGold}
			/>

		</>
	)
}

export default Send
