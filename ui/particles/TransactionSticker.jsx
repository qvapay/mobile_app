import { View } from 'react-native'
import FastImage from '@d11/react-native-fast-image'

import { getStickerMediaUrl } from '../../helpers/stickers'

// Inline animated sticker used in the transfer flow and transaction views.
// `size` is the rendered square in px. The CDN exposes `.gif` siblings of
// each `.webm` sticker so iOS doesn't need a webm decoder.
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
