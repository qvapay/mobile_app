import Sound from 'react-native-sound'

// 'Playback' audio session category: effects play even with the iOS mute switch on
Sound.setCategory('Playback')

/**
 * Plays a bundled sound effect by name, fire-and-forget.
 *
 * Files live in assets/sounds and are linked into the native bundles via
 * react-native.config.js (iOS main bundle / Android res/raw), so `name` maps
 * to `<name>.mp3` — currently 'money_in', 'money_out' and 'notification'.
 * The Sound instance is released when playback ends; load errors are silent.
 *
 * @param {string} name - Sound filename without the .mp3 extension.
 */
const playSound = (name) => {
	const filename = `${name}.mp3`
	const sound = new Sound(filename, Sound.MAIN_BUNDLE, (error) => {
		if (error) return
		sound.play(() => sound.release())
	})
}

export default playSound
