/**
 * Jest manual mock for munim-bluetooth (Nitro module — can't load in tests).
 * Exposes the Multipeer/BLE surface the nearby/ transports consume, plus a
 * `__emit` / `__reset` test harness to drive native events from specs.
 */

const listeners = {}

export const __emit = (eventName, payload) => { (listeners[eventName] || []).forEach(cb => cb(payload)) }

export const __reset = () => {
	Object.keys(listeners).forEach(k => delete listeners[k])
	startMultipeerSession.mockClear()
	stopMultipeerSession.mockClear()
	inviteMultipeerPeer.mockClear()
	sendMultipeerMessage.mockClear()
	getMultipeerPeers.mockClear()
	isBluetoothEnabled.mockClear()
	requestBluetoothPermission.mockClear()
}

export const addEventListener = jest.fn((eventName, callback) => {
	listeners[eventName] = listeners[eventName] || []
	listeners[eventName].push(callback)
	return () => {
		listeners[eventName] = (listeners[eventName] || []).filter(cb => cb !== callback)
	}
})

// ---- Multipeer ----
export const startMultipeerSession = jest.fn()
export const stopMultipeerSession = jest.fn()
export const inviteMultipeerPeer = jest.fn()
export const getMultipeerPeers = jest.fn(() => Promise.resolve([]))
export const sendMultipeerMessage = jest.fn(() => Promise.resolve())

// ---- Shared / BLE (phase 2 surface) ----
export const isBluetoothEnabled = jest.fn(() => Promise.resolve(true))
export const requestBluetoothPermission = jest.fn(() => Promise.resolve(true))
export const getCapabilities = jest.fn(() => Promise.resolve({}))
export const startAdvertising = jest.fn()
export const stopAdvertising = jest.fn()
export const setServices = jest.fn()
export const updateCharacteristicValue = jest.fn()
export const startScan = jest.fn()
export const stopScan = jest.fn()
export const connect = jest.fn(() => Promise.resolve())
export const disconnect = jest.fn()
