import FontAwesome6 from '@react-native-vector-icons/fontawesome6'

import FaceIDIcon from '../ui/particles/FaceIDIcon'

type Props = {
	biometryType: string | null
	biometricsAvailable: boolean
	color: string
	/** 48 en el héroe; la tecla biométrica del teclado lo usa más pequeño. */
	size?: number
}

/** El glifo del bloqueo: el de la biometría si la hay (Face ID o huella), un candado si no. */
const LockHeroIcon = ({ biometryType, biometricsAvailable, color, size = 48 }: Props) => {
	// El candado es un glifo más macizo: a igual tamaño pesa más que la huella
	if (!biometricsAvailable) { return <FontAwesome6 name="lock" size={Math.round(size * 5 / 6)} color={color} iconStyle="solid" /> }
	if (biometryType === 'FaceID') { return <FaceIDIcon size={size} color={color} /> }
	return <FontAwesome6 name="fingerprint" size={size} color={color} iconStyle="solid" />
}

export default LockHeroIcon
