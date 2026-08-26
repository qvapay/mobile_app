import { Text } from "react-native"
import type { StyleProp, TextStyle } from "react-native"
import ReactNativeHapticFeedback from "react-native-haptic-feedback"

import { copyTextToClipboard, detectCopyableText } from "../../helpers"
import type { CopyableMatch } from "../../helpers"

type ChatMessageTextProps = {
	text: string
	textStyle?: StyleProp<TextStyle>
	highlightColor?: string
}

/** Trozo del mensaje ya partido: texto plano o fragmento copiable con su tipo. */
type MessagePart = { text: string, copyable: boolean, type?: CopyableMatch['type'] }

// Chat message text with tappable patterns (phones, cards, emails)
const ChatMessageText = ({ text, textStyle, highlightColor }: ChatMessageTextProps) => {

	const matches = detectCopyableText(text)
	if (matches.length === 0) return <Text style={textStyle}>{text}</Text>

	const parts: MessagePart[] = []
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
