#import <React/RCTBridgeModule.h>

@interface RCT_EXTERN_MODULE(MiniAppShortcuts, NSObject)

RCT_EXTERN_METHOD(setQuickActions:(NSArray *)items
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(clearQuickActions:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)

@end
