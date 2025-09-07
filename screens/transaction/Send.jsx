import { useState, useEffect } from 'react'
import { View, Text, ScrollView, Modal, TouchableOpacity, FlatList, Pressable } from 'react-native'

// Context and Theme
import { useAuth } from '../../auth/AuthContext'
import { useTheme } from '../../theme/ThemeContext'
import { createTextStyles, createContainerStyles } from '../../theme/themeUtils'

// UI Particles
import QPButton from '../../ui/particles/QPButton'
import QPAvatar from '../../ui/particles/QPAvatar'
import QPInput from '../../ui/particles/QPInput'
import AmountInput from '../../ui/AmountInput'
import QPLoader from '../../ui/particles/QPLoader'
import ProfileContainer from '../../ui/ProfileContainer'
import ProfileContainerHorizontal from '../../ui/ProfileContainerHorizontal'

// Routes
import { ROUTES } from '../../routes'

// API
import { userApi } from '../../api/userApi'
import { transferApi } from '../../api/transferApi'

// Toast
import Toast from 'react-native-toast-message'

// Icons
import FontAwesome6 from '@react-native-vector-icons/fontawesome6'

// Send Screen, search user, send money and show success message
const Send = ({ navigation, route }) => {

    // Context
    const { user } = useAuth()
    const { theme } = useTheme()
    const textStyles = createTextStyles(theme)
    const containerStyles = createContainerStyles(theme)

    // Params from route
    const { send_amount, user_uuid = null } = route.params || {}

    // States
    const [amount, setAmount] = useState(send_amount || '')
    const [currency, setCurrency] = useState('QUSD')
    const [userSearch, setUserSearch] = useState('')
    const [description, setDescription] = useState('')
    const [userFound, setUserFound] = useState(null)
    const [latestSentTransfersUsers, setLatestSentTransfersUsers] = useState([])
    const [incomingUserUuid, setIncomingUserUuid] = useState(user_uuid || null)

    // Modal states
    const [isSearchModalVisible, setIsSearchModalVisible] = useState(false)
    const [searchResults, setSearchResults] = useState([])
    const [isSearching, setIsSearching] = useState(false)

    // Errors and Loading
    const [sendEnabled, setSendEnabled] = useState(false)
    const [error, setError] = useState(null)
    const [isLoading, setIsLoading] = useState(false)
    const [isLoadingUser, setIsLoadingUser] = useState(false)

    // Update send enabled state based on amount and user found
    useEffect(() => {
        const hasValidAmount = amount && parseFloat(amount) > 0
        const hasUserFound = userFound !== null
        setSendEnabled(hasValidAmount && hasUserFound)
    }, [amount, userFound])

    // Get latest sent transfers users
    useEffect(() => {
        const fetchLatestSentTransfersUsers = async () => {
            try {
                const result = await transferApi.getLatestSentTransfers(10)
                if (result.success) {
                    // filter out users with no image
                    const users = result.data.filter(user => user.image)
                    setLatestSentTransfersUsers(users)
                } else { console.error('Error fetching latest sent transfers:', result.error) }
            } catch (error) { console.error('Error fetching latest sent transfers:', error) }
            finally { setIsLoading(false) }
        }
        fetchLatestSentTransfersUsers()
    }, [])

    // If user uuid is provided in the route, try to fetch user data
    // TODO: Some day, you will have a DeepLink and this will be useful
    useEffect(() => {
        if (incomingUserUuid) {
            try {
                setIsLoadingUser(true)
                const fetchUserData = async () => {
                    const result = await userApi.searchUser(incomingUserUuid)
                    if (result.success) { setUserFound(result.data[0]) }
                }
                fetchUserData()
            } catch (error) { console.error('Error fetching user data:', error) }
            finally { setIsLoadingUser(false) }
        }
    }, [incomingUserUuid])

    // Handle Search in Modal
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
                Toast.show({ type: 'error', text1: 'Error', text2: result.error })
            }
        } catch (error) {
            setSearchResults([])
            Toast.show({ type: 'error', text1: 'Error', text2: error.message })
        } finally { setIsSearching(false) }
    }

    // Handle User Selection from Search Results
    const handleUserSelect = (selectedUser) => {
        setUserFound(selectedUser)
        setIsSearchModalVisible(false)
        setUserSearch('')
        setSearchResults([])
    }

    // Handle Send
    const handleSend = async () => {
        try {
            setIsLoading(true)
            const result = await transferApi.transferMoney({
                amount,
                description,
                to: userFound.uuid,
                pin: user.pin
            })
            if (result.success) {
                navigation.navigate(ROUTES.SEND_SUCCESS)
            } else { Toast.show({ type: 'error', text1: 'Error', text2: result.error }) }
        } catch (error) {
            Toast.show({ type: 'error', text1: 'Error', text2: error.message })
        } finally { setIsLoading(false) }
    }

    // Render
    return (
        <View style={[containerStyles.subContainer, { justifyContent: 'space-between', paddingBottom: 20 }]}>

            <View style={{ flex: 1 }}>

                {/* Amount Input Component */}
                <AmountInput amount={amount} onAmountChange={setAmount} balance={user?.balance} currency={currency} placeholder={incomingUserUuid ? 'Monto a enviar' : 'Monto a enviar a ...'} />

                {/** Latest sent transfers users */}
                <View style={{ marginVertical: 20, gap: 10 }}>

                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Text style={[textStyles.h5, { color: theme.colors.tertiaryText }]}>Enviar a:</Text>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                            <Text style={[textStyles.h6, { color: theme.colors.primary }]}>Ver todos</Text>
                            <FontAwesome6 name="arrow-right" size={10} color={theme.colors.primary} iconStyle="solid" />
                        </View>
                    </View>

                    {userFound ? (
                        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 10 }}>
                            <View style={{ flex: 1, marginRight: 10 }}>
                                <ProfileContainerHorizontal user={userFound} />
                            </View>
                            <TouchableOpacity
                                onPress={() => setUserFound(null)}
                                style={{
                                    backgroundColor: theme.colors.elevation,
                                    borderRadius: 16,
                                    width: 32,
                                    height: 32,
                                    justifyContent: 'center',
                                    alignItems: 'center',
                                }}
                                accessibilityLabel="Eliminar usuario seleccionado"
                            >
                                <FontAwesome6 name="xmark" size={18} color={theme.colors.primaryText} iconStyle="solid" />
                            </TouchableOpacity>
                        </View>
                    ) : (
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 0 }} style={{ marginVertical: 5 }} >
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                                <TouchableOpacity style={{ backgroundColor: theme.colors.elevation, height: 56, width: 56, borderRadius: 28, justifyContent: 'center', alignItems: 'center' }} onPress={() => setIsSearchModalVisible(true)}>
                                    <FontAwesome6 name="magnifying-glass" size={24} color={theme.colors.primary} iconStyle="solid" />
                                </TouchableOpacity>
                                {latestSentTransfersUsers.map((user, index) => (
                                    <Pressable key={index} onPress={() => setIncomingUserUuid(user.uuid)}>
                                        <QPAvatar key={index} user={user} size={56} />
                                    </Pressable>
                                ))}
                            </View>
                        </ScrollView>
                    )}
                </View>

                {isLoadingUser && (<QPLoader />)}

                {userFound && (
                    <QPInput
                        placeholder={`Deja un mensaje para ${userFound.name} ...`}
                        value={description}
                        onChangeText={setDescription}
                        prefixIconName="comment"
                    />
                )}

            </View>

            {/** Button to send */}
            <View style={containerStyles.bottomButtonContainer}>
                <QPButton
                    title={`Enviar $${amount || '0'} ${currency}`}
                    onPress={handleSend}
                    disabled={!sendEnabled}
                    loading={isLoading}
                    textStyle={{ color: theme.colors.buttonText }}
                />
            </View>

            {/* Search Modal */}
            <Modal visible={isSearchModalVisible} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setIsSearchModalVisible(false)} >

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
                            Buscar Usuario
                        </Text>
                        <TouchableOpacity
                            onPress={() => setIsSearchModalVisible(false)}
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
                        </TouchableOpacity>
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
                                    height: 50,
                                    borderRadius: 0,
                                    marginVertical: 0,
                                    height: '100%',
                                }}
                            />
                        </View>
                    </View>

                    {/* Search Results */}
                    <View style={{ flex: 1, paddingHorizontal: 20 }}>
                        {searchResults.length > 0 ? (
                            <FlatList
                                data={searchResults}
                                keyExtractor={(item) => item.uuid}
                                showsVerticalScrollIndicator={false}
                                renderItem={({ item }) => (
                                    <TouchableOpacity
                                        onPress={() => handleUserSelect(item)}
                                        style={{
                                            backgroundColor: theme.colors.surface,
                                            borderRadius: 12,
                                            padding: 16,
                                            marginBottom: 8,
                                            borderWidth: 1,
                                            borderColor: theme.colors.border,
                                            flexDirection: 'row',
                                            alignItems: 'center',
                                            gap: 12
                                        }}
                                    >
                                        <QPAvatar user={item} size={48} />
                                        <View style={{ flex: 1 }}>
                                            <Text style={[textStyles.h6, { color: theme.colors.primaryText, fontWeight: '600' }]}>
                                                {item.name} {item.lastname}
                                            </Text>
                                            <Text style={[textStyles.h6, { color: theme.colors.secondaryText }]}>
                                                @{item.username}
                                            </Text>
                                        </View>
                                        <FontAwesome6 name="chevron-right" size={16} color={theme.colors.tertiaryText} iconStyle="solid" />
                                    </TouchableOpacity>
                                )}
                            />
                        ) : userSearch.trim() && !isSearching ? (
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

        </View>
    )
}

export default Send