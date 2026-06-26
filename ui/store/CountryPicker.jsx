import { useMemo, useState, useCallback } from 'react'
import {
	View, Text, StyleSheet, Pressable, Modal, TextInput, ScrollView, useWindowDimensions,
} from 'react-native'
import FontAwesome6 from '@react-native-vector-icons/fontawesome6'

import { useTheme } from '../../theme/ThemeContext'
import { createTextStyles } from '../../theme/themeUtils'

// Stable no-op default so `onChange` doesn't change identity every render.
const noop = () => {}

// Trigger button + modal list. `countries` is the response from /api/store/*-catalog?countries.
const CountryPicker = ({ countries = [], value = null, onChange = noop, placeholder = 'Seleccionar país' }) => {

	const { theme } = useTheme()
	const textStyles = createTextStyles(theme)
	const { height: windowHeight } = useWindowDimensions()
	const [open, setOpen] = useState(false)
	const [query, setQuery] = useState('')

	const filtered = useMemo(() => {
		const q = query.trim().toLowerCase()
		if (!q) return countries
		return countries.filter(c =>
			(c.name || '').toLowerCase().includes(q) || (c.code || '').toLowerCase().startsWith(q),
		)
	}, [countries, query])

	const handleSelect = useCallback((country) => {
		onChange(country)
		setOpen(false)
		setQuery('')
	}, [onChange])

	const renderRow = (item) => {
		const selected = item.code === value?.code
		return (
			<Pressable
				key={item.code}
				onPress={() => handleSelect(item)}
				style={[
					styles.row,
					{ backgroundColor: selected ? theme.colors.primary + '15' : 'transparent' },
				]}
			>
				<Text style={{ fontSize: 22 }}>{item.flag}</Text>
				<View style={{ flex: 1, marginLeft: 12 }}>
					<Text style={[textStyles.h6, { color: theme.colors.primaryText, fontWeight: '600' }]}>
						{item.name}
					</Text>
					{item.offer_count != null && (
						<Text style={[textStyles.caption, { color: theme.colors.tertiaryText }]}>
							{item.offer_count} {item.offer_count === 1 ? 'opción' : 'opciones'}
						</Text>
					)}
				</View>
				{selected && (
					<FontAwesome6 name="check" size={14} color={theme.colors.primary} iconStyle="solid" />
				)}
			</Pressable>
		)
	}

	return (
		<>
			<Pressable
				onPress={() => setOpen(true)}
				style={[
					styles.trigger,
					{ backgroundColor: theme.colors.surface },
					theme.mode === 'light' && { borderWidth: 0.5, borderColor: theme.colors.border },
				]}
			>
				{value ? (
					<>
						<Text style={{ fontSize: 20, marginRight: 10 }}>{value.flag}</Text>
						<View style={{ flex: 1 }}>
							<Text style={[textStyles.h6, { color: theme.colors.primaryText, fontWeight: '600' }]} numberOfLines={1}>
								{value.name}
							</Text>
						</View>
					</>
				) : (
					<Text style={[textStyles.h6, { color: theme.colors.placeholder, flex: 1 }]}>{placeholder}</Text>
				)}
				<FontAwesome6 name="chevron-down" size={12} color={theme.colors.tertiaryText} iconStyle="solid" />
			</Pressable>

			<Modal
				visible={open}
				transparent
				animationType="fade"
				statusBarTranslucent
				onRequestClose={() => setOpen(false)}
			>
				<Pressable style={styles.overlay} onPress={() => setOpen(false)}>
					<Pressable
						style={[
							styles.modalCard,
							{ backgroundColor: theme.colors.surface, maxHeight: windowHeight * 0.75 },
						]}
						onPress={(e) => e.stopPropagation()}
					>
						<View style={[styles.header, theme.mode === 'light' && { borderBottomWidth: 0.5, borderBottomColor: theme.colors.border }]}>
							<Text style={[textStyles.h4, { color: theme.colors.primaryText, fontWeight: '600' }]}>
								Selecciona país
							</Text>
							<Pressable onPress={() => setOpen(false)} hitSlop={8}>
								<FontAwesome6 name="xmark" size={18} color={theme.colors.tertiaryText} iconStyle="solid" />
							</Pressable>
						</View>

						<View style={[styles.searchBox, { backgroundColor: theme.colors.background }]}>
							<FontAwesome6 name="magnifying-glass" size={14} color={theme.colors.tertiaryText} iconStyle="solid" />
							<TextInput
								value={query}
								onChangeText={setQuery}
								placeholder="Buscar país…"
								placeholderTextColor={theme.colors.placeholder}
								style={[styles.searchInput, { color: theme.colors.primaryText }]}
								autoCorrect={false}
								autoCapitalize="none"
							/>
						</View>

						<ScrollView
							style={{ maxHeight: windowHeight * 0.55 }}
							contentContainerStyle={{ paddingBottom: 12 }}
							keyboardShouldPersistTaps="handled"
						>
							{filtered.length === 0 ? (
								<Text style={[textStyles.caption, { textAlign: 'center', padding: 24, color: theme.colors.tertiaryText }]}>
									Sin resultados
								</Text>
							) : (
								filtered.map(renderRow)
							)}
						</ScrollView>
					</Pressable>
				</Pressable>
			</Modal>
		</>
	)
}

const styles = StyleSheet.create({
	trigger: {
		flexDirection: 'row',
		alignItems: 'center',
		paddingHorizontal: 12,
		paddingVertical: 12,
		borderRadius: 12,
	},
	overlay: {
		flex: 1,
		backgroundColor: 'rgba(0,0,0,0.5)',
		justifyContent: 'center',
		alignItems: 'center',
		padding: 20,
	},
	modalCard: {
		width: '100%',
		maxWidth: 480,
		borderRadius: 18,
		overflow: 'hidden',
	},
	header: {
		flexDirection: 'row',
		alignItems: 'center',
		justifyContent: 'space-between',
		paddingHorizontal: 18,
		paddingVertical: 14,
	},
	searchBox: {
		flexDirection: 'row',
		alignItems: 'center',
		marginHorizontal: 14,
		marginTop: 12,
		marginBottom: 8,
		paddingHorizontal: 12,
		paddingVertical: 8,
		borderRadius: 10,
		gap: 8,
	},
	searchInput: {
		flex: 1,
		fontSize: 15,
		paddingVertical: 4,
	},
	row: {
		flexDirection: 'row',
		alignItems: 'center',
		paddingHorizontal: 18,
		paddingVertical: 12,
	},
})

export default CountryPicker
