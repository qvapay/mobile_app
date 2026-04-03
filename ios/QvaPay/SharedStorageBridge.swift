import Foundation
import WidgetKit
import React

@objc(SharedStorage)
class SharedStorage: NSObject {

    private static let suiteName = "group.com.qvapay"

    @objc
    func setWidgetData(_ key: String, value: String, resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
        guard let defaults = UserDefaults(suiteName: SharedStorage.suiteName) else {
            reject("ERROR", "Could not access shared UserDefaults", nil)
            return
        }
        defaults.set(value, forKey: key)
        defaults.synchronize()
        resolve(true)
    }

    @objc
    func getWidgetData(_ key: String, resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
        guard let defaults = UserDefaults(suiteName: SharedStorage.suiteName) else {
            reject("ERROR", "Could not access shared UserDefaults", nil)
            return
        }
        let value = defaults.string(forKey: key)
        resolve(value as Any)
    }

    @objc
    func reloadWidgets(_ resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
        if #available(iOS 14.0, *) {
            WidgetCenter.shared.reloadAllTimelines()
        }
        resolve(true)
    }

    @objc
    static func requiresMainQueueSetup() -> Bool {
        return false
    }
}
