import FontAwesome6 from '@react-native-vector-icons/fontawesome6'

import FaceIDIcon from '../ui/particles/FaceIDIcon'

type Props = {
	biometryType: string | null
	biometricsAvailable: boolean
	color: string
}

/** El glifo del héroe de la pantalla de bloqueo: el que desbloquea si hay biometría, un candado si no. */
const LockHeroIcon = ({ biometryType, biometricsAvailable, color }: Props) => {
	if (!biometricsAvailable) { return <FontAwesome6 name="lock" size={40} color={color} iconStyle="solid" /> }
	if (biometryType === 'FaceID') { return <FaceIDIcon size={48} color={color} /> }
	return <FontAwesome6 name="fingerprint" size={48} color={color} iconStyle="solid" />
}

export default LockHeroIcon
