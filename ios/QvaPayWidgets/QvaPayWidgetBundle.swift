import WidgetKit
import SwiftUI

@main
struct QvaPayWidgetBundle: WidgetBundle {
    var body: some Widget {
        P2PRatesWidget()
        BalanceWidget()
        P2POffersWidget()
    }
}
