/**
 * Minimal manual mock for react-native-worklets (jest).
 *
 * The package ships ESM (lib/module) and needs the native Worklets runtime, so
 * it can't load under this repo's jest setup. Companion of the reanimated mock
 * next to it: there is no UI thread in tests, so the schedulers run the
 * function synchronously on the JS thread.
 */
module.exports = {
	__esModule: true,
	scheduleOnRN: (fn, ...args) => { fn(...args) },
	scheduleOnUI: (fn, ...args) => { fn(...args) },
	runOnJS: (fn) => fn,
	runOnUI: (fn) => fn,
}
