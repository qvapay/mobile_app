import { useState, useEffect, useReducer } from 'react'
import { View, Text, ScrollView, Pressable } from 'react-native'
import { useTranslation } from 'react-i18next'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'

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

// Helpers
import { displayName } from '../../helpers/displayName'

// Routes
import { ROUTES } from '../../routes'

// API
import { userApi } from '../../api/userApi'

// Carrusel de destinatarios (React Query: recientes + contactos en paralelo)
import { useSendCarousel } from './sendQueries'
import type { SendCarouselUser } from './sendQueries'

// Toast
import { toast } from 'sonner-native'

// Icons
import FontAwesome6 from '@react-native-vector-icons/fontawesome6'

// Online Status
import { useOnlineStatus } from '../../hooks/OnlineStatusContext'

// Tipos
import type { Decimal } from '../../types/domain'
import type { RootStackParamList } from '../../types/navigation'

/** Acción del setter genérico: escribe `value` en `field` del slice. */
type FieldAction<S> = { type: 'set', field: keyof S, value: S[keyof S] }

// Generic field setter for the related-state slices below
function setFieldReducer<S extends object>(state: S, action: FieldAction<S>): S {
	switch (action.type) {
		case 'set':
			return { ...state, [action.field]: action.value }
		default:
			return state
	}
}

/** Formulario de la transferencia (monto + nota, que puede ser un sticker). */
type SendForm = { amount: string, description: string }

/** Destinatario: el perfil ya resuelto y el uuid/username que llega por params o QR. */
type SendRecipient = { userFound: SendCarouselUser | null, incomingUserUuid: string | null }

type Props = NativeStackScreenProps<RootStackParamList, 'Send'>

/**
 * Send-money screen: pick a recipient, amount and an optional note or sticker.
 * Route params: `send_amount` (from Keypad) and `user_uuid` (from QR scan / deep links).
 * The recipient carousel merges latest sent transfers, saved contacts and synced device
 * contacts (deduped, with live online status); users are searched via `userApi.searchUser`.
 * Stickers persist inside the description as `:sticker:<name>` (helpers/stickers).
 * No money moves here — it hands off to SendConfirm with amount, uuid and description.
 */
const Send = ({ navigation, route }: Props) => {

	// Context
	const { t } = useTranslation()
	const { user } = useAuth()
	const { theme } = useTheme()
	const textStyles = createTextStyles(theme)
	const containerStyles = createContainerStyles(theme)
	// Params from route
	const { send_amount, user_uuid = null } = route.params || {}

	// Transfer form (amount + message) — same-named setters keep call sites unchanged
	const [form, dispatchForm] = useReducer(setFieldReducer<SendForm>, { amount: send_amount || '', description: '' })
	const { amount, description } = form
	const setAmount = (value: string) => dispatchForm({ type: 'set', field: 'amount', value })
	const setDescription = (value: string) => dispatchForm({ type: 'set', field: 'description', value })

	// Recipient selection (resolved user + incoming uuid)
	const [recipient, dispatchRecipient] = useReducer(setFieldReducer<SendRecipient>, { userFound: null, incomingUserUuid: user_uuid || null })
	const { userFound, incomingUserUuid } = recipient
	const setUserFound = (value: SendCarouselUser | null) => dispatchRecipient({ type: 'set', field: 'userFound', value })
	const setIncomingUserUuid = (value: string | null) => dispatchRecipient({ type: 'set', field: 'incomingUserUuid', value })

	// Carousel of recent recipients + saved contacts (shared query with Home)
	const carouselUsers = useSendCarousel()

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

	// If user uuid is provided in the route, try to fetch user data
	useEffect(() => {
		if (incomingUserUuid) {
			const fetchUserData = async () => {
				try {
					// `searchUser` tipa el cuerpo como unknown: el endpoint devuelve la lista
					// de perfiles (el `?.` del original cubre la respuesta sin cuerpo)
					const result = await userApi.searchUser(incomingUserUuid)
					if (result.success && (result.data as SendCarouselUser[])?.length > 0) { setUserFound((result.data as SendCarouselUser[])[0]) }
				} catch { /* error fetching user data */ }
			}
			fetchUserData()
		}
	}, [incomingUserUuid])

	// Handle Send
	const handleSendConfirm = async () => {
		try {
			setIsLoading(true)
			navigation.navigate(ROUTES.SEND_CONFIRM, {
				// El botón solo se habilita con `userFound !== null` (`sendEnabled`)
				user_uuid: userFound!.uuid,
				send_amount: amount,
				description: description
			})
		} catch (err) {
			toast.error(t('transactions.common.errorTitle'), { description: (err as Error).message })
		} finally { setIsLoading(false) }
	}

	// Render
	return (
		<>
			<QPKeyboardView
				actions={
					<QPButton
						title={t('transactions.send.sendButton', { amount: amount || '0' })}
						onPress={handleSendConfirm}
						disabled={!sendEnabled}
						loading={isLoading}
						textStyle={{ color: theme.colors.buttonText }}
					/>
				}
			>

				{/* Amount Input Component */}
				{/* `balance` está declarado obligatorio en AmountInput aunque su
				    formateador ya acepta undefined (`formatBalance` devuelve '0.00') */}
				<AmountInput amount={amount} onAmountChange={setAmount} balance={user?.balance as Decimal} placeholder={incomingUserUuid ? t('transactions.send.amountPlaceholder') : t('transactions.send.amountPlaceholderTo')} />

				{/** Latest sent transfers users */}
				<View style={{ marginVertical: 20, gap: 10 }}>

					<View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
						<Text style={[textStyles.h5, { color: theme.colors.tertiaryText }]}>{t('transactions.send.sendTo')}</Text>
						<Pressable onPress={() => navigation.navigate(ROUTES.CONTACTS)} style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
							<Text style={[textStyles.h6, { color: theme.colors.primary }]}>{t('transactions.send.seeAllContacts')}</Text>
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
								accessibilityLabel={t('transactions.send.removeRecipientA11y')}
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
								{carouselUsers.map((carouselUser) => (
									<Pressable key={carouselUser.uuid} onPress={() => setIncomingUserUuid(carouselUser.uuid)}>
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
								<Text style={[textStyles.h6, { color: theme.colors.primaryText, fontWeight: '600' }]}>{t('transactions.send.stickerSelected')}</Text>
								{/* `type === 'sticker'` implica `sticker` no nulo (el tipo no lo discrimina) */}
								<Text style={[textStyles.h6, { color: theme.colors.secondaryText }]}>{parsedDescription.sticker!.replace('.webm', '')}</Text>
							</View>
							<QPPressable onPress={() => setDescription('')} style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: theme.colors.elevation, justifyContent: 'center', alignItems: 'center' }} accessibilityLabel={t('transactions.send.removeStickerA11y')}>
								<FontAwesome6 name="xmark" size={16} color={theme.colors.primaryText} iconStyle="solid" />
							</QPPressable>
						</View>
					) : (
						<View style={{ position: 'relative' }}>
							<QPInput
								placeholder={t('transactions.send.messagePlaceholder', { name: displayName(userFound) })}
								value={description}
								onChangeText={setDescription}
								prefixIconName="comment"
								style={{ paddingRight: 50 }}
							/>
							<Pressable
								onPress={() => setIsStickerPickerVisible(true)}
								style={{ position: 'absolute', right: 12, top: 0, bottom: 0, width: 40, justifyContent: 'center', alignItems: 'center' }}
								accessibilityLabel={isGold ? t('transactions.send.sendStickerA11y') : t('transactions.send.stickersGoldOnlyA11y')}
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
