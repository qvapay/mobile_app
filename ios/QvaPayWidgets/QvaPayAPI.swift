import Foundation

enum QvaPayAPI {
    static let baseURL = "https://api.qvapay.com"

    static func fetchP2PAverages() async -> [String: CoinAverage] {
        guard let url = URL(string: "\(baseURL)/p2p/averages") else { return [:] }

        var request = URLRequest(url: url)
        request.timeoutInterval = 15
        request.setValue("QvaPay-iOS-Widget", forHTTPHeaderField: "X-QvaPay-Client")
        request.setValue("application/json", forHTTPHeaderField: "Accept")

        do {
            let (data, response) = try await URLSession.shared.data(for: request)

            guard let httpResponse = response as? HTTPURLResponse,
                  (200...299).contains(httpResponse.statusCode) else {
                return [:]
            }

            let averages = try JSONDecoder().decode([String: CoinAverage].self, from: data)
            return averages
        } catch {
            return [:]
        }
    }

    static func parsePairs(from averages: [String: CoinAverage]) -> [CoinPair] {
        CoinPair.orderedTicks.compactMap { tick in
            guard let data = averages[tick] else { return nil }
            return CoinPair(
                id: tick,
                name: data.name ?? CoinPair.displayNames[tick] ?? tick,
                buy: data.average_buy ?? 0,
                sell: data.average_sell ?? 0,
                count: data.count ?? 0
            )
        }
    }
}
