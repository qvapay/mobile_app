import { useMemo } from 'react'
import { StyleSheet, Text, View, Pressable, ScrollView } from 'react-native'

// Theme
import { useTheme } from '../../../theme/ThemeContext'
import { createTextStyles, createContainerStyles } from '../../../theme/themeUtils'

const fontSizeSteps = [
	{ key: 'extraSmall', label: 'XS' },
	{ key: 'small', label: 'S' },
	{ key: 'medium', label: 'M' },
	{ key: 'large', label: 'L' },
	{ key: 'extraLarge', label: 'XL' },
]

const fontSizeLabels = {
	extraSmall: 'Extra pequeño',
	small: 'Pequeño',
	medium: 'Mediano - Por defecto',
	large: 'Grande',
	extraLarge: 'Extra grande',
}

const FontSize = () => {

	const { theme, setFontSize, fontSizeKey } = useTheme()
	const textStyles = createTextStyles(theme)
	const containerStyles = createContainerStyles(theme)

	const selectedIndex = useMemo(
		() => fontSizeSteps.findIndex(s => s.key === fontSizeKey),
		[fontSizeKey],
	)

	// Percentage of the track that should be filled (0% at first dot, 100% at last)
	const fillPercent = (selectedIndex / (fontSizeSteps.length - 1)) * 100

	return (
		<ScrollView style={containerStyles.subContainer} showsVerticalScrollIndicator={false}>

			<View style={styles.header}>
				<Text style={textStyles.h1}>Tamaño de fuente</Text>
				<Text style={[textStyles.h3, { color: theme.colors.secondaryText }]}>Ajusta el tamaño del texto en toda la app</Text>
			</View>

			{/* Preview */}
			<Text style={[textStyles.h4, { color: theme.colors.secondaryText, marginBottom: 5, paddingHorizontal: 2 }]}>Vista previa</Text>
			<View style={[containerStyles.box, { padding: 16, marginBottom: 20, flexDirection: 'column', alignItems: 'flex-start' }]}>
				<Text style={[textStyles.h2, { color: theme.colors.primaryText, marginBottom: 6 }]}>
					Título de ejemplo
				</Text>
				<Text style={[textStyles.h4, { color: theme.colors.secondaryText, marginBottom: 10 }]}>
					Subtítulo de sección
				</Text>
				<Text style={[textStyles.body, { color: theme.colors.primaryText, lineHeight: theme.typography.fontSize.md * 1.5 }]}>
					Este es un párrafo de ejemplo para que puedas ver cómo se verá el texto en toda la aplicación con el tamaño seleccionado.
				</Text>
				<Text style={[textStyles.caption, { color: theme.colors.tertiaryText, marginTop: 8 }]}>
					Texto pequeño · Detalles adicionales
				</Text>
			</View>

			{/* Step selector */}
			<Text style={[textStyles.h4, { color: theme.colors.secondaryText, marginBottom: 5, paddingHorizontal: 2 }]}>Tamaño</Text>
			<View style={[containerStyles.box, { padding: 20, paddingBottom: 24, marginBottom: 12 }]}>
				<View style={styles.stepSelector}>
					<Text style={{ fontSize: theme.typography.fontSize.sm - 2, color: theme.colors.secondaryText, fontFamily: theme.typography.fontFamily.medium }}>Aa</Text>
					<View style={styles.stepTrack}>
						{/* Background track */}
						<View style={[styles.trackLine, { backgroundColor: theme.colors.border }]} />
						{/* Filled track up to selected dot */}
						<View style={[styles.trackLine, styles.trackLineFilled, { backgroundColor: theme.colors.primary, width: `${fillPercent}%` }]} />
						{/* Dots */}
						{fontSizeSteps.map((step, index) => {
							const isSelected = fontSizeKey === step.key
							const isPassed = index <= selectedIndex
							return (
								<Pressable key={step.key} onPress={() => setFontSize(step.key)} style={styles.stepHitArea} hitSlop={12} >
									<View style={[
										styles.stepDot,
										{ backgroundColor: isPassed ? theme.colors.primary : theme.colors.border },
										isSelected && [styles.stepDotSelected, {
											backgroundColor: theme.colors.primary,
											shadowColor: theme.colors.primary,
										}],
									]} />
								</Pressable>
							)
						})}
					</View>
					<Text style={{ fontSize: theme.typography.fontSize.xl + 2, color: theme.colors.secondaryText, fontFamily: theme.typography.fontFamily.medium }}>Aa</Text>
				</View>

				{/* Labels row below the track */}
				<View style={styles.labelsRow}>
					{fontSizeSteps.map((step, index) => {
						const isSelected = fontSizeKey === step.key
						return (
							<Pressable key={step.key} onPress={() => setFontSize(step.key)} style={styles.labelHitArea} >
								<Text style={[styles.stepLabel, { color: isSelected ? theme.colors.primary : theme.colors.tertiaryText, fontFamily: isSelected ? theme.typography.fontFamily.semiBold : theme.typography.fontFamily.regular, fontSize: theme.typography.fontSize.xs }]}>
									{step.label}
								</Text>
							</Pressable>
						)
					})}
				</View>
			</View>

			<Text style={[textStyles.caption, { color: theme.colors.primary, textAlign: 'center', marginBottom: 12 }]}>
				{fontSizeLabels[fontSizeKey]}
			</Text>

		</ScrollView>
	)
}

const styles = StyleSheet.create({
	header: {
		marginBottom: 24,
	},
	stepSelector: {
		flexDirection: 'row',
		alignItems: 'center',
		paddingHorizontal: 10,
		paddingTop: 15,
		gap: 14,
	},
	stepTrack: {
		flex: 1,
		flexDirection: 'row',
		alignItems: 'center',
		justifyContent: 'space-between',
		height: 28,
		position: 'relative',
	},
	trackLine: {
		position: 'absolute',
		left: 0,
		right: 0,
		height: 3,
		borderRadius: 1.5,
	},
	trackLineFilled: {
		right: undefined,
	},
	stepHitArea: {
		alignItems: 'center',
		justifyContent: 'center',
		zIndex: 1,
		width: 28,
		height: 28,
	},
	stepDot: {
		width: 14,
		height: 14,
		borderRadius: 7,
	},
	stepDotSelected: {
		width: 22,
		height: 22,
		borderRadius: 11,
		shadowOffset: { width: 0, height: 0 },
		shadowOpacity: 0.5,
		shadowRadius: 6,
		elevation: 4,
	},
	labelsRow: {
		flexDirection: 'row',
		justifyContent: 'space-between',
		marginTop: 6,
		paddingHorizontal: 0,
		// Offset to align with the track (accounting for the Aa labels)
		marginLeft: 28 + 14, // Aa text width + gap
		marginRight: 28 + 14,
	},
	labelHitArea: {
		alignItems: 'center',
		width: 28,
	},
	stepLabel: {
		textAlign: 'center',
	},
})

export default FontSize
