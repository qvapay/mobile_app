import { View, Text, Modal, Pressable, ScrollView, StyleSheet } from 'react-native'
import { useTranslation } from 'react-i18next'

import QPInput from '../../ui/particles/QPInput'
import QPSplitButton from '../../ui/particles/QPSplitButton'
import { createContainerStyles } from '../../theme/themeUtils'
import FontAwesome6 from '@react-native-vector-icons/fontawesome6'

// Status options for filter chips — i18n keys resolved in render (module
// constants would freeze the boot language)
const STATUS_OPTIONS = [
	{ labelKey: 'transactions.filters.statusOptions.paid', value: 'paid' },
	{ labelKey: 'transactions.filters.statusOptions.pending', value: 'pending' },
	{ labelKey: 'transactions.filters.statusOptions.processing', value: 'processing' },
	{ labelKey: 'transactions.filters.statusOptions.cancelled', value: 'cancelled' },
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
	{ labelKey: 'common.dates.today', getRange: () => ({ date_from: getStartOfDay(), date_to: new Date().toISOString() }) },
	{ labelKey: 'transactions.filters.periods.thisWeek', getRange: () => ({ date_from: getStartOfWeek(), date_to: new Date().toISOString() }) },
	{ labelKey: 'transactions.filters.periods.thisMonth', getRange: () => ({ date_from: getStartOfMonth(), date_to: new Date().toISOString() }) },
	{ labelKey: 'transactions.filters.periods.lastMonth', getRange: () => ({ date_from: getStartOfLastMonth(), date_to: getEndOfLastMonth() }) },
]

const SORT_FIELD_OPTIONS = [
	{ labelKey: 'transactions.filters.sortField.date', value: 'created_at' },
	{ labelKey: 'transactions.filters.sortField.amount', value: 'amount' },
]

const SORT_DIR_OPTIONS = [
	{ labelKey: 'transactions.filters.sortDir.desc', value: 'desc' },
	{ labelKey: 'transactions.filters.sortDir.asc', value: 'asc' },
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
const TransactionFilterModal = ({ visible, draftFilters, draftPeriod, onUpdateDraft, onSetPeriod, onClearPeriod, onClear, onApply, onClose, theme, textStyles, windowHeight }) => {

	const { t } = useTranslation()
	const containerStyles = createContainerStyles(theme)

	// "Limpiar" solo existe cuando hay algo que limpiar — el slot se abre y
	// cierra animado (mismo split-button del onboarding/registro).
	// Al deseleccionar, onUpdateDraft escribe `undefined`, así que no basta con
	// contar claves: hay que mirar los valores
	const hasActiveFilters = !!draftPeriod ||
		Object.values(draftFilters || {}).some((v) => v !== undefined && v !== null && v !== '')

	return (
	<Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={onClose}>
		<Pressable style={containerStyles.modalOverlay} onPress={onClose}>
			<Pressable style={[containerStyles.modalCard, { maxHeight: windowHeight * 0.75 }]} onPress={() => { }}>

				{/* Header */}
				<View style={styles.modalHeader}>
					<FontAwesome6 name="filter" size={20} color={theme.colors.primary} iconStyle="solid" />
					<Text style={[textStyles.h3, { flex: 1, marginLeft: 12 }]}>{t('transactions.filters.title')}</Text>
					<Pressable onPress={onClose} hitSlop={12}>
						<FontAwesome6 name="xmark" size={20} color={theme.colors.primaryText} iconStyle="solid" />
					</Pressable>
				</View>

				<ScrollView showsVerticalScrollIndicator={false} bounces={false}>

					{/* Status */}
					<Text style={[textStyles.h6, styles.sectionLabel]}>{t('transactions.filters.sectionStatus')}</Text>
					<View style={styles.chipRow}>
						{STATUS_OPTIONS.map(opt => (
							<Chip
								key={opt.value}
								label={t(opt.labelKey)}
								selected={draftFilters.status === opt.value}
								onPress={() => onUpdateDraft('status', draftFilters.status === opt.value ? undefined : opt.value)}
								theme={theme}
							/>
						))}
					</View>

					{/* Search */}
					<Text style={[textStyles.h6, styles.sectionLabel]}>{t('common.actions.search')}</Text>
					<QPInput
						placeholder={t('transactions.filters.searchPlaceholder')}
						value={draftFilters.search || ''}
						onChangeText={v => onUpdateDraft('search', v)}
						autoCapitalize="none"
						autoCorrect={false}
						prefixIconName="magnifying-glass"
						style={{ marginVertical: 0 }}
					/>

					{/* Period */}
					<Text style={[textStyles.h6, styles.sectionLabel]}>{t('transactions.filters.sectionPeriod')}</Text>
					<View style={styles.chipRow}>
						{PERIOD_OPTIONS.map((opt, idx) => (
							<Chip
								key={opt.labelKey}
								label={t(opt.labelKey)}
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
					<Text style={[textStyles.h6, styles.sectionLabel]}>{t('transactions.filters.sectionAmount')}</Text>
					<View style={styles.amountRow}>
						<View style={{ flex: 1 }}>
							<QPInput
								placeholder={t('transactions.filters.min')}
								value={draftFilters.min_amount || ''}
								onChangeText={v => onUpdateDraft('min_amount', v.replace(/[^0-9.]/g, ''))}
								keyboardType="decimal-pad"
								style={{ marginVertical: 0 }}
							/>
						</View>
						<Text style={[textStyles.caption, { marginHorizontal: 8 }]}>—</Text>
						<View style={{ flex: 1 }}>
							<QPInput
								placeholder={t('transactions.filters.max')}
								value={draftFilters.max_amount || ''}
								onChangeText={v => onUpdateDraft('max_amount', v.replace(/[^0-9.]/g, ''))}
								keyboardType="decimal-pad"
								style={{ marginVertical: 0 }}
							/>
						</View>
					</View>

					{/* Sort */}
					<Text style={[textStyles.h6, styles.sectionLabel]}>{t('transactions.filters.sectionSortBy')}</Text>
					<View style={styles.chipRow}>
						{SORT_FIELD_OPTIONS.map(opt => (
							<Chip
								key={opt.value}
								label={t(opt.labelKey)}
								selected={draftFilters.orderBy === opt.value}
								onPress={() => onUpdateDraft('orderBy', draftFilters.orderBy === opt.value ? undefined : opt.value)}
								theme={theme}
							/>
						))}
					</View>

					<Text style={[textStyles.h6, styles.sectionLabel]}>{t('transactions.filters.sectionSortDir')}</Text>
					<View style={styles.chipRow}>
						{SORT_DIR_OPTIONS.map(opt => (
							<Chip
								key={opt.value}
								label={t(opt.labelKey)}
								selected={draftFilters.order === opt.value}
								onPress={() => onUpdateDraft('order', draftFilters.order === opt.value ? undefined : opt.value)}
								theme={theme}
							/>
						))}
					</View>

				</ScrollView>

				{/* Action buttons — "Limpiar" aparece animado con el primer filtro */}
				<View style={styles.actions}>
					<QPSplitButton
						title={t('transactions.filters.apply')}
						onPress={onApply}
						showBack={hasActiveFilters}
						onBack={onClear}
						backLabel={t('transactions.filters.clear')}
						backRatio={0.5}
						backColor={theme.colors.elevation}
						backTextColor={theme.colors.primaryText}
					/>
				</View>

			</Pressable>
		</Pressable>
	</Modal>
	)
}

const styles = StyleSheet.create({
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
		marginTop: 16,
	},
})

export default TransactionFilterModal
