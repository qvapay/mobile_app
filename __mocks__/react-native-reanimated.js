/**
 * Minimal manual mock for react-native-reanimated (jest).
 *
 * The official 'react-native-reanimated/mock' ships as untransformed TypeScript
 * (mock.js -> src/mock.ts) and can't be loaded under this repo's jest setup
 * without whitelisting the whole package in transformIgnorePatterns. Tests only
 * need inert stand-ins: animated components render as their plain RN
 * counterparts and every animation helper resolves to its target value.
 */
const { View, Text, Image, ScrollView, FlatList } = require('react-native')

const Animated = {
	View,
	Text,
	Image,
	ScrollView,
	FlatList,
	createAnimatedComponent: (Component) => Component,
}

// Chainable stub for entering/exiting layout animations (FadeIn.duration(200)...)
const layoutAnimationStub = new Proxy({}, { get: (target, prop) => (prop === 'build' ? () => ({}) : () => layoutAnimationStub) })

module.exports = {
	__esModule: true,
	default: Animated,
	useSharedValue: (initial) => ({ value: initial }),
	useDerivedValue: (fn) => ({ value: typeof fn === 'function' ? fn() : fn }),
	useAnimatedStyle: () => ({}),
	useAnimatedProps: () => ({}),
	useAnimatedRef: () => ({ current: null }),
	useAnimatedReaction: () => {},
	useAnimatedScrollHandler: () => () => {},
	withTiming: (toValue) => toValue,
	withSpring: (toValue) => toValue,
	withDecay: (config) => (config && config.velocity) || 0,
	withRepeat: (animation) => animation,
	withDelay: (_delay, animation) => animation,
	withSequence: (...animations) => animations[animations.length - 1],
	cancelAnimation: () => {},
	interpolate: (_value, _input, output) => (output ? output[0] : 0),
	interpolateColor: (_value, _input, output) => (output ? output[0] : 'transparent'),
	Extrapolation: { CLAMP: 'clamp', EXTEND: 'extend', IDENTITY: 'identity' },
	Easing: {
		linear: (t) => t,
		ease: (t) => t,
		quad: (t) => t,
		cubic: (t) => t,
		bezier: () => ({ factory: () => (t) => t }),
		in: (fn) => fn,
		out: (fn) => fn,
		inOut: (fn) => fn,
	},
	runOnJS: (fn) => fn,
	runOnUI: (fn) => fn,
	FadeIn: layoutAnimationStub,
	FadeOut: layoutAnimationStub,
	FadeInDown: layoutAnimationStub,
	FadeInUp: layoutAnimationStub,
	FadeOutDown: layoutAnimationStub,
	FadeOutUp: layoutAnimationStub,
	SlideInDown: layoutAnimationStub,
	SlideInUp: layoutAnimationStub,
	SlideOutDown: layoutAnimationStub,
	SlideOutUp: layoutAnimationStub,
	Layout: layoutAnimationStub,
	LinearTransition: layoutAnimationStub,
}
