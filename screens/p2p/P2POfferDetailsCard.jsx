import { View, Text, Pressable } from "react-native"
import FontAwesome6 from "@react-native-vector-icons/fontawesome6"

import { reduceStringInside, copyTextToClipboard } from "../../helpers"

// Detect the icon to render for a P2P offer details field by its label
const getDetailIcon = (name) => {
	const key = String(name || "").toLowerCase()
	if (key.includes("wallet") || key.includes("dirección") || key.includes("direccion") || key.includes("address")) return "wallet"
	if (key.includes("tarjeta") || key.includes("card")) return "credit-card"
	if (key.includes("banco") || key.includes("bank") || key.includes("cuenta") || key.includes("account")) return "building-columns"
	if (key.includes("teléfono") || key.includes("telefono") || key.includes("phone") || key.includes("móvil") || key.includes("movil") || key.includes("mobile")) return "phone"
	if (key.includes("email") || key.includes("correo") || key.includes("e-mail")) return "envelope"
	if (key.includes("nombre") || key.includes("name") || key.includes("titular") || key.includes("holder")) return "user"
	if (key.includes("memo") || key.includes("tag") || key.includes("nota") || key.includes("note")) return "note-sticky"
	if (key.includes("usdt") || key.includes("tron") || key.includes("trx") || key.includes("eth") || key.includes("btc")) return "coins"
	return "circle-info"
}

// Payment-details card + TX id row + contextual status banner shown above the chat.
const P2POfferDetailsCard = ({ p2p, statusMessage, theme, textStyles, containerStyles }) => (
	<>
		{p2p && p2p.details && (() => {
			const rawDetails = (p2p && (p2p.details || p2p.Details)) || null
			const details = Array.isArray(rawDetails)
				? rawDetails
				: (rawDetails && typeof rawDetails === "object") ? Object.entries(rawDetails).map(([k, v]) => ({ name: k, value: String(v ?? "") })) : []

			if (!details || details.length === 0) return null

			return (
				<View style={[containerStyles.card, { marginVertical: 4, paddingVertical: 10, paddingHorizontal: 12 }]}>
					<View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 }}>
						<FontAwesome6 name="list-check" size={12} color={theme.colors.secondaryText} iconStyle="solid" />
						<Text style={[textStyles.h7, { color: theme.colors.secondaryText, textTransform: 'uppercase', letterSpacing: 0.5 }]}>Datos de Pago</Text>
					</View>
					<View style={{ gap: 8 }}>
						{details.slice(0, 4).map((d, idx) => {
							const fullValue = d.value || d.val || ""
							const fieldName = d.name || d.key
							const isWallet = fieldName === "Wallet" || d.key === "Wallet"
							return (
								<View key={idx} style={{ flexDirection: 'row', alignItems: 'center', minHeight: 24 }}>
									<View style={{ width: 22, alignItems: 'center', marginRight: 6 }}>
										<FontAwesome6 name={getDetailIcon(fieldName)} size={14} color={theme.colors.secondaryText} iconStyle="solid" />
									</View>
									<View style={{ flex: 1, marginRight: 8 }}>
										<Text style={[textStyles.h6, { color: theme.colors.tertiaryText }]} numberOfLines={1}>{fieldName}</Text>
									</View>
									<View style={{ flex: 1.5, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 8 }}>
										<Text style={[textStyles.h6, { color: theme.colors.primaryText, fontWeight: '600', flexShrink: 1 }]} numberOfLines={2} ellipsizeMode="middle" selectable={true}>
											{isWallet ? reduceStringInside(fullValue, 8) : fullValue}
										</Text>
										<Pressable onPress={() => copyTextToClipboard(fullValue)} hitSlop={8}>
											<FontAwesome6 name="copy" size={14} color={theme.colors.secondaryText} iconStyle="regular" />
										</Pressable>
									</View>
								</View>
							)
						})}
					</View>
				</View>
			)
		})()}

		{/* TX ID - shown after buyer marks as paid */}
		{p2p?.tx_id ? (
			<View style={[containerStyles.card, { marginVertical: 4, paddingVertical: 10, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', minHeight: 20 }]}>
				<View style={{ flex: 1, marginRight: 8 }}>
					<Text style={[textStyles.h6, { color: theme.colors.tertiaryText }]}>ID de transacción</Text>
				</View>
				<View style={{ flex: 1.5, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 8 }}>
					<Text style={[textStyles.h6, { color: theme.colors.primaryText, fontWeight: '600', flexShrink: 1 }]} numberOfLines={2} ellipsizeMode="middle" selectable={true}>
						{p2p.tx_id}
					</Text>
					<Pressable onPress={() => copyTextToClipboard(p2p.tx_id)} hitSlop={8}>
						<FontAwesome6 name="copy" size={14} color={theme.colors.secondaryText} iconStyle="regular" />
					</Pressable>
				</View>
			</View>
		) : null}

		{/* Status Message — prominent card with colored left border */}
		{statusMessage && (
			<View style={[containerStyles.card, { flexDirection: "row", alignItems: "center", gap: 10, marginVertical: 4, paddingVertical: 12, paddingHorizontal: 12, borderLeftWidth: 3, borderLeftColor: statusMessage.color }]}>
				<FontAwesome6 name={statusMessage.icon} size={16} color={statusMessage.color} iconStyle="solid" />
				<Text style={[textStyles.h6, { color: statusMessage.color, flex: 1, fontWeight: '600' }]}>{statusMessage.text}</Text>
			</View>
		)}
	</>
)

export default P2POfferDetailsCard
