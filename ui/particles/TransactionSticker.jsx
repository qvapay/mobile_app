import { View } from 'react-native'
import FastImage from '@d11/react-native-fast-image'

import { getStickerMediaUrl } from '../../helpers/stickers'

/**
 * Inline animated QvaPay sticker used in the transfer flow and transaction views.
 * Stickers persist in transaction descriptions as `:sticker:<name>.webm`
 * (catalog in helpers/stickers.js), but this renders the CDN's `.gif` sibling
 * from `media.qvapay.com/qvi` via FastImage — iOS can't decode webm. See the
 * inline note below for how the gif's black background is keyed out.
 *
 * @param {object} props
 * @param {string} props.name - Sticker name parsed from the description.
 * @param {number} [props.size=48] - Rendered square in px.
 */
const TransactionSticker = ({ name, size = 48, style }) => {

	if (!name) return null

	// The CDN gif has a solid-black background (gif is 1-bit alpha). The web
	// keys the black out by putting `mixBlendMode: 'screen'` on the WRAPPER
	// element (not the video). We mirror that here. iOS Fabric applies
	// CALayer.compositingFilter to whichever view receives the prop, and the
	// wrapper's rendered output naturally includes its FastImage child — so
	// the screen blend runs against the parent surface and the black drops.
	// Putting mixBlendMode on the FastImage style is the wrong shape on iOS
	// because FFFastImageViewComponentView is a content-less container and
	// the GIF is drawn by a sublayer that composites separately.
	return (
		<View style={[{ width: size, height: size, overflow: 'hidden', mixBlendMode: 'screen' }, style]}>
			<FastImage
				source={{
					uri: getStickerMediaUrl(name),
					priority: FastImage.priority.normal,
					cache: FastImage.cacheControl.immutable,
				}}
				style={{ width: size, height: size, backgroundColor: 'transparent' }}
				resizeMode={FastImage.resizeMode.contain}
			/>
		</View>
	)
}

export default TransactionSticker
