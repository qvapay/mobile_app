import { View, Text, StyleSheet } from 'react-native'
import type { StyleProp, ViewStyle } from 'react-native'
import { useTranslation } from 'react-i18next'
import { NumberFlow } from 'number-flow-react-native'

// Theme type (theme llega como prop explícita, sin leer el contexto)
import type { Theme } from '../../theme/ThemeContext'

// Locale de números (separador de miles y decimal por idioma)
import { getNumberLocale } from '../../i18n'

// Encogido por longitud: sustituye al adjustsFontSizeToFit en la rama animada
import { heroFontSize } from '../../helpers/heroFontSize'

// Decimales por defecto: la app es de dinero, dos cifras
const DEFAULT_FRACTION_DIGITS = 2

type QPBalanceBaseProps = {
	fontSize: number
	theme: Theme
	style?: StyleProp<ViewStyle>
}

/**
 * Props en unión discriminada por `amount`: el camino histórico recibe la
 * cadena YA formateada por el caller, y el numérico el importe CRUDO — que es
 * lo que NumberFlow necesita para interpolar los dígitos (formatea él mismo
 * vía Intl, con el locale del idioma activo).
 */
type QPBalanceProps = QPBalanceBaseProps & (
	| { formattedAmount: string | number, amount?: never, animated?: never, fractionDigits?: never }
	| { amount: number, animated?: boolean, fractionDigits?: number, formattedAmount?: never }
)

type QPBalanceAmountProps = QPBalanceBaseProps & {
	amount: number
	animated: boolean
	fractionDigits: number
}

/**
 * Balance héroe a partir del importe crudo. Con `animated` los dígitos ruedan
 * en cascada al cambiar de valor (efecto cuentakilómetros, modo `continuous`);
 * sin él se pinta un Text plano — mucho más barato, que es lo que hace falta
 * cuando el valor cambia a 60fps (el scrubbing del gráfico de CoinDetail).
 * En ambos casos el formateo es el MISMO, así que alternar no salta.
 *
 * Componente aparte del camino de `formattedAmount` para no colar sus hooks
 * ahí: la rama es estable por call site, así que el early return de QPBalance
 * nunca cambia el orden de hooks dentro de un mismo montaje.
 *
 * El signo se saca fuera (igual que el camino histórico: "-$12.50", no
 * "$-12.50") y las cifras reciben siempre el valor absoluto.
 *
 * Los timings se dejan en los de la librería (curva de deceleración de 900ms
 * de NumberFlow) a propósito: sus easings son worklets, y una función de
 * easing propia pasada como prop NO la workletiza el plugin de babel — se
 * llamaría desde el hilo de UI y reventaría.
 *
 * @param props
 * @param props.amount - Importe crudo; negativo pinta todo en `danger`.
 * @param props.animated - Si los dígitos ruedan al cambiar de valor.
 * @param props.fractionDigits - Decimales fijos (4 para cripto por debajo de $1).
 * @param props.fontSize - Tamaño MÁXIMO de las cifras (se encoge con la longitud).
 * @param props.theme - Theme explícito, sin leer el contexto.
 * @param [props.style] - Override del contenedor.
 */
const QPBalanceAmount = ({ amount, animated, fractionDigits, fontSize, theme, style }: QPBalanceAmountProps) => {

	// El locale de números se lee en call time; useTranslation es lo que
	// suscribe al componente al cambio de idioma para que se repinte
	useTranslation()
	const locale = getNumberLocale()

	const isNegative = amount < 0
	const absolute = Math.abs(amount)
	const format = { minimumFractionDigits: fractionDigits, maximumFractionDigits: fractionDigits }
	const formatted = absolute.toLocaleString(locale, format)

	// NumberFlow parte el número en un elemento por dígito, así que el
	// adjustsFontSizeToFit del camino histórico no aplica: el ancho se controla
	// encogiendo la fuente por longitud sobre la cadena que se va a pintar
	const digitStyle = { fontSize: heroFontSize(formatted, fontSize), color: isNegative ? theme.colors.danger : theme.colors.primaryText, fontFamily: theme.typography.fontFamily.black }

	return (
		// El símbolo y las cifras son elementos separados (y NumberFlow, uno por
		// dígito): el contenedor se declara accesible para que el lector siga
		// leyendo la figura como UNA sola cosa, igual que el camino histórico.
		// Los cambios de valor los anuncia NumberFlow por su cuenta vía
		// AccessibilityInfo, que no depende del foco — esto no se lo tapa.
		<View
			style={[styles.amountContainer, styles.centered, style]}
			accessible
			accessibilityRole="text"
			accessibilityLabel={`Amount: ${isNegative ? '-' : ''}$${formatted}`}>
			<Text style={[styles.currencySymbol, { color: isNegative ? theme.colors.danger : theme.colors.secondaryText, fontSize: theme.typography.fontSize.xxxl, fontFamily: theme.typography.fontFamily.semiBold }]}>{isNegative ? '-$' : '$'}</Text>
			{animated ? (
				<NumberFlow
					value={absolute}
					locales={locale}
					format={format}
					continuous
					style={digitStyle}
				/>
			) : (
				<Text numberOfLines={1} style={[styles.amountText, digitStyle]}>{formatted}</Text>
			)}
		</View>
	)
}

/**
 * Hero balance figure: "$" symbol plus the amount in the theme's black weight.
 * Savings balances can go negative (admin-managed debts): the sign renders
 * BEFORE the symbol ("-$12.50") and the whole figure switches to the danger color.
 *
 * Dos APIs: con `amount` (importe crudo) los dígitos ruedan al cambiar de valor
 * — ver QPBalanceAmount —; con `formattedAmount` se pinta un único Text con
 * auto-shrink NATIVO, que es lo que quiere el Keypad, donde el número cambia
 * con CADA tecla y rodar estorbaría.
 *
 * @param props
 * @param [props.formattedAmount] - Camino histórico: importe ya formateado; puede empezar por "-".
 * @param [props.amount] - Importe crudo; activa el formateo por locale.
 * @param [props.animated=true] - Con `amount`, si los dígitos ruedan.
 * @param [props.fractionDigits=2] - Con `amount`, decimales fijos.
 * @param props.fontSize - Digit size (the symbol stays at xxxl).
 * @param props.theme - Theme object passed in explicitly (no context read).
 * @param [props.style] - Container style override (e.g. height/margins outside the keypad).
 */
const QPBalance = (props: QPBalanceProps) => {
    const { fontSize, theme, style } = props

    if (props.amount !== undefined) {
        return <QPBalanceAmount amount={props.amount} animated={props.animated ?? true} fractionDigits={props.fractionDigits ?? DEFAULT_FRACTION_DIGITS} fontSize={fontSize} theme={theme} style={style} />
    }

    const { formattedAmount } = props
    const isNegative = String(formattedAmount).startsWith('-')
    const displayAmount = isNegative ? String(formattedAmount).slice(1) : formattedAmount
    return (
        <View style={[styles.amountContainer, styles.centered, style]}>
            <Text style={[styles.currencySymbol, { color: isNegative ? theme.colors.danger : theme.colors.secondaryText, fontSize: theme.typography.fontSize.xxxl, fontFamily: theme.typography.fontFamily.semiBold }]}>{isNegative ? '-$' : '$'}</Text>
            {/* Red de seguridad de ancho: si aún con el shrink por longitud del
                caller el número no cabe (pantallas estrechas), se auto-escala */}
            <Text
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.4}
                style={[styles.amountText, { fontSize: fontSize, color: isNegative ? theme.colors.danger : theme.colors.primaryText, fontFamily: theme.typography.fontFamily.black }]}
                accessibilityRole="text"
                accessibilityLabel={`Amount: ${isNegative ? '-' : ''}$${displayAmount}`}>
                {displayAmount}
            </Text>
        </View>
    )
}

const styles = StyleSheet.create({
    amountContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 20,
        height: 100,
    },
    centered: {
        alignItems: 'center',
        justifyContent: 'center',
        alignContent: 'center',
    },
    currencySymbol: {
        marginRight: 8,
    },
    amountText: {
        textAlign: 'center',
        flexShrink: 1,
    },
})

export default QPBalance
