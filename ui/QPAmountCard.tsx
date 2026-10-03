import { forwardRef } from 'react'
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native'

// Theme
import { useTheme } from '../theme/ThemeContext'
import { useTextStyles } from '../theme/themeUtils'

// UI
import QPFitText from './particles/QPFitText'
import QPAssetPill from './particles/QPAssetPill'
import type { QPAssetIconKind } from './particles/QPAssetBadge'

export type QPAmountChip = { key: string, label: string, onPress: () => void }

type Props = {
	/** "Pagas" / "Recibes". */
	label: string
	/** Texto a la derecha de la etiqueta cuando no hay chips ("A tu wallet · Stacks"). */
	hint?: string
	token: { symbol: string, icon: QPAssetIconKind, onPress?: () => void }
	/** Editable (lado que paga) o calculado (lado que recibe). */
	amount: string
	onChangeAmount?: (text: string) => void
	placeholder?: string
	fiatLabel: string
	balanceLabel: string
	chips?: QPAmountChip[]
	/** Calculando: el importe se atenúa. El giro lo pone el botón de en medio. */
	loading?: boolean
	disabled?: boolean
	accessibilityLabel?: string
}

/**
 * Tarjeta de un lado de una conversión (patrón Uniswap/Jupiter): etiqueta y chips arriba,
 * importe grande a la izquierda con la píldora del activo a la derecha, equivalente en USD
 * y saldo abajo. El lado que recibe no es editable: su importe sale del modelo.
 *
 * Nació en el swap de la wallet y vive en `ui/` porque la comparten también el retiro y lo
 * que venga: una conversión se lee igual la haga quien la haga.
 *
 * Abajo a la derecha va SOLO el saldo, sin nombrar el activo: ya está en la píldora de al
 * lado, y la red en el badge de su icono.
 */
const QPAmountCard = forwardRef<TextInput, Props>(({ label, hint, token, amount, onChangeAmount, placeholder = '0', fiatLabel, balanceLabel, chips, loading, disabled, accessibilityLabel }, ref) => {

	const { theme } = useTheme()
	const textStyles = useTextStyles(theme)
	const editable = !!onChangeAmount
	const amountStyle = { color: amount ? theme.colors.primaryText : theme.colors.placeholder, fontFamily: theme.typography.fontFamily.semiBold, fontSize: 34 }



	return (
		<View style={[styles.card, { backgroundColor: theme.colors.surface }, !theme.isDark && { borderWidth: StyleSheet.hairlineWidth, borderColor: theme.colors.border }]}>
			<View style={styles.top}>
				<Text style={[textStyles.h5, { color: theme.colors.secondaryText }]}>{label}</Text>
				{chips?.length ? (
					<View style={styles.chips}>
						{chips.map(chip => (
							<Pressable key={chip.key} onPress={chip.onPress} disabled={disabled} hitSlop={6} style={[styles.chip, { backgroundColor: theme.colors.primary + '18' }]} accessibilityRole="button">
								<Text style={{ color: theme.colors.primary, fontFamily: theme.typography.fontFamily.semiBold, fontSize: theme.typography.fontSize.xs }}>{chip.label}</Text>
							</Pressable>
						))}
					</View>
				) : !!hint && <Text style={[textStyles.h6, { color: theme.colors.tertiaryText }]} numberOfLines={1}>{hint}</Text>}
			</View>

			<View style={styles.middle}>
				{editable ? (
					<View style={styles.input}>
						{/* Placeholder PROPIO, no el nativo: iOS pinta `attributedPlaceholder` en su
						    propio rectángulo de UIKit y a 34 pt lo recorta por arriba. Un Text detrás
						    del input vacío se ve igual en las dos plataformas */}
						{!amount && <Text style={[styles.placeholder, amountStyle]} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no">{placeholder}</Text>}
						<TextInput
							ref={ref}
							style={[styles.inputBox, amountStyle]}
							value={amount}
							onChangeText={onChangeAmount}
							keyboardType="decimal-pad"
							editable={!disabled}
							maxLength={12}
							accessibilityLabel={accessibilityLabel ?? label}
						/>
					</View>
				) : (
					<View style={styles.input}>
						{/* Atenuado, no vaciado: al cambiar de par sigue habiendo un número en
						    pantalla y el giro del botón dice que ya no es el bueno */}
						<QPFitText style={[amountStyle, loading && styles.stale]}>{amount || placeholder}</QPFitText>
					</View>
				)}
				<QPAssetPill icon={token.icon} symbol={token.symbol} onPress={token.onPress} />
			</View>

			<View style={styles.bottom}>
				<Text style={[textStyles.h6, { color: theme.colors.tertiaryText }]}>{fiatLabel}</Text>
				<Text style={[textStyles.h6, styles.balance, { color: theme.colors.secondaryText }]} numberOfLines={1}>{balanceLabel}</Text>
			</View>
		</View>
	)
})

const styles = StyleSheet.create({
	card: { borderRadius: 20, borderCurve: 'continuous', paddingHorizontal: 16, paddingTop: 14, paddingBottom: 12, gap: 6 },
	top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 24 },
	chips: { flexDirection: 'row', gap: 6 },
	chip: { paddingHorizontal: 9, paddingVertical: 4, borderRadius: 8 },
	middle: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 52 },
	input: { flex: 1, paddingVertical: 0, justifyContent: 'center' },
	// Altura explícita: sin placeholder nativo, el TextInput vacío no tendría tamaño intrínseco
	inputBox: { height: 52, paddingVertical: 0 },
	placeholder: { position: 'absolute', left: 0, right: 0 },
	stale: { opacity: 0.35 },
	bottom: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
	balance: { flexShrink: 1, textAlign: 'right' },
})

export default QPAmountCard
