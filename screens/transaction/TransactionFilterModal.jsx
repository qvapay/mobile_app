import { View, Text, Modal, Pressable, ScrollView, StyleSheet } from 'react-native'

import QPInput from '../../ui/particles/QPInput'
import FontAwesome6 from '@react-native-vector-icons/fontawesome6'

// Status options for filter chips
const STATUS_OPTIONS = [
	{ label: 'Pagadas', value: 'paid' },
	{ label: 'Pendientes', value: 'pending' },
	{ label: 'Procesando', value: 'processing' },
	{ label: 'Canceladas', value: 'cancelled' },
]

// Period preset helpers
const getStartOfDay = () => {
	const d = new Date()
	d.setHours(0, 0, 0, 0)
	return d.toISOString()
}

const getStartOfWeek = () => {
	const d = new Date()
	d.setDate(d.getDate() - d.getDay() + 1) // Monday
	d.setHours(0, 0, 0, 0)
	return d.toISOString()
}

const getStartOfMonth = () => {
	const d = new Date()
	d.setDate(1)
	d.setHours(0, 0, 0, 0)
	return d.toISOString()
}

const getStartOfLastMonth = () => {
	const d = new Date()
	d.setMonth(d.getMonth() - 1)
	d.setDate(1)
	d.setHours(0, 0, 0, 0)
	return d.toISOString()
}

const getEndOfLastMonth = () => {
	const d = new Date()
	d.setDate(0) // last day of previous month
	d.setHours(23, 59, 59, 999)
	return d.toISOString()
}

const PERIOD_OPTIONS = [
	{ label: 'Hoy', getRange: () => ({ date_from: getStartOfDay(), date_to: new Date().toISOString() }) },
	{ label: 'Esta semana', getRange: () => ({ date_from: getStartOfWeek(), date_to: new Date().toISOString() }) },
	{ label: 'Este mes', getRange: () => ({ date_from: getStartOfMonth(), date_to: new Date().toISOString() }) },
	{ label: 'Último mes', getRange: () => ({ date_from: getStartOfLastMonth(), date_to: getEndOfLastMonth() }) },
]

const SORT_FIELD_OPTIONS = [
	{ label: 'Fecha', value: 'created_at' },
	{ label: 'Monto', value: 'amount' },
]

const SORT_DIR_OPTIONS = [
	{ label: 'Recientes', value: 'desc' },
	{ label: 'Antiguos', value: 'asc' },
]

// Chip component
const Chip = ({ label, selected, onPress, theme }) => (
	<Pressable onPress={onPress} style={[styles.chip, selected ? { backgroundColor: theme.colors.primary } : { backgroundColor: 'transparent', borderWidth: 1, borderColor: theme.colors.border }]}>
		<Text style={[styles.chipText, { color: selected ? '#FFFFFF' : theme.colors.secondaryText, fontSize: theme.typography.fontSize.sm, fontFamily: theme.typography.fontFamily.medium }]}>
			{label}
		</Text>
	</Pressable>
)

// Transaction filter modal — fully controlled by the parent's draft state.
const TransactionFilterModal = ({ visible, draftFilters, draftPeriod, onUpdateDraft, onSetPeriod, onClearPeriod, onClear, onApply, onClose, theme, textStyles, windowHeight }) => (
	<Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={onClose}>
		<Pressable style={styles.overlay} onPress={onClose}>
			<Pressable style={[styles.modalCard, { backgroundColor: theme.colors.surface, maxHeight: windowHeight * 0.75 }]} onPress={() => { }}>

				{/* Header */}
				<View style={styles.modalHeader}>
					<FontAwesome6 name="filter" size={20} color={theme.colors.primary} iconStyle="solid" />
					<Text style={[textStyles.h3, { flex: 1, marginLeft: 12 }]}>Filtrar</Text>
					<Pressable onPress={onClose} hitSlop={12}>
						<FontAwesome6 name="xmark" size={20} color={theme.colors.primaryText} iconStyle="solid" />
					</Pressable>
				</View>

				<ScrollView showsVerticalScrollIndicator={false} bounces={false}>

					{/* Status */}
					<Text style={[textStyles.h6, styles.sectionLabel]}>Estado</Text>
					<View style={styles.chipRow}>
						{STATUS_OPTIONS.map(opt => (
							<Chip
								key={opt.value}
								label={opt.label}
								selected={draftFilters.status === opt.value}
								onPress={() => onUpdateDraft('status', draftFilters.status === opt.value ? undefined : opt.value)}
								theme={theme}
							/>
						))}
					</View>

					{/* Search */}
					<Text style={[textStyles.h6, styles.sectionLabel]}>Buscar</Text>
					<QPInput
						placeholder="Descripción o UUID"
						value={draftFilters.search || ''}
						onChangeText={v => onUpdateDraft('search', v)}
						autoCapitalize="none"
						autoCorrect={false}
						prefixIconName="magnifying-glass"
						style={{ marginVertical: 0 }}
					/>

					{/* Period */}
					<Text style={[textStyles.h6, styles.sectionLabel]}>Período</Text>
					<View style={styles.chipRow}>
						{PERIOD_OPTIONS.map((opt, idx) => (
							<Chip
								key={opt.label}
								label={opt.label}
								selected={draftPeriod === idx}
								onPress={() => {
									if (draftPeriod === idx) { onClearPeriod() }
									else { onSetPeriod(idx, opt.getRange()) }
								}}
								theme={theme}
							/>
						))}
					</View>

					{/* Amount Range */}
					<Text style={[textStyles.h6, styles.sectionLabel]}>Monto</Text>
					<View style={styles.amountRow}>
						<View style={{ flex: 1 }}>
							<QPInput
								placeholder="Mínimo"
								value={draftFilters.min_amount || ''}
								onChangeText={v => onUpdateDraft('min_amount', v.replace(/[^0-9.]/g, ''))}
								keyboardType="decimal-pad"
								style={{ marginVertical: 0 }}
							/>
						</View>
						<Text style={[textStyles.caption, { marginHorizontal: 8 }]}>—</Text>
						<View style={{ flex: 1 }}>
							<QPInput
								placeholder="Máximo"
								value={draftFilters.max_amount || ''}
								onChangeText={v => onUpdateDraft('max_amount', v.replace(/[^0-9.]/g, ''))}
								keyboardType="decimal-pad"
								style={{ marginVertical: 0 }}
							/>
						</View>
					</View>

					{/* Sort */}
					<Text style={[textStyles.h6, styles.sectionLabel]}>Ordenar por</Text>
					<View style={styles.chipRow}>
						{SORT_FIELD_OPTIONS.map(opt => (
							<Chip
								key={opt.value}
								label={opt.label}
								selected={draftFilters.orderBy === opt.value}
								onPress={() => onUpdateDraft('orderBy', draftFilters.orderBy === opt.value ? undefined : opt.value)}
								theme={theme}
							/>
						))}
					</View>

					<Text style={[textStyles.h6, styles.sectionLabel]}>Dirección</Text>
					<View style={styles.chipRow}>
						{SORT_DIR_OPTIONS.map(opt => (
							<Chip
								key={opt.value}
								label={opt.label}
								selected={draftFilters.order === opt.value}
								onPress={() => onUpdateDraft('order', draftFilters.order === opt.value ? undefined : opt.value)}
								theme={theme}
							/>
						))}
					</View>

				</ScrollView>

				{/* Action buttons */}
				<View style={styles.actions}>
					<Pressable onPress={onClear} style={[styles.actionButton, { backgroundColor: theme.colors.elevation }]} >
						<Text style={[styles.actionText, { color: theme.colors.primaryText, fontSize: theme.typography.fontSize.md, fontFamily: theme.typography.fontFamily.semiBold }]}>Limpiar</Text>
					</Pressable>
					<Pressable onPress={onApply} style={[styles.actionButton, { backgroundColor: theme.colors.primary, flex: 1 }]} >
						<Text style={[styles.actionText, { color: '#FFFFFF', fontSize: theme.typography.fontSize.md, fontFamily: theme.typography.fontFamily.semiBold }]}>Aplicar</Text>
					</Pressable>
				</View>

			</Pressable>
		</Pressable>
	</Modal>
)

const styles = StyleSheet.create({
	overlay: {
		flex: 1,
		backgroundColor: 'rgba(0,0,0,0.6)',
		justifyContent: 'center',
		alignItems: 'center',
		padding: 24,
	},
	modalCard: {
		width: '100%',
		borderRadius: 16,
		padding: 24,
	},
	modalHeader: {
		flexDirection: 'row',
		alignItems: 'center',
		marginBottom: 8,
	},
	sectionLabel: {
		marginTop: 16,
		marginBottom: 8,
	},
	chipRow: {
		flexDirection: 'row',
		flexWrap: 'wrap',
		gap: 8,
	},
	chip: {
		paddingHorizontal: 16,
		paddingVertical: 10,
		borderRadius: 20,
	},
	chipText: {
	},
	amountRow: {
		flexDirection: 'row',
		alignItems: 'center',
	},
	actions: {
		flexDirection: 'row',
		gap: 12,
		marginTop: 16,
	},
	actionButton: {
		paddingVertical: 14,
		paddingHorizontal: 24,
		borderRadius: 25,
		alignItems: 'center',
		justifyContent: 'center',
	},
	actionText: {
	},
})

export default TransactionFilterModal
