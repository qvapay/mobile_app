import { useState, useEffect } from 'react'
import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native'

// Theme
import { useTheme } from '../../theme/ThemeContext'
import { createTextStyles } from '../../theme/themeUtils'

const QPProduct = ({ name = '', price = '', details = [], image = '', onPress = () => {}, style = {} }) => {

	// Contexts
	const { theme } = useTheme()
	const textStyles = createTextStyles(theme)

	return (
		<Pressable style={[styles.topupCard, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }, style]} onPress={onPress}>
			<View style={[styles.topupImagePlaceholder, { backgroundColor: theme.colors.elevationLight }]} />

			<View style={styles.topupHeaderRow}>
				<Text style={[textStyles.h6, styles.topupTitle]} numberOfLines={2}>{name}</Text>
				<Text style={[textStyles.h5, styles.topupPrice]}>{price != null ? `$${Number(price).toFixed(2)}` : ''}</Text>
			</View>

			<Text style={[textStyles.caption, { color: theme.colors.secondaryText, fontSize: 10 }]}>{Array.isArray(details) ? details.join(' • ') : ''}</Text>
		</Pressable>
	)
}

const styles = StyleSheet.create({
	topupCard: {
		width: 168,
		borderRadius: 12,
		padding: 8,
		marginRight: 12,
		borderWidth: 0.5,
	},
	topupTitle: {
		flex: 1,
		marginRight: 8,
	},
	topupImagePlaceholder: {
		height: 80,
		borderRadius: 8,
		marginBottom: 10
	},
	topupHeaderRow: {
		flexDirection: 'row',
		alignItems: 'center',
		justifyContent: 'space-between',
		marginBottom: 4,
	},
	topupPrice: {
		textAlign: 'right',
	},
})

export default QPProduct