import { StyleSheet, Text, View, Pressable, ScrollView } from 'react-native'

// Theme
import { useTheme, fontScaleMap } from '../../../theme/ThemeContext'
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
			<View style={[containerStyles.box, { padding: 16, paddingBottom: 20, marginBottom: 12 }]}>
				<View style={styles.stepSelector}>
					<Text style={{ fontSize: theme.typography.fontSize.sm, color: theme.colors.secondaryText, fontFamily: theme.typography.fontFamily.medium }}>Aa</Text>
					<View style={styles.stepTrack}>
						<View style={[styles.stepLine, { backgroundColor: theme.colors.border }]} />
						{fontSizeSteps.map((step) => {
							const isSelected = fontSizeKey === step.key
							return (
								<Pressable
									key={step.key}
									onPress={() => setFontSize(step.key)}
									style={styles.stepHitArea}
									hitSlop={8}
								>
									<View style={[
										styles.stepDot,
										{ backgroundColor: isSelected ? theme.colors.primary : theme.colors.border },
										isSelected && styles.stepDotSelected,
									]} />
									<Text style={[
										styles.stepLabel,
										{ color: isSelected ? theme.colors.primary : theme.colors.tertiaryText },
										isSelected && { fontFamily: theme.typography.fontFamily.semiBold },
									]}>
										{step.label}
									</Text>
								</Pressable>
							)
						})}
					</View>
					<Text style={{ fontSize: theme.typography.fontSize.xl, color: theme.colors.secondaryText, fontFamily: theme.typography.fontFamily.medium }}>Aa</Text>
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
		gap: 12,
	},
	stepTrack: {
		flex: 1,
		flexDirection: 'row',
		alignItems: 'center',
		justifyContent: 'space-between',
		height: 40,
		position: 'relative',
	},
	stepLine: {
		position: 'absolute',
		left: 10,
		right: 10,
		height: 2,
		top: 12,
		borderRadius: 1,
	},
	stepHitArea: {
		alignItems: 'center',
		zIndex: 1,
	},
	stepDot: {
		width: 12,
		height: 12,
		borderRadius: 6,
	},
	stepDotSelected: {
		width: 16,
		height: 16,
		borderRadius: 8,
	},
	stepLabel: {
		
		
		marginTop: 4,
	},
})

export default FontSize
