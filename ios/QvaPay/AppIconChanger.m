#import <React/RCTBridgeModule.h>

@interface RCT_EXTERN_MODULE(AppIconChanger, NSObject)

RCT_EXTERN_METHOD(getIcon:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(changeIcon:(NSString *)iconName
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)

@end
