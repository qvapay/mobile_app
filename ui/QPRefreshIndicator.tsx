import { Platform, RefreshControl } from 'react-native'
import type { RefreshControlProps } from 'react-native'
import type { ReactElement } from 'react'

/**
 * Builds an invisible `RefreshControl`: pull-to-refresh mechanics stay active
 * but the native spinner is fully hidden (transparent tint/colors; on Android
 * the progress view is pushed off-screen since it can't be made transparent).
 * `refreshing` is intentionally hardcoded to `false`: on iOS a refreshing
 * control holds the scroll view's top inset open, leaving an empty gap while
 * data loads — progress is communicated by `GlobalLoadingBar` instead.
 * Used by nearly every scrollable screen (Home, Transactions, P2P, store, ...)
 * so each can show its own custom loading UI instead of the platform spinner.
 *
 * @param _refreshing - Ignored; kept for call-site compatibility.
 * @param onRefresh - Pull-to-refresh callback.
 * @returns A RefreshControl to pass as `refreshControl`.
 */
export const createHiddenRefreshControl = (_refreshing: boolean, onRefresh: () => void): ReactElement<RefreshControlProps> => (
    <RefreshControl
        refreshing={false}
        onRefresh={onRefresh}
        tintColor="transparent"
        title=""
        titleColor="transparent"
        colors={['transparent']}
        progressBackgroundColor="transparent"
        {...(Platform.OS === 'android' && { progressViewOffset: -10000 })}
    />
)
