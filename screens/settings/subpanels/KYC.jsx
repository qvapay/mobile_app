import { useCallback, useEffect, useState } from 'react'
import { View, Text, StyleSheet, Linking } from 'react-native'

// Theme
import { useTheme } from '../../../theme/ThemeContext'
import { createTextStyles, createContainerStyles } from '../../../theme/themeUtils'

// UI
import QPButton from '../../../ui/particles/QPButton'
import QPLoader from '../../../ui/particles/QPLoader'

// API
import { userApi } from '../../../api/userApi'

// Lottie
import LottieView from 'lottie-react-native'

// Auth
import { useAuth } from '../../../auth/AuthContext'

// Notifications
import { toast } from 'sonner-native'

// Icons
import FontAwesome6 from '@react-native-vector-icons/fontawesome6'

const KYC = () => {

	// Theme
	const { theme } = useTheme()
	const textStyles = createTextStyles(theme)
	const containerStyles = createContainerStyles(theme)

	// Auth
	const { user } = useAuth()

	// States
	const [loading, setLoading] = useState(true)
	const [requesting, setRequesting] = useState(false)
	const [isVerified, setIsVerified] = useState(false)

	// Check KYC status on mount
	useEffect(() => {
		const checkStatus = async () => {
			try {
				setLoading(true)
				const resp = await userApi.getKYCStatus()
				if (resp.success && resp.data?.kyc) {
					setIsVerified(true)
				} else {
					setIsVerified(user?.kyc === true)
				}
			} catch {
				setIsVerified(user?.kyc === true)
			} finally {
				setLoading(false)
			}
		}
		checkStatus()
	}, [user?.kyc])

	// Request verification session URL and open in browser
	const requestVerification = useCallback(async () => {
		try {
			setRequesting(true)
			const resp = await userApi.requestKYCSession()
			if (resp.success && resp.data) {
				await Linking.openURL(resp.data)
			} else {
				toast.error('Error', { description: resp.error || 'No se pudo obtener la sesión de verificación' })
			}
		} catch (e) {
			toast.error('Error', { description: e.message || 'Ha ocurrido un error' })
		} finally {
			setRequesting(false)
		}
	}, [])

	if (loading) return <QPLoader />

	// Verified state
	if (isVerified) {
		return (
			<View style={[containerStyles.subContainer, styles.center]}>
				<LottieView source={require('../../../assets/lotties/verified.json')} autoPlay loop={false} style={{ width: 200, height: 200 }} />
				<Text style={[textStyles.h2, { color: theme.colors.primaryText, marginTop: 10 }]}>¡Identidad verificada!</Text>
				<Text style={[textStyles.h5, { color: theme.colors.secondaryText, textAlign: 'center', marginTop: 6 }]}>Gracias por completar la verificación. Ya puedes disfrutar de todos los beneficios.</Text>
			</View>
		)
	}

	// Not verified state
	return (
		<View style={[containerStyles.subContainer, styles.center]}>

			<LottieView source={require('../../../assets/lotties/looking.json')} autoPlay loop style={{ width: 200, height: 200 }} />

			<Text style={[textStyles.h2, { color: theme.colors.primaryText, marginTop: 10 }]}>Verificación de identidad</Text>
			<Text style={[textStyles.h5, { color: theme.colors.secondaryText, textAlign: 'center', marginTop: 6, marginBottom: 24 }]}>
				Verifica tu identidad para acceder a todos los beneficios de QvaPay.
			</Text>

			<View style={[containerStyles.card, { width: '100%', marginBottom: 24 }]}>
				<BenefitItem icon="arrow-up" text="Límites de transacción más altos" theme={theme} textStyles={textStyles} />
				<BenefitItem icon="handshake" text="Mejores oportunidades en el P2P" theme={theme} textStyles={textStyles} />
				<BenefitItem icon="star" text="Acceso a funciones exclusivas" theme={theme} textStyles={textStyles} />
			</View>

			<QPButton
				title={requesting ? 'Abriendo verificación...' : 'Verificar mi identidad'}
				onPress={requestVerification}
				loading={requesting}
				textStyle={{ color: theme.colors.almostWhite }}
				style={{ width: '100%' }}
			/>

		</View>
	)
}

const BenefitItem = ({ icon, text, theme, textStyles }) => (
	<View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 6 }}>
		<FontAwesome6 name={icon} size={16} color={theme.colors.success} iconStyle="solid" />
		<Text style={[textStyles.body, { color: theme.colors.secondaryText }]}>{text}</Text>
	</View>
)

const styles = StyleSheet.create({
	center: {
		flex: 1,
		justifyContent: 'center',
		alignItems: 'center',
		paddingHorizontal: 20,
	},
})

export default KYC