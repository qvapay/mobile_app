import { useState, useEffect } from 'react'
import { SvgXml, SvgUri } from 'react-native-svg'

// Caché de SVGs compartida (memoria + AsyncStorage + dedup)
import { getCachedSvgSync, loadSvg } from '../../helpers/svgCache'

/**
 * SvgUri con caché. El SvgUri de react-native-svg refetchea el URL en CADA
 * montaje — los logos remotos "recargan" visiblemente en cada salto de
 * tab/screen. Este wrapper sirve el XML desde svgCache (memoria síncrona →
 * remounts sin parpadeo; AsyncStorage → arranques fríos sin red) y solo deja
 * el SvgUri original como stopgap durante la primera descarga de la sesión.
 * En fallo renderiza null — el caller pone su propio placeholder.
 *
 * @param {object} props
 * @param {string} props.uri - URL del SVG remoto.
 * Resto de props (width, height, color…) pasan a SvgXml/SvgUri.
 */
const QPSvgUri = ({ uri, ...rest }) => {

	const [xml, setXml] = useState(() => (uri ? getCachedSvgSync(uri) : null))
	const [failed, setFailed] = useState(false)

	useEffect(() => {
		if (!uri) return
		const cached = getCachedSvgSync(uri)
		if (cached) {
			setXml(cached)
			return
		}
		let cancelled = false
		loadSvg(uri).then((result) => {
			if (cancelled) return
			if (result) setXml(result)
			else setFailed(true)
		})
		return () => { cancelled = true }
	}, [uri])

	if (!uri || failed) return null
	if (xml) return <SvgXml xml={xml} {...rest} />
	return <SvgUri uri={uri} {...rest} />
}

export default QPSvgUri
