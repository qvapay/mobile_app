import { Text } from "react-native"
import ReactNativeHapticFeedback from "react-native-haptic-feedback"

import { copyTextToClipboard, detectCopyableText } from "../../helpers"

// Chat message text with tappable patterns (phones, cards, emails)
const ChatMessageText = ({ text, textStyle, highlightColor }) => {

	const matches = detectCopyableText(text)
	if (matches.length === 0) return <Text style={textStyle}>{text}</Text>

	const parts = []
	let cursor = 0
	for (const m of matches) {
		if (m.start > cursor) parts.push({ text: text.slice(cursor, m.start), copyable: false })
		parts.push({ text: m.value, copyable: true, type: m.type })
		cursor = m.end
	}
	if (cursor < text.length) parts.push({ text: text.slice(cursor), copyable: false })

	return (
		<Text style={textStyle}>
			{parts.map((p, i) =>
				p.copyable ? (
					<Text key={i} style={{ textDecorationLine: 'underline', color: highlightColor }}
						onPress={() => {
							ReactNativeHapticFeedback.trigger('impactLight', { enableVibrateFallback: true, ignoreAndroidSystemSettings: false })
							// For emails keep original, for phones/cards strip spaces and dashes
							const cleaned = p.type === 'email' ? p.text : p.text.replace(/[\s-]/g, '')
							copyTextToClipboard(cleaned)
						}}>
						{p.text}
					</Text>
				) : (<Text key={i}>{p.text}</Text>)
			)}
		</Text>
	)
}

export default ChatMessageText
