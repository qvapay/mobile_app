/**
 * Runtime permission handling for the nearby transports.
 *
 * iOS: Multipeer triggers the Local Network prompt by itself on first session
 * start (NSLocalNetworkUsageDescription + NSBonjourServices in Info.plist);
 * there is no API to query or pre-request it, so we optimistically return
 * 'granted' and surface a denial as the transport's error state instead.
 *
 * Android (phase 2 — BLE): API 31+ needs the three runtime BLUETOOTH_*
 * permissions; older versions need fine location for BLE scans.
 */
import { Platform, PermissionsAndroid } from 'react-native'

/** Outcome of the platform permission gate. */
export type NearbyPermissionResult = 'granted' | 'denied' | 'unavailable'

/**
 * Ensures the platform permissions needed before starting a transport.
 */
export const ensureNearbyPermissions = async (): Promise<NearbyPermissionResult> => {

	if (Platform.OS === 'ios') { return 'granted' }

	// Android — phase 2 (BLE). Kept here so the gate UI is already wired.
	try {
		// Platform.Version is number on Android (string only on iOS, ruled out above)
		if ((Platform.Version as number) >= 31) {
			const result = await PermissionsAndroid.requestMultiple([
				PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
				PermissionsAndroid.PERMISSIONS.BLUETOOTH_ADVERTISE,
				PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
			])
			return Object.values(result).every(v => v === PermissionsAndroid.RESULTS.GRANTED) ? 'granted' : 'denied'
		}
		const location = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION)
		return location === PermissionsAndroid.RESULTS.GRANTED ? 'granted' : 'denied'
	} catch { return 'unavailable' }
}
