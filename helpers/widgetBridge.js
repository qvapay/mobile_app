import { NativeModules, Platform } from 'react-native'

const { SharedStorage } = NativeModules

/**
 * Update widget with latest balance data.
 * Called from AuthContext after profile fetch.
 */
export const updateWidgetBalance = async (balance, username) => {
	try {
		if (SharedStorage?.setWidgetData) {
			await SharedStorage.setWidgetData(
				'balance',
				JSON.stringify({
					balance: balance ?? 0,
					username: username ?? '',
					updatedAt: Date.now(),
				})
			)
		}
	} catch (error) {
		// Widget update is non-critical, fail silently
	}
}

/**
 * Update widget with latest P2P offers data.
 * Called from P2P screen after fetching user's offers.
 */
export const updateWidgetP2POffers = async (offers) => {
	try {
		if (SharedStorage?.setWidgetData) {
			const summary = (offers || []).slice(0, 5).map(o => ({
				uuid: o.uuid,
				type: o.type,
				coin: o.coin,
				amount: o.amount,
				receive: o.receive,
				status: o.status,
			}))
			await SharedStorage.setWidgetData(
				'p2p_offers',
				JSON.stringify({
					count: offers?.length ?? 0,
					offers: summary,
					updatedAt: Date.now(),
				})
			)
		}
	} catch (error) {
		// Widget update is non-critical, fail silently
	}
}

/**
 * Reload widget timelines (iOS only).
 * Forces widgets to refresh their display.
 */
export const reloadWidgets = async () => {
	try {
		if (Platform.OS === 'ios' && SharedStorage?.reloadWidgets) {
			await SharedStorage.reloadWidgets()
		}
	} catch (error) {
		// Non-critical
	}
}
