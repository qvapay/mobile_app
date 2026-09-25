/**
 * Mock de FlashList para los tests en entorno node.
 *
 * El paquete publica ESM y no está en `transformIgnorePatterns`, así que importarlo de
 * verdad revienta la suite al parsear. Este mock replica lo único que los tests necesitan:
 * que `renderItem` se llame por cada elemento y que los estados vacío/pie se rendericen,
 * para poder inspeccionar las filas como con cualquier otra lista.
 *
 * Vive en `__mocks__/` de la raíz porque jest lo aplica solo a los paquetes de node_modules,
 * sin que cada suite tenga que declararlo.
 */
const React = require('react')
const { View } = require('react-native')

// Se renderiza como un host llamado 'FlashList' (y no como un View anónimo) para que los
// tests puedan localizarla y comprobar cómo la envuelve quien la usa — por ejemplo, que
// lleve alto explícito, sin el cual la lista real no pinta nada.

const FlashList = ({ data = [], renderItem, keyExtractor, ListEmptyComponent, ListHeaderComponent, ListFooterComponent, ...rest }) => {
	const render = (node) => (typeof node === 'function' ? React.createElement(node) : node)
	return React.createElement(
		'FlashList',
		rest,
		render(ListHeaderComponent),
		data.length === 0
			? render(ListEmptyComponent)
			: data.map((item, index) => React.createElement(
				React.Fragment,
				{ key: keyExtractor ? keyExtractor(item, index) : String(index) },
				renderItem ? renderItem({ item, index }) : null,
			)),
		render(ListFooterComponent),
	)
}

module.exports = { FlashList, FlashListRef: View, default: FlashList }
