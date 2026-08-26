import { View, Text, ScrollView, Pressable, Modal, StyleSheet } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import FontAwesome6 from '@react-native-vector-icons/fontawesome6'
import { useTranslation } from 'react-i18next'

import type { Theme } from '../../theme/ThemeContext'
import type { TextStyles } from '../../theme/themeUtils'

/**
 * Método de pago guardado (`GET /user/payment-methods`). Los detalles llegan en
 * `details` o `Details`, como array de pares o como mapa plano — ambos se pintan.
 */
export type SavedPaymentMethod = {
	id?: number | string
	uuid?: string
	name?: string
	coin?: { tick?: string, name?: string } | string
	tick?: string
	ticker?: string
	details?: SavedMethodDetail[] | Record<string, unknown> | null
	Details?: SavedMethodDetail[] | Record<string, unknown> | null
}

/** Par etiqueta/valor de un método guardado: el backend ha usado los cuatro nombres. */
export type SavedMethodDetail = { name?: string, key?: string, value?: string, val?: string }

type SavedMethodsModalProps = {
	visible: boolean
	onClose: () => void
	loading?: boolean
	methods?: SavedPaymentMethod[]
	onSelect: (method: SavedPaymentMethod) => void
	theme: Theme
	textStyles: TextStyles
}

// Picker for the user's saved payment methods (filtered to the selected coin).
const SavedMethodsModal = ({ visible, onClose, loading, methods, onSelect, theme, textStyles }: SavedMethodsModalProps) => {

	const { t } = useTranslation()

	return (
		<Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
			<SafeAreaView style={[styles.modalContainer, { backgroundColor: theme.colors.background }]}>
				<View style={[styles.modalHeader, { borderBottomColor: theme.colors.elevation }]}>
					<Text style={textStyles.h4}>{t('p2p.savedMethods.title')}</Text>
					<Pressable onPress={onClose} style={styles.closeButton}>
						<FontAwesome6 name="xmark" size={24} color={theme.colors.primaryText} iconStyle="solid" />
					</Pressable>
				</View>

				<ScrollView style={styles.coinList} contentContainerStyle={styles.coinListContent} showsVerticalScrollIndicator={true}>
					{loading ? (
						<View style={styles.loadingContainer}>
							<Text style={[textStyles.subtitle, { color: theme.colors.secondaryText }]}>{t('p2p.savedMethods.loading')}</Text>
						</View>
					) : (methods || []).length > 0 ? (
						(methods || []).map((method) => {
							// `coin` puede venir como objeto o como tick suelto — solo el objeto tiene `name`
							const name = method?.name || (method?.coin as { name?: string } | undefined)?.name || t('p2p.savedMethods.fallbackName')
							const rawDetails = (method && (method.details || method.Details)) || null
							const methodDetails: SavedMethodDetail[] = Array.isArray(rawDetails) ? rawDetails : rawDetails && typeof rawDetails === 'object' ? Object.entries(rawDetails).map(([k, v]) => ({ name: k, value: String(v ?? '') })) : []
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
							<Text style={[textStyles.subtitle, { color: theme.colors.secondaryText }]}>{t('p2p.savedMethods.empty')}</Text>
						</View>
					)}
				</ScrollView>
			</SafeAreaView>
		</Modal>
	)
}

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
