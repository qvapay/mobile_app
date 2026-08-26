/**
 * Transport registry for NearbyPay. Phase 1 ships Multipeer (iOS↔iOS);
 * phase 2 adds BleTransport here for iOS↔Android interop — the hook and the
 * radar screen never change.
 */
import { Platform } from 'react-native'
import { createMultipeerTransport } from './MultipeerTransport'
import type { NearbyTransport } from '../useNearbyPeers'

/**
 * Transports available on this device, in messaging-priority order.
 * @returns NearbyTransport instances.
 */
export const getTransports = (): NearbyTransport[] => {
	if (Platform.OS === 'ios') {
		return [createMultipeerTransport()]
	}
	// Android joins in phase 2 with BleTransport.
	return []
}
