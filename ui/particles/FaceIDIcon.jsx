import Svg, { Path } from 'react-native-svg'

/**
 * Draws Apple's Face ID glyph (SF Symbol "faceid" equivalent) as hand-traced SVG strokes.
 * Exists because the real SF Symbol isn't available cross-platform — this renders
 * identically on Android and accepts any stroke color, so biometric login buttons
 * can match the surrounding theme.
 *
 * @param {object} props
 * @param {number} [props.size=24] - Square dimension in px.
 * @param {string} [props.color='#000'] - Stroke color; pass a theme color to blend in.
 */
const FaceIDIcon = ({ size = 24, color = '#000' }) => (
	<Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
		{/* Top-left corner */}
		<Path d="M2 7V4C2 2.9 2.9 2 4 2H7" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
		{/* Top-right corner */}
		<Path d="M17 2H20C21.1 2 22 2.9 22 4V7" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
		{/* Bottom-right corner */}
		<Path d="M22 17V20C22 21.1 21.1 22 20 22H17" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
		{/* Bottom-left corner */}
		<Path d="M7 22H4C2.9 22 2 21.1 2 20V17" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
		{/* Left eye */}
		<Path d="M8 8.5V10" stroke={color} strokeWidth={1.8} strokeLinecap="round" />
		{/* Right eye */}
		<Path d="M16 8.5V10" stroke={color} strokeWidth={1.8} strokeLinecap="round" />
		{/* Nose */}
		<Path d="M12 9.5V12.5H13" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
		{/* Mouth */}
		<Path d="M8.5 15.5C9.2 16.4 10.5 17 12 17C13.5 17 14.8 16.4 15.5 15.5" stroke={color} strokeWidth={1.8} strokeLinecap="round" />
	</Svg>
)

export default FaceIDIcon
