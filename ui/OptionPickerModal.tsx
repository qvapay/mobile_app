import { useCallback, useMemo, useState } from 'react'
import { Modal, StyleSheet, Text, View } from 'react-native'
import { FlashList } from '@shopify/flash-list'
import { useTranslation } from 'react-i18next'

// Theme
import { useTheme } from '../theme/ThemeContext'
import { useContainerStyles, useTextStyles } from '../theme/themeUtils'

// UI
import QPModalCard from './QPModalCard'
import QPInput from './particles/QPInput'
import QPPressable from './particles/QPPressable'

// Icons
import FontAwesome6 from '@react-native-vector-icons/fontawesome6'

/** Opción del selector: el código que viaja + la etiqueta visible. */
export type PickerOption = { value: string, label: string }

type Props = {
	visible: boolean
	title: string
	options: PickerOption[]
	selected?: string
	onSelect: (value: string) => void
	onClose: () => void
	/** Buscador encima de la lista (países, estados: listas largas). */
	searchable?: boolean
}

const optionKey = (o: PickerOption) => o.value

/**
 * Modal centrado de opciones (patrón de la casa: overlay + card, fade,
 * statusBarTranslucent, dismiss al tocar fuera) con búsqueda opcional. Lo usan el
 * país de constitución y los estados de EE. UU. del registro de empresa, y el estado
 * de la dirección de la ficha CIP en Datos personales.
 *
 * @param props.visible - Abierto.
 * @param props.title - Título del card.
 * @param props.options - Opciones (`value` + `label`); la búsqueda mira ambos.
 * @param [props.selected] - Valor marcado con un check.
 * @param props.onSelect - Recibe el `value` elegido (el llamador cierra).
 * @param props.onClose - Cierre por backdrop o botón atrás.
 * @param [props.searchable=false] - Buscador encima de la lista.
 */
const OptionPickerModal = ({ visible, title, options, selected, onSelect, onClose, searchable = false }: Props) => {

	const { t } = useTranslation()
	const { theme } = useTheme()
	const textStyles = useTextStyles(theme)
	const containerStyles = useContainerStyles(theme)
	const [search, setSearch] = useState('')
	const query = search.trim().toLowerCase()
	const filtered = useMemo(() => (query
		? options.filter((o: PickerOption) => o.label.toLowerCase().includes(query) || o.value.toLowerCase().includes(query))
		: options
	), [options, query])

	const close = () => { setSearch(''); onClose() }

	const renderItem = useCallback(({ item: option }: { item: PickerOption }) => (
		<QPPressable
			style={[styles.option, option.value === selected && { backgroundColor: theme.colors.primary + '1F' }]}
			onPress={() => { setSearch(''); onSelect(option.value) }}
			accessibilityRole="button"
			accessibilityState={{ selected: option.value === selected }}
		>
			<Text style={[textStyles.h4, { color: option.value === selected ? theme.colors.primary : theme.colors.primaryText, fontFamily: theme.typography.fontFamily.regular }]}>
				{option.label}
			</Text>
			{option.value === selected && <FontAwesome6 name="check" size={14} color={theme.colors.primary} iconStyle="solid" />}
		</QPPressable>
	), [selected, theme, textStyles, onSelect])

	return (
		<Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={close}>
			<QPPressable style={containerStyles.modalOverlay} onPress={close}>
				<QPModalCard style={styles.card}>
					<Text style={[textStyles.h3, { color: theme.colors.primaryText, marginBottom: 10 }]}>{title}</Text>
					{searchable && (
						<QPInput value={search} onChangeText={setSearch} placeholder={t('ui.optionPicker.searchPlaceholder')} prefixIconName="magnifying-glass" style={styles.search} />
					)}
					{/* Alto FIJO: FlashList no se mide por su contenido y sin alto no pinta filas (ver QPAssetSheet) */}
					<View style={styles.list}>
						<FlashList
							data={filtered}
							keyExtractor={optionKey}
							renderItem={renderItem}
							keyboardShouldPersistTaps="handled"
						/>
					</View>
				</QPModalCard>
			</QPPressable>
		</Modal>
	)
}

const styles = StyleSheet.create({
	card: { width: '100%' },
	search: { marginVertical: 0, marginBottom: 8 },
	list: { height: 380 },
	option: {
		flexDirection: 'row',
		alignItems: 'center',
		justifyContent: 'space-between',
		paddingHorizontal: 12,
		paddingVertical: 12,
		borderRadius: 10,
	},
})

export default OptionPickerModal
