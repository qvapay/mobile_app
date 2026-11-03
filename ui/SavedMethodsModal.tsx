import { View, Text, ScrollView, Pressable, Modal, StyleSheet } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import FontAwesome6 from '@react-native-vector-icons/fontawesome6'
import { useTranslation } from 'react-i18next'

import QPAddress from './particles/QPAddress'
import { isWalletFieldName } from '../helpers/addressHighlight'
import { normalizeMethodDetails } from '../screens/withdraw/paymentMethodDetails'
import type { SavedPaymentMethod } from '../screens/withdraw/paymentMethodDetails'
import type { Theme } from '../theme/ThemeContext'
import type { TextStyles } from '../theme/themeUtils'

// El tipo vive en el módulo puro; se re-exporta para quien importe del modal
export type { SavedPaymentMethod, SavedMethodDetail } from '../screens/withdraw/paymentMethodDetails'

type SavedMethodsModalProps = {
	visible: boolean
	onClose: () => void
	loading?: boolean
	/** Ya filtrados a la moneda en curso (`methodsForCoin`). */
	methods?: SavedPaymentMethod[]
	onSelect: (method: SavedPaymentMethod) => void
	/** Con ella, el estado vacío enlaza a Ajustes → Métodos de pago. */
	onManage?: () => void
	theme: Theme
	textStyles: TextStyles
}

/**
 * El «librito»: los métodos de pago guardados del usuario para la moneda elegida
 * (retiro y creación de oferta P2P). Tocar uno vuelca sus detalles en el formulario.
 */
const SavedMethodsModal = ({ visible, onClose, loading, methods, onSelect, onManage, theme, textStyles }: SavedMethodsModalProps) => {

	const { t } = useTranslation()

	return (
		<Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
			<SafeAreaView style={[styles.modalContainer, { backgroundColor: theme.colors.background }]}>
				<View style={[styles.modalHeader, { borderBottomColor: theme.colors.elevation }]}>
					<Text style={textStyles.h4}>{t('ui.savedMethods.title')}</Text>
					<Pressable onPress={onClose} style={styles.closeButton}>
						<FontAwesome6 name="xmark" size={24} color={theme.colors.primaryText} iconStyle="solid" />
					</Pressable>
				</View>

				<ScrollView style={styles.coinList} contentContainerStyle={styles.coinListContent} showsVerticalScrollIndicator={true}>
					{loading ? (
						<View style={styles.loadingContainer}>
							<Text style={[textStyles.subtitle, { color: theme.colors.secondaryText }]}>{t('ui.savedMethods.loading')}</Text>
						</View>
					) : (methods || []).length > 0 ? (
						(methods || []).map((method) => {
							// `coin` puede venir como objeto o como tick suelto — solo el objeto tiene `name`
							const name = method?.name || (method?.coin as { name?: string } | undefined)?.name || t('ui.savedMethods.fallbackName')
							const methodDetails = normalizeMethodDetails(method?.details ?? method?.Details)
							return (
								<Pressable key={method.id || method.uuid || JSON.stringify(method)} style={[styles.coinItem, { backgroundColor: theme.colors.surface, borderColor: theme.colors.primary }]} onPress={() => onSelect(method)}>
									<View style={{ flex: 1 }}>
										<Text style={textStyles.h4}>{name}</Text>
										{methodDetails.length > 0 && (
											<View style={{ marginTop: 6, gap: 4 }}>
												{methodDetails.slice(0, 4).map((d) => (
													<View key={d.name} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
														<Text style={[textStyles.h6, { color: theme.colors.tertiaryText }]} numberOfLines={1}>{d.name}</Text>
														{isWalletFieldName(d.name)
															? <QPAddress address={d.value} visible={{ head: 8, tail: 8 }} style={[textStyles.h6, { color: theme.colors.primaryText, fontWeight: '600', marginLeft: 8 }]} numberOfLines={1} ellipsizeMode="middle" />
															: <Text style={[textStyles.h6, { color: theme.colors.primaryText, fontWeight: '600', marginLeft: 8 }]} numberOfLines={1} ellipsizeMode="middle">{d.value}</Text>}
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
							<Text style={[textStyles.subtitle, { color: theme.colors.secondaryText, textAlign: 'center' }]}>{t('ui.savedMethods.empty')}</Text>
							{onManage && (
								<Pressable onPress={onManage} hitSlop={8} accessibilityRole="button" testID="saved-methods-manage" style={{ marginTop: 12 }}>
									<Text style={[textStyles.h6, { color: theme.colors.primary, fontFamily: theme.typography.fontFamily.semiBold }]}>{t('ui.savedMethods.manage')}</Text>
								</Pressable>
							)}
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
