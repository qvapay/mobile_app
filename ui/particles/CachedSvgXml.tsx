import { SvgAst, parse } from 'react-native-svg'
import type { SvgProps } from 'react-native-svg'

type Ast = ReturnType<typeof parse>

/**
 * Árboles ya parseados, por XML. `SvgXml` de react-native-svg parsea el XML en JS en CADA
 * montaje (su `useMemo` es por instancia): una lista de monedas con logo y badge de red
 * repetía ~20 parseos cada vez que se abría el selector, justo mientras la hoja subía.
 * El número de logos distintos es pequeño y acotado, así que no hace falta expulsar nada.
 */
const asts = new Map<string, Ast>()

const astFor = (xml: string): Ast => {
	if (asts.has(xml)) { return asts.get(xml) as Ast }
	let ast: Ast = null
	try { ast = parse(xml) } catch { /* XML inválido: no pinta, igual que SvgXml */ }
	asts.set(xml, ast)
	return ast
}

/** `SvgXml` con el árbol parseado compartido entre montajes. Mismas props. */
const CachedSvgXml = ({ xml, ...rest }: SvgProps & { xml: string }) => (
	<SvgAst ast={astFor(xml)} override={rest} />
)

export default CachedSvgXml
