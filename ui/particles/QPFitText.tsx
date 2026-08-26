import { Text } from 'react-native'
import type { TextProps } from 'react-native'

/**
 * Texto de una línea que se auto-encoge para caber en el ancho disponible
 * (`adjustsFontSizeToFit` + `numberOfLines={1}`). ES el estándar de la casa
 * para héroes numéricos — precios, balances, montos — que con valores largos
 * (BTC a seis cifras) o pantallas estrechas desbordarían el layout: en vez de
 * romperse, el número se escala hasta `minimumFontScale` del tamaño original.
 *
 * @param props
 * @param [props.minimumFontScale=0.5] - Piso de escala (0.5 = 50%).
 * Resto de props (style, children…) pasan al Text.
 */
const QPFitText = ({ minimumFontScale = 0.5, children, ...rest }: TextProps) => (
	<Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={minimumFontScale} {...rest}>
		{children}
	</Text>
)

export default QPFitText
