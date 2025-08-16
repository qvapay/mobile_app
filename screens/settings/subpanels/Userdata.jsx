import { useState, useEffect } from 'react'
import { StyleSheet, Text, View, Alert, KeyboardAvoidingView, Platform, ScrollView, TouchableWithoutFeedback, Keyboard } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

// Theme
import { useTheme } from '../../../theme/ThemeContext'
import { createTextStyles, createContainerStyles } from '../../../theme/themeUtils'

// UI Particles
import QPInput from '../../../ui/particles/QPInput'
import QPButton from '../../../ui/particles/QPButton'

// API
import { userApi } from '../../../api/userApi'

// Notifications
import Toast from 'react-native-toast-message'

// User Data Settings Component
const Userdata = () => {

    // Theme variables, dark and light modes with memoized styles
    const { theme } = useTheme()
    const textStyles = createTextStyles(theme)
    const containerStyles = createContainerStyles(theme)
    const insets = useSafeAreaInsets()

    // States
    const [isLoading, setIsLoading] = useState(false)
    const [isLoadingData, setIsLoadingData] = useState(true)

    // Form fields
    const [username, setUsername] = useState('')
    const [name, setName] = useState('')
    const [lastname, setLastname] = useState('')
    const [email, setEmail] = useState('')
    const [phone, setPhone] = useState('')
    const [telegram, setTelegram] = useState('')
    const [twitter, setTwitter] = useState('')
    const [address, setAddress] = useState('')
    const [country, setCountry] = useState('')
    const [bio, setBio] = useState('')

    // Load user data on component mount
    useEffect(() => {
        loadUserData()
    }, [])

    // Load user data from API
    const loadUserData = async () => {

        try {

            setIsLoadingData(true)
            const result = await userApi.getUserProfile()

            if (result.success && result.data) {
                const userData = result.data
                setUsername(userData.username || '')
                setName(userData.name || '')
                setLastname(userData.lastname || '')
                setEmail(userData.email || '')
                setPhone(userData.phone || '')
                setTelegram(userData.telegram || '')
                setTwitter(userData.twitter || '')
                setAddress(userData.address || '')
                setCountry(userData.country || '')
                setBio(userData.bio || '')
            } else {
                Toast.show({
                    type: 'error',
                    text1: 'Error al cargar datos del usuario',
                    text2: result.error || 'Error desconocido'
                })
            }
        } catch (error) {
            console.error('Error loading user data:', error)
            Toast.show({
                type: 'error',
                text1: 'Error al cargar datos del usuario',
                text2: error.message
            })
        } finally {
            setIsLoadingData(false)
        }
    }

    // Handle form submission
    const handleSubmit = async () => {

        if (!name || !lastname) {
            Toast.show({
                type: 'error',
                text1: 'Error',
                text2: 'Por favor completa al menos el nombre y apellido'
            })
            return
        }

        // Validate email format if provided
        if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            Toast.show({
                type: 'error',
                text1: 'Error',
                text2: 'Por favor ingresa un formato de correo electrónico válido'
            })
            return
        }

        // Validate country code if provided
        if (country && country.length !== 2) {
            Toast.show({
                type: 'error',
                text1: 'Error',
                text2: 'El código de país debe tener exactamente 2 caracteres (ej: US, ES, MX)'
            })
            return
        }

        try {
            setIsLoading(true)

            const updateData = {
                name: name.trim(),
                lastname: lastname.trim(),
                bio: bio.trim(),
                address: address.trim(),
                country: country.trim().toUpperCase(),
                telegram: telegram.trim(),
                twitter: twitter.trim()
            }

            const result = await userApi.updateUser(updateData)

            if (result.success && result.data) {
                Toast.show({
                    type: 'success',
                    text1: 'Datos actualizados',
                    text2: 'Tu información personal ha sido actualizada correctamente'
                })

                // Update local state with response data
                const userData = result.data
                setUsername(userData.username || username)
                setName(userData.name || name)
                setLastname(userData.lastname || lastname)
                setBio(userData.bio || bio)
            } else {
                Toast.show({
                    type: 'error',
                    text1: 'Error al actualizar',
                    text2: result.error || 'Error desconocido'
                })
            }
        } catch (error) {
            console.error('Error updating user data:', error)
            Toast.show({
                type: 'error',
                text1: 'Error al actualizar',
                text2: error.message
            })
        } finally {
            setIsLoading(false)
        }
    }

    // Reset form to original values
    const handleReset = () => {
        Alert.alert(
            'Restablecer formulario',
            '¿Estás seguro de que quieres restablecer todos los cambios?',
            [
                {
                    text: 'Cancelar',
                    style: 'cancel'
                },
                {
                    text: 'Restablecer',
                    style: 'destructive',
                    onPress: () => loadUserData()
                }
            ]
        )
    }

    if (isLoadingData) {
        return (
            <View style={[containerStyles.subContainer, styles.loadingContainer]}>
                <Text style={textStyles.h3}>Cargando datos del usuario...</Text>
            </View>
        )
    }

    return (
        <KeyboardAvoidingView
            style={[containerStyles.subContainer]}
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}>

            <TouchableWithoutFeedback onPress={Keyboard.dismiss}>

                <ScrollView
                    contentContainerStyle={styles.scrollContainer}
                    showsVerticalScrollIndicator={false}
                    keyboardShouldPersistTaps="handled"
                >

                    <Text style={textStyles.h1}>Datos personales</Text>
                    <Text style={[textStyles.h3, { color: theme.colors.secondaryText }]}>Edita tus datos personales</Text>

                    <View style={styles.formContainer}>

                        {/* Username (Read-only) */}
                        <View style={styles.inputContainer}>
                            <QPInput
                                placeholder="Nombre de usuario"
                                value={username}
                                onChangeText={setUsername}
                                editable={false}
                                prefixIconName="user"
                                style={styles.readOnlyInput}
                            />
                            <Text style={[textStyles.caption, { color: theme.colors.tertiaryText, marginTop: 5 }]}>
                                El nombre de usuario no se puede modificar
                            </Text>
                        </View>

                        {/* Name */}
                        <QPInput
                            placeholder="Nombre"
                            value={name}
                            onChangeText={setName}
                            prefixIconName="user"
                            autoCapitalize="words"
                        />

                        {/* Last Name */}
                        <QPInput
                            placeholder="Apellido"
                            value={lastname}
                            onChangeText={setLastname}
                            prefixIconName="user"
                            autoCapitalize="words"
                        />

                        {/* Email */}
                        <QPInput
                            placeholder="Correo electrónico"
                            value={email}
                            onChangeText={setEmail}
                            keyboardType="email-address"
                            autoCapitalize="none"
                            editable={false}
                            style={styles.readOnlyInput}
                            prefixIconName="envelope"
                        />

                        {/* Phone */}
                        <QPInput
                            placeholder="Teléfono"
                            value={phone}
                            onChangeText={setPhone}
                            keyboardType="phone-pad"
                            prefixIconName="phone-volume"
                        />

                        {/* Telegram */}
                        <QPInput
                            placeholder="@usuario_telegram"
                            value={telegram}
                            onChangeText={setTelegram}
                            autoCapitalize="none"
                            prefixIconName="telegram"
                        />

                        {/* Twitter */}
                        <QPInput
                            placeholder="@usuario_twitter"
                            value={twitter}
                            onChangeText={setTwitter}
                            autoCapitalize="none"
                            prefixIconName="x-twitter"
                        />

                        {/* Address */}
                        <QPInput
                            placeholder="Dirección"
                            value={address}
                            onChangeText={setAddress}
                            autoCapitalize="words"
                            prefixIconName="location-dot"
                        />

                        {/* Country */}
                        <View style={styles.inputContainer}>
                            <QPInput
                                placeholder="País (ej: US, ES, MX)"
                                value={country}
                                onChangeText={setCountry}
                                autoCapitalize="characters"
                                maxLength={2}
                                prefixIconName="globe"
                            />
                            <Text style={[textStyles.caption, { color: theme.colors.tertiaryText, marginTop: 5 }]}>
                                Código de país de 2 letras (ISO 3166-1 alpha-2)
                            </Text>
                        </View>

                        {/* Bio */}
                        <QPInput
                            placeholder="Biografía o descripción personal"
                            value={bio}
                            onChangeText={setBio}
                            multiline
                            numberOfLines={4}
                            prefixIconName="user-pen"
                            style={styles.bioInput}
                        />

                    </View>

                    <View style={styles.buttonContainer}>
                        <QPButton
                            title="Actualizar datos"
                            onPress={handleSubmit}
                            disabled={!name || !lastname || isLoading}
                            style={styles.updateButton}
                            textStyle={{ color: theme.colors.almostWhite }}
                            loading={isLoading}
                            icon="floppy-disk"
                        />

                        <QPButton
                            title="Restablecer"
                            onPress={handleReset}
                            disabled={isLoading}
                            style={[styles.resetButton, { backgroundColor: theme.colors.surface, borderColor: theme.colors.secondaryText }]}
                            textStyle={{ color: theme.colors.primaryText }}
                            icon="arrow-rotate-left"
                        />
                    </View>

                </ScrollView>
            </TouchableWithoutFeedback>

        </KeyboardAvoidingView>
    )
}

const styles = StyleSheet.create({
    scrollContainer: {
        flexGrow: 1,
        paddingVertical: 20,
    },
    formContainer: {
        marginBottom: 30
    },
    inputContainer: {
        marginBottom: 10
    },
    buttonContainer: {
        gap: 15,
        marginBottom: 20
    },
    updateButton: {
        borderRadius: 25
    },
    resetButton: {
        borderRadius: 25,
        borderWidth: 1
    },
    readOnlyInput: {
        opacity: 0.6,
        backgroundColor: 'transparent'
    },
    bioInput: {
        textAlignVertical: 'top',
        paddingTop: 15
    },
    loadingContainer: {
        justifyContent: 'center',
        alignItems: 'center'
    }
})

export default Userdata