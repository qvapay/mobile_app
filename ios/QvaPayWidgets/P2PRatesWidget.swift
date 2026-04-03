import WidgetKit
import SwiftUI

// MARK: - Timeline Provider

struct P2PRatesProvider: TimelineProvider {
    func placeholder(in context: Context) -> P2PRatesEntry {
        .placeholder
    }

    func getSnapshot(in context: Context, completion: @escaping (P2PRatesEntry) -> Void) {
        if context.isPreview {
            completion(.placeholder)
            return
        }
        Task {
            let averages = await QvaPayAPI.fetchP2PAverages()
            let pairs = QvaPayAPI.parsePairs(from: averages)
            let entry = P2PRatesEntry(
                date: Date(),
                pairs: pairs.isEmpty ? CoinPair.placeholders : pairs,
                isPlaceholder: pairs.isEmpty
            )
            completion(entry)
        }
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<P2PRatesEntry>) -> Void) {
        Task {
            let averages = await QvaPayAPI.fetchP2PAverages()
            let pairs = QvaPayAPI.parsePairs(from: averages)
            let entry = P2PRatesEntry(
                date: Date(),
                pairs: pairs.isEmpty ? CoinPair.placeholders : pairs,
                isPlaceholder: pairs.isEmpty
            )
            // Refresh every 15 minutes
            let nextUpdate = Calendar.current.date(byAdding: .minute, value: 15, to: Date())!
            let timeline = Timeline(entries: [entry], policy: .after(nextUpdate))
            completion(timeline)
        }
    }
}

// MARK: - Widget Views

struct P2PRatesSmallView: View {
    let entry: P2PRatesEntry

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack {
                Image(systemName: "arrow.left.arrow.right")
                    .font(.system(size: 10, weight: .bold))
                    .foregroundColor(Color(hex: "#6759EF"))
                Text("Tasas P2P")
                    .font(.system(size: 11, weight: .bold))
                    .foregroundColor(.white)
                Spacer()
            }
            .padding(.bottom, 2)

            ForEach(entry.pairs.prefix(4)) { pair in
                HStack(spacing: 0) {
                    Text(CoinPair.displayNames[pair.id] ?? pair.name)
                        .font(.system(size: 11, weight: .medium))
                        .foregroundColor(.white)
                        .frame(width: 52, alignment: .leading)

                    Spacer()

                    Text(pair.formattedBuy)
                        .font(.system(size: 11, weight: .semibold, design: .monospaced))
                        .foregroundColor(Color(hex: "#7BFFB1"))
                        .frame(width: 38, alignment: .trailing)

                    Text("/")
                        .font(.system(size: 9))
                        .foregroundColor(Color.white.opacity(0.4))
                        .padding(.horizontal, 2)

                    Text(pair.formattedSell)
                        .font(.system(size: 11, weight: .semibold, design: .monospaced))
                        .foregroundColor(Color(hex: "#DB253E"))
                        .frame(width: 38, alignment: .trailing)
                }
            }

            Spacer(minLength: 0)

            if !entry.isPlaceholder {
                Text(entry.date, style: .time)
                    .font(.system(size: 8))
                    .foregroundColor(Color.white.opacity(0.3))
            }
        }
        .padding(12)
        .containerBackground(for: .widget) {
            Color(hex: "#0E0E1C")
        }
    }
}

struct P2PRatesMediumView: View {
    let entry: P2PRatesEntry

    var body: some View {
        VStack(alignment: .leading, spacing: 3) {
            HStack {
                Image(systemName: "arrow.left.arrow.right")
                    .font(.system(size: 11, weight: .bold))
                    .foregroundColor(Color(hex: "#6759EF"))
                Text("Tasas P2P")
                    .font(.system(size: 12, weight: .bold))
                    .foregroundColor(.white)
                Spacer()
                if !entry.isPlaceholder {
                    Text(entry.date, style: .time)
                        .font(.system(size: 9))
                        .foregroundColor(Color.white.opacity(0.3))
                }
            }
            .padding(.bottom, 2)

            // Header
            HStack(spacing: 0) {
                Text("Moneda")
                    .frame(width: 70, alignment: .leading)
                Spacer()
                Text("Compra")
                    .frame(width: 60, alignment: .trailing)
                Text("Venta")
                    .frame(width: 60, alignment: .trailing)
                Text("#")
                    .frame(width: 30, alignment: .trailing)
            }
            .font(.system(size: 9, weight: .medium))
            .foregroundColor(Color.white.opacity(0.4))

            ForEach(entry.pairs.prefix(6)) { pair in
                HStack(spacing: 0) {
                    Text(CoinPair.displayNames[pair.id] ?? pair.name)
                        .font(.system(size: 12, weight: .medium))
                        .foregroundColor(.white)
                        .frame(width: 70, alignment: .leading)

                    Spacer()

                    Text(pair.formattedBuy)
                        .font(.system(size: 12, weight: .semibold, design: .monospaced))
                        .foregroundColor(Color(hex: "#7BFFB1"))
                        .frame(width: 60, alignment: .trailing)

                    Text(pair.formattedSell)
                        .font(.system(size: 12, weight: .semibold, design: .monospaced))
                        .foregroundColor(Color(hex: "#DB253E"))
                        .frame(width: 60, alignment: .trailing)

                    Text("\(pair.count)")
                        .font(.system(size: 10, design: .monospaced))
                        .foregroundColor(Color.white.opacity(0.4))
                        .frame(width: 30, alignment: .trailing)
                }
            }

            Spacer(minLength: 0)
        }
        .padding(12)
        .containerBackground(for: .widget) {
            Color(hex: "#0E0E1C")
        }
    }
}

// MARK: - Widget Definition

struct P2PRatesWidget: Widget {
    let kind = "P2PRatesWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: P2PRatesProvider()) { entry in
            if #available(iOSApplicationExtension 17.0, *) {
                P2PRatesWidgetEntryView(entry: entry)
            } else {
                P2PRatesWidgetEntryView(entry: entry)
            }
        }
        .configurationDisplayName("Tasas P2P")
        .description("Tasas de compra y venta en el P2P de QvaPay")
        .supportedFamilies([.systemSmall, .systemMedium])
    }
}

struct P2PRatesWidgetEntryView: View {
    @Environment(\.widgetFamily) var family
    let entry: P2PRatesEntry

    var body: some View {
        switch family {
        case .systemSmall:
            P2PRatesSmallView(entry: entry)
        case .systemMedium:
            P2PRatesMediumView(entry: entry)
        default:
            P2PRatesMediumView(entry: entry)
        }
    }
}

// MARK: - Color Extension

extension Color {
    init(hex: String) {
        let hex = hex.trimmingCharacters(in: CharacterSet.alphanumerics.inverted)
        var int: UInt64 = 0
        Scanner(string: hex).scanHexInt64(&int)
        let a, r, g, b: UInt64
        switch hex.count {
        case 6:
            (a, r, g, b) = (255, (int >> 16) & 0xFF, (int >> 8) & 0xFF, int & 0xFF)
        case 8:
            (a, r, g, b) = ((int >> 24) & 0xFF, (int >> 16) & 0xFF, (int >> 8) & 0xFF, int & 0xFF)
        default:
            (a, r, g, b) = (255, 0, 0, 0)
        }
        self.init(
            .sRGB,
            red: Double(r) / 255,
            green: Double(g) / 255,
            blue: Double(b) / 255,
            opacity: Double(a) / 255
        )
    }
}

// MARK: - Preview

#if DEBUG
#Preview("Small", as: .systemSmall) {
    P2PRatesWidget()
} timeline: {
    P2PRatesEntry.placeholder
}

#Preview("Medium", as: .systemMedium) {
    P2PRatesWidget()
} timeline: {
    P2PRatesEntry.placeholder
}
#endif
