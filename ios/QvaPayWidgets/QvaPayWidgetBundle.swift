import WidgetKit
import SwiftUI

@main
struct QvaPayWidgetBundle: WidgetBundle {
    var body: some Widget {
        BalanceWidget()
        // Widgets de P2P (Tasas y Ofertas) retirados del selector por ahora.
        // El codigo sigue en P2PRatesWidget.swift y P2POffersWidget.swift:
        // para reactivarlos basta con descomentar estas dos lineas.
        // P2PRatesWidget()
        // P2POffersWidget()
    }
}
