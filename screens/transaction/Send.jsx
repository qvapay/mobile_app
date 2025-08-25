import { useState } from 'react'
import { View, Text } from 'react-native'

// Context and Theme
import { useAuth } from '../../auth/AuthContext'
import { useTheme } from '../../theme/ThemeContext'
import { createTextStyles, createContainerStyles } from '../../theme/themeUtils'

// UI Particles
import QPButton from '../../ui/particles/QPButton'
import QPAvatar from '../../ui/particles/QPAvatar'
import QPInput from '../../ui/particles/QPInput'

// Routes
import { ROUTES } from '../../routes'

// API
import { userApi } from '../../api/userApi'
import { transferApi } from '../../api/transferApi'

// Send Screen, search user, send money and show success message
const Send = ({ navigation, route }) => {

    // Context
    const { user } = useAuth()
    const { theme } = useTheme()
    const textStyles = createTextStyles(theme)
    const containerStyles = createContainerStyles(theme)

    // States
    const [amount, setAmount] = useState(route.params.amount)
    const [userSearch, setUserSearch] = useState('')
    const [description, setDescription] = useState('')
    const [userFound, setUserFound] = useState(null)

    // Errors and Loading
    const [sendEnabled, setSendEnabled] = useState(false)
    const [error, setError] = useState(null)
    const [isLoading, setIsLoading] = useState(false)

    // Handle Search
    const handleSearch = async () => {

        try {
            setIsLoading(true)
            console.log('Send', userSearch, description, amount)

            // Call API to search for the user based on its uuid, username, email or verified phone number
            const result = await userApi.searchUser(userSearch)
            if (result.success) {
                console.log('User found', result.data)
                setUserFound(result.data[0])
                setSendEnabled(true)
            } else {
                console.log('Error searching for user:', result.error)
            }

        } catch (error) {
            console.error('Error sending:', error)
        } finally { setIsLoading(false) }
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
                console.log('Transfer successful', result.data)
                // TODO: Try to get the response data to save in Transactions meme
                navigation.navigate(ROUTES.SEND_SUCCESS_SCREEN)
            } else {
                console.log('Error sending:', result.error)
            }

        } catch (error) {
            console.error('Error sending:', error)
        } finally { setIsLoading(false) }

    }

    // Render
    return (
        <View style={[containerStyles.subContainer, { justifyContent: 'space-between' }]}>

            <View>
                <QPInput
                    placeholder="Buscar usuario ..."
                    value={userSearch}
                    onChangeText={setUserSearch}
                    prefixIconName="magnifying-glass"
                />

                <QPButton title="Buscar" onPress={handleSearch} />
            </View>

            {userFound && (
                <View style={{ alignItems: 'center', marginVertical: 16 }}>
                    {/* User Avatar */}
                    <QPAvatar user={userFound} size={64} />

                    <Text style={textStyles.title}>User</Text>
                    <Text style={textStyles.title}>{userFound.image}</Text>
                    <Text style={textStyles.subtitle}>
                        {userFound.name} {userFound.lastname}
                    </Text>
                    <Text style={textStyles.subtitle}>@{userFound.username}</Text>
                    <Text style={textStyles.subtitle}>UUID: {userFound.uuid}</Text>
                    <Text style={textStyles.subtitle}>
                        VIP: {userFound.vip ? 'Yes' : 'No'}
                    </Text>
                    <Text style={textStyles.subtitle}>
                        KYC: {userFound.kyc ? 'Verified' : 'Not Verified'}
                    </Text>
                    <Text style={textStyles.subtitle}>
                        Golden Check: {userFound.golden_check ? 'Yes' : 'No'}
                    </Text>

                    {/** Textinput for description */}
                    <QPInput placeholder="Description" value={description} onChangeText={setDescription} />
                </View>
            )}

            {/** Button to send */}
            <QPButton title={`Enviar $${amount} QUSD`} onPress={handleSend} disabled={!sendEnabled} />

        </View>
    )
}

export default Send