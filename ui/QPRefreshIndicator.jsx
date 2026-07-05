import { Platform, RefreshControl } from 'react-native'

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
