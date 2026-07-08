import { Platform, RefreshControl } from 'react-native'

/**
 * Builds an invisible `RefreshControl`: pull-to-refresh mechanics stay active
 * but the native spinner is fully hidden (transparent tint/colors; on Android
 * the progress view is pushed off-screen since it can't be made transparent).
 * Used by nearly every scrollable screen (Home, Transactions, P2P, store, ...)
 * so each can show its own custom loading UI instead of the platform spinner.
 *
 * @param {boolean} refreshing - Whether a refresh is in flight.
 * @param {() => void} onRefresh - Pull-to-refresh callback.
 * @returns {React.ReactElement} A RefreshControl to pass as `refreshControl`.
 */
export const createHiddenRefreshControl = (refreshing, onRefresh) => (
    <RefreshControl
        refreshing={refreshing}
        onRefresh={onRefresh}
        tintColor="transparent"
        title=""
        titleColor="transparent"
        colors={['transparent']}
        progressBackgroundColor="transparent"
        {...(Platform.OS === 'android' && { progressViewOffset: -10000 })}
    />
)
