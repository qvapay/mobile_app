import Foundation
import WidgetKit

// MARK: - API Response Models

struct CoinAverage: Codable {
    let name: String?
    let average: Double?
    let average_buy: Double?
    let average_sell: Double?
    let count: Int?
}

struct P2PRatesEntry: TimelineEntry {
    let date: Date
    let pairs: [CoinPair]
    let isPlaceholder: Bool

    static var placeholder: P2PRatesEntry {
        P2PRatesEntry(
            date: Date(),
            pairs: CoinPair.placeholders,
            isPlaceholder: true
        )
    }
}

struct CoinPair: Identifiable {
    let id: String // tick
    let name: String
    let buy: Double
    let sell: Double
    let count: Int

    var formattedBuy: String {
        buy == 0 ? "—" : String(format: "%.0f", buy)
    }

    var formattedSell: String {
        sell == 0 ? "—" : String(format: "%.0f", sell)
    }

    static let orderedTicks = [
        "BANK_CUP", "BANK_MLC", "CLASICA", "BANDECPREPAGO",
        "ETECSA", "TROPIPAY", "ZELLE", "BOLSATM"
    ]

    static let displayNames: [String: String] = [
        "BANK_CUP": "CUP",
        "BANK_MLC": "MLC",
        "CLASICA": "Clásica",
        "BANDECPREPAGO": "Bandec",
        "ETECSA": "ETECSA",
        "TROPIPAY": "TropiPay",
        "ZELLE": "Zelle",
        "BOLSATM": "BolsaTM"
    ]

    static var placeholders: [CoinPair] {
        orderedTicks.prefix(8).map { tick in
            CoinPair(
                id: tick,
                name: displayNames[tick] ?? tick,
                buy: 0,
                sell: 0,
                count: 0
            )
        }
    }
}

// MARK: - Decimales del backend

/// Los importes de QvaPay viajan como string ("1964.45") o como número según
/// el endpoint. `as? Double` devuelve nil ante un NSString, así que leerlos
/// directamente pintaba 0 en todos los widgets. Acepta ambas formas.
///
/// - Parameter value: Valor crudo salido de `JSONSerialization`.
/// - Returns: El Double equivalente, o 0 si no se puede interpretar.
func widgetDouble(_ value: Any?) -> Double {
    if let number = value as? NSNumber { return number.doubleValue }
    if let string = value as? String { return Double(string) ?? 0 }
    return 0
}
