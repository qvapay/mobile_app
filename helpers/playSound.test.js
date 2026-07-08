/**
 * Unit tests for the fire-and-forget sound helper — node environment with
 * react-native-sound mocked (see keypadAmount.test.js for why).
 * @jest-environment node
 */
jest.mock('react-native-sound', () => {
	const instances = []
	function MockSound(filename, bundle, onLoad) {
		this.filename = filename
		this.bundle = bundle
		this.play = jest.fn()
		this.release = jest.fn()
		instances.push(this)
		MockSound.lastOnLoad = onLoad
	}
	MockSound.setCategory = jest.fn()
	MockSound.MAIN_BUNDLE = 'MAIN_BUNDLE'
	MockSound.instances = instances
	return MockSound
})

import Sound from 'react-native-sound'
import playSound from './playSound'

beforeEach(() => { Sound.instances.length = 0 })

test('sets the Playback category at module load (plays despite the iOS mute switch)', () => {
	expect(Sound.setCategory).toHaveBeenCalledWith('Playback')
})

test('loads <name>.mp3 from the main bundle and plays it once loaded', () => {
	playSound('money_in')
	const [sound] = Sound.instances
	expect(sound.filename).toBe('money_in.mp3')
	expect(sound.bundle).toBe('MAIN_BUNDLE')
	Sound.lastOnLoad(null)
	expect(sound.play).toHaveBeenCalled()
})

test('releases the instance when playback ends', () => {
	playSound('notification')
	const [sound] = Sound.instances
	Sound.lastOnLoad(null)
	const playbackDone = sound.play.mock.calls[0][0]
	playbackDone()
	expect(sound.release).toHaveBeenCalled()
})

test('a load error is silent — nothing plays', () => {
	playSound('money_out')
	const [sound] = Sound.instances
	Sound.lastOnLoad(new Error('missing file'))
	expect(sound.play).not.toHaveBeenCalled()
})
