// QvaPay stickers catalog — mirrors web's scripts/stickers.js so that mobile
// and web agree on the wire format. Description is persisted as
// `:sticker:<name>.webm`; we render the matching `.gif` because iOS AVPlayer
// can't decode webm and FastImage already animates GIFs on both platforms.

const STICKER_MEDIA_BASE_URL = 'https://media.qvapay.com/qvi'
const STICKER_PREFIX = ':sticker:'

export const QVAPAY_STICKERS = [
	'angry.webm',
	'bro.webm',
	'clown.webm',
	'cry.webm',
	'cuba.webm',
	'facepalm.webm',
	'finger.webm',
	'guest.webm',
	'hum.webm',
	'joy.webm',
	'like.webm',
	'loading.webm',
	'lol.webm',
	'love.webm',
	'money.webm',
	'ok.webm',
	'search.webm',
	'upset.webm',
	'who.webm',
	'yeah.webm',
]

const QVAPAY_STICKERS_SET = new Set(QVAPAY_STICKERS)

function isValidStickerName(name) { return typeof name === 'string' && QVAPAY_STICKERS_SET.has(name) }

/**
 * CDN URL for a sticker's mobile render. Web plays the `.webm`; mobile swaps
 * the extension to `.gif` because iOS can't decode webm and FastImage already
 * animates GIFs on both platforms.
 * @param {string} name - Wire name from QVAPAY_STICKERS, e.g. 'joy.webm'.
 * @returns {string} `https://media.qvapay.com/qvi/<name>.gif`
 */
export function getStickerMediaUrl(name) {
	const gifName = typeof name === 'string' ? name.replace(/\.webm$/i, '.gif') : ''
	return `${STICKER_MEDIA_BASE_URL}/${gifName}`
}

/**
 * Classifies a transaction description as sticker or plain text.
 * Only an exact `:sticker:<name>` payload whose name exists in the catalog
 * counts as a sticker — unknown names degrade gracefully to plain text.
 * @param {string} description - Raw description as persisted by the backend.
 * @returns {{ type: 'text'|'sticker', text: string, sticker: string|null }}
 */
export function parseTransactionDescription(description) {
	if (typeof description !== 'string' || description.length === 0) { return { type: 'text', text: '', sticker: null } }
	if (description.startsWith(STICKER_PREFIX)) {
		const name = description.slice(STICKER_PREFIX.length).trim()
		if (isValidStickerName(name)) { return { type: 'sticker', text: '', sticker: name } }
	}
	return { type: 'text', text: description, sticker: null }
}

/**
 * Builds the wire-format description persisted for a sticker transaction.
 * @param {string} name - Wire name from QVAPAY_STICKERS, e.g. 'joy.webm'.
 * @returns {string} `:sticker:<name>`
 */
export function buildStickerDescription(name) { return `${STICKER_PREFIX}${name}` }