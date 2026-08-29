import { Image, Pressable, StyleSheet, Text, View } from 'react-native'
import type { StyleProp, ViewStyle } from 'react-native'

// Icons
import FontAwesome6 from '@react-native-vector-icons/fontawesome6'

// UI Particles
import QPAvatar from './particles/QPAvatar'

// Helpers
import { displayName } from '../helpers/displayName'

// Theme
import { useTheme } from '../theme/ThemeContext'
import { useTextStyles } from '../theme/themeUtils'

// Tipos
import type { User } from '../types/domain'

// El avatar manda: la caja mide siempre lo mismo (36) y el texto se acomoda
// dentro. Si la altura la fijara el texto (dos líneas de Rubik, y `fontSize`
// va escalado por el fontScale del sistema), el avatar se movería unos píxeles
// al saltar a P2P, que solo pinta el avatar.
const AVATAR_SIZE = 36

// Línea base del TopBar: el header se centra verticalmente, así que este
// padding sube el contenido 5px. En el header nativo de iOS 26 lo pone el
// sistema, no nosotros.
const BASELINE_PADDING = 10

type HeaderIdentityProps = {
	user: User | null | undefined
	onPress: () => void
	/** Solo el avatar (P2P: el switch Comprar/Vender ocupa el centro del header). */
	avatarOnly?: boolean
	/** Métricas del header nativo iOS 26 (liquid glass): un pelín más apretadas. */
	native?: boolean
	style?: StyleProp<ViewStyle>
}

/**
 * Bloque de identidad del TopBar de los tabs: avatar + nombre + verificaciones
 * (KYC / GOLD / admin) + @username, con el avatar SIEMPRE al mismo tamaño (36)
 * para que las cinco pestañas se lean como la misma barra.
 *
 * @param props
 * @param props.user - Usuario de sesión.
 * @param props.onPress - Normalmente navegar a Ajustes.
 * @param [props.avatarOnly=false] - Oculta el texto (P2P).
 * @param [props.native=false] - Espaciados del header nativo de iOS 26.
 * @param [props.style] - Estilo del contenedor (márgenes del header).
 */
const HeaderIdentity = ({ user, onPress, avatarOnly = false, native = false, style }: HeaderIdentityProps) => {

	const { theme } = useTheme()
	const textStyles = useTextStyles(theme)
	const qvapayLogo = theme.isDark ? require('../assets/images/ui/qvapay-logo-white.png') : require('../assets/images/ui/logo-qvapay.png')

	const badgeSize = native ? 14 : 16
	const crownSize = native ? 11 : 12

	return (
		<Pressable
			style={[
				styles.container,
				{ height: AVATAR_SIZE + (native ? 0 : BASELINE_PADDING), paddingBottom: native ? 0 : BASELINE_PADDING },
				style,
			]}
			onPress={onPress}
		>
			<QPAvatar user={user} size={AVATAR_SIZE} />
			{!avatarOnly && (
				<View style={{ marginLeft: native ? 8 : 10, flexShrink: 1 }}>
					<View style={[styles.nameRow, { gap: native ? 3 : 4 }]}>
						<Text style={textStyles.h4} numberOfLines={1}>{displayName(user)}</Text>
						{!!user?.kyc && (<Image source={require('../assets/images/ui/blue-badge.png')} style={{ width: badgeSize, height: badgeSize }} />)}
						{!!user?.golden_check && (<FontAwesome6 name="crown" size={crownSize} color={theme.colors.gold} iconStyle="solid" />)}
						{user?.role === 'admin' && (<Image source={qvapayLogo} style={{ width: badgeSize, height: badgeSize }} />)}
					</View>
					<Text style={[textStyles.h6, { color: theme.colors.secondaryText, marginTop: native ? -3 : -5 }]} numberOfLines={1}>@{user?.username}</Text>
				</View>
			)}
		</Pressable>
	)
}

const styles = StyleSheet.create({
	container: {
		flexDirection: 'row',
		alignItems: 'center',
	},
	nameRow: {
		flexDirection: 'row',
		alignItems: 'center',
	},
})

export default HeaderIdentity
