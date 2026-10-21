#import <React/RCTBridgeModule.h>

@interface RCT_EXTERN_MODULE(ScreenBrightness, NSObject)

RCT_EXTERN_METHOD(boost:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(restore:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)

@end
