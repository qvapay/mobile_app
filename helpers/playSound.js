import Sound from 'react-native-sound'

Sound.setCategory('Playback')

const playSound = (name) => {
	const filename = `${name}.mp3`
	const sound = new Sound(filename, Sound.MAIN_BUNDLE, (error) => {
		if (error) return
		sound.play(() => sound.release())
	})
}

export default playSound
