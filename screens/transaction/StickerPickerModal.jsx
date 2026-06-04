import { View, Text, Modal, TouchableOpacity, Pressable, ScrollView, StyleSheet } from 'react-native'

import { useTheme } from '../../theme/ThemeContext'
import { createTextStyles } from '../../theme/themeUtils'
import FontAwesome6 from '@react-native-vector-icons/fontawesome6'
import TransactionSticker from '../../ui/particles/TransactionSticker'

// Stickers
import { QVAPAY_STICKERS } from '../../helpers/stickers'

// Sticker grid picker (GOLD-gated). Calls onSelect(stickerName) on tap.
const StickerPickerModal = ({ visible, onClose, onSelect, isGold }) => {

	const { theme } = useTheme()
	const textStyles = createTextStyles(theme)

	return (
		<Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={onClose}>
			<Pressable style={styles.overlay} onPress={onClose}>
				<Pressable style={[styles.card, { backgroundColor: theme.colors.surface }, theme.mode === 'light' && { borderWidth: 0.5, borderColor: theme.colors.border }]} onPress={() => { }}>
					<View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
						<Text style={[textStyles.h4, { color: theme.colors.primaryText }]}>Stickers</Text>
						<TouchableOpacity onPress={onClose} style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: theme.colors.elevation, justifyContent: 'center', alignItems: 'center' }}>
							<FontAwesome6 name="xmark" size={16} color={theme.colors.primaryText} iconStyle="solid" />
						</TouchableOpacity>
					</View>

					<View>
						<ScrollView showsVerticalScrollIndicator={false} bounces={false} style={{ maxHeight: 360 }}>
							<View style={styles.grid}>
								{QVAPAY_STICKERS.map((sticker) => (
									<TouchableOpacity
										key={sticker}
										disabled={!isGold}
										onPress={() => onSelect(sticker)}
										style={[styles.gridItem, { backgroundColor: theme.colors.surface }]}
										accessibilityLabel={sticker.replace('.webm', '')}
									>
										<TransactionSticker name={sticker} size={52} />
									</TouchableOpacity>
								))}
							</View>
						</ScrollView>

						{!isGold && (
							<View style={[styles.lockOverlay, { backgroundColor: 'rgba(0,0,0,0.85)' }]}>
								<FontAwesome6 name="crown" size={28} color={theme.colors.gold} iconStyle="solid" />
								<Text style={[textStyles.h5, { color: theme.colors.almostWhite, marginTop: 12, textAlign: 'center' }]}>GOLD requerido</Text>
								<Text style={[textStyles.h6, { color: theme.colors.almostWhite, opacity: 0.8, marginTop: 4, textAlign: 'center' }]}>Necesitas ser usuario GOLD para enviar stickers</Text>
							</View>
						)}
					</View>
				</Pressable>
			</Pressable>
		</Modal>
	)
}

const styles = StyleSheet.create({
	overlay: {
		flex: 1,
		backgroundColor: 'rgba(0,0,0,0.6)',
		justifyContent: 'center',
		alignItems: 'center',
		padding: 24,
	},
	card: {
		width: '100%',
		borderRadius: 16,
		padding: 16,
	},
	grid: {
		flexDirection: 'row',
		flexWrap: 'wrap',
		gap: 8,
		justifyContent: 'flex-start',
	},
	gridItem: {
		width: '18%',
		aspectRatio: 1,
		alignItems: 'center',
		justifyContent: 'center',
		borderRadius: 12,
	},
	lockOverlay: {
		...StyleSheet.absoluteFillObject,
		borderRadius: 12,
		justifyContent: 'center',
		alignItems: 'center',
		padding: 24,
	},
})

export default StickerPickerModal
