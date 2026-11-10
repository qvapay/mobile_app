import { Linking, Text } from 'react-native'

// Theme
import { useTheme } from '../../../theme/ThemeContext'
import { scaleType, useTextStyles } from '../../../theme/themeUtils'

// Legal
import { PIX_IOF_NOTICE } from './pixLegal'

/**
 * Aviso legal del IOF, literal y en portugués en todos los idiomas (ver `pixLegal.ts`). Va junto al
 * botón de pagar y junto al QR.
 */
const PixIofNotice = () => {

	const { theme } = useTheme()
	const textStyles = useTextStyles(theme)

	return (
		<Text testID="pix-iof-notice" style={[textStyles.caption, { color: theme.colors.tertiaryText, lineHeight: scaleType(theme, 17) }]}>
			{PIX_IOF_NOTICE.text}
			<Text accessibilityRole="link" onPress={() => Linking.openURL(PIX_IOF_NOTICE.url)} style={{ textDecorationLine: 'underline' }}>
				{PIX_IOF_NOTICE.linkLabel}
			</Text>
			{PIX_IOF_NOTICE.end}
		</Text>
	)
}

export default PixIofNotice
