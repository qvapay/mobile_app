import { View, Text, ScrollView, Pressable, Modal, StyleSheet } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import FontAwesome6 from '@react-native-vector-icons/fontawesome6'

// Picker for the user's saved payment methods (filtered to the selected coin).
const SavedMethodsModal = ({ visible, onClose, loading, methods, onSelect, theme, textStyles }) => (
	<Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
		<SafeAreaView style={[styles.modalContainer, { backgroundColor: theme.colors.background }]}>
			<View style={[styles.modalHeader, { borderBottomColor: theme.colors.elevation }]}>
				<Text style={textStyles.h4}>Seleccionar método guardado</Text>
				<Pressable onPress={onClose} style={styles.closeButton}>
					<FontAwesome6 name="xmark" size={24} color={theme.colors.primaryText} iconStyle="solid" />
				</Pressable>
			</View>

			<ScrollView style={styles.coinList} contentContainerStyle={styles.coinListContent} showsVerticalScrollIndicator={true}>
				{loading ? (
					<View style={styles.loadingContainer}>
						<Text style={[textStyles.subtitle, { color: theme.colors.secondaryText }]}>Cargando métodos...</Text>
					</View>
				) : (methods || []).length > 0 ? (
					(methods || []).map((method) => {
						const name = method?.name || method?.coin?.name || 'Método'
						const rawDetails = (method && (method.details || method.Details)) || null
						const methodDetails = Array.isArray(rawDetails) ? rawDetails : rawDetails && typeof rawDetails === 'object' ? Object.entries(rawDetails).map(([k, v]) => ({ name: k, value: String(v ?? '') })) : []
						return (
							<Pressable key={method.id || method.uuid || JSON.stringify(method)} style={[styles.coinItem, { backgroundColor: theme.colors.surface, borderColor: theme.colors.primary }]} onPress={() => onSelect(method)}>
								<View style={{ flex: 1 }}>
									<Text style={textStyles.h4}>{name}</Text>
									{methodDetails.length > 0 && (
										<View style={{ marginTop: 6, gap: 4 }}>
											{methodDetails.slice(0, 4).map((d, idx) => (
												<View key={idx} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
													<Text style={[textStyles.h6, { color: theme.colors.tertiaryText }]} numberOfLines={1}>{d.name || d.key}</Text>
													<Text style={[textStyles.h6, { color: theme.colors.primaryText, fontWeight: '600', marginLeft: 8 }]} numberOfLines={1} ellipsizeMode="middle">{d.value || d.val}</Text>
												</View>
											))}
										</View>
									)}
								</View>
							</Pressable>
						)
					})
				) : (
					<View style={styles.loadingContainer}>
						<Text style={[textStyles.subtitle, { color: theme.colors.secondaryText }]}>No hay métodos guardados para esta moneda</Text>
					</View>
				)}
			</ScrollView>
		</SafeAreaView>
	</Modal>
)

const styles = StyleSheet.create({
	modalContainer: { flex: 1 },
	modalHeader: {
		flexDirection: 'row',
		justifyContent: 'space-between',
		alignItems: 'center',
		paddingHorizontal: 20,
		paddingVertical: 15,
		borderBottomWidth: 0.5,
	},
	closeButton: { padding: 5 },
	coinList: { flex: 1 },
	coinListContent: { paddingHorizontal: 20, paddingTop: 10, paddingBottom: 40 },
	coinItem: {
		flexDirection: 'row',
		alignItems: 'center',
		padding: 12,
		borderRadius: 12,
		marginBottom: 4,
		borderWidth: 1,
	},
	loadingContainer: {
		alignItems: 'center',
		justifyContent: 'center',
		padding: 40,
	},
})

export default SavedMethodsModal
