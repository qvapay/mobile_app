import { View, Text, Modal, Pressable, TextInput, useWindowDimensions } from 'react-native'
import { useTranslation } from 'react-i18next'
import FontAwesome6 from '@react-native-vector-icons/fontawesome6'

import { useTheme } from '../../theme/ThemeContext'
import { useContainerStyles, useTextStyles } from '../../theme/themeUtils'
import QPButton from '../../ui/particles/QPButton'
import { formatMoney } from '../../helpers'
import { sanitizeAmountInput, parseAmountInput } from '../../helpers/amountInput'
import { useKeyboardHeight } from '../../hooks/useKeyboardHeight'

/** Operación abierta en el modal (null = cerrado). */
export type SavingsOperation = 'deposit' | 'withdraw' | null

type Props = {
	operation: SavingsOperation
	amount: string
	loading: boolean
	/** Lo disponible para ESTA operación: saldo de la cuenta al depositar, lo ahorrado al retirar. */
	available: number
	onChangeAmount: (amount: string) => void
	onClose: () => void
	onSubmit: () => void
}

/** Copy e icono de cada operación: el modal decide UNA vez en vez de preguntar en cada línea. */
const OPERATION_UI = {
	deposit: { titleKey: 'crypto.common.deposit', availableKey: 'crypto.savings.availableBalance', icon: 'arrow-down' },
	withdraw: { titleKey: 'crypto.common.withdraw', availableKey: 'crypto.savings.inSavings', icon: 'arrow-up' },
} as const

/** Modal centrado de depósito / retiro del ahorro (monto, "usar máximo" y envío). */
const SavingsOperationModal = ({ operation, amount, loading, available, onChangeAmount, onClose, onSubmit }: Props) => {

	const { t } = useTranslation()
	const { theme } = useTheme()
	const containerStyles = useContainerStyles(theme)
	const textStyles = useTextStyles(theme)
	const { height: windowHeight } = useWindowDimensions()
	const { keyboardHeight, keyboardVisible } = useKeyboardHeight()

	const ui = OPERATION_UI[operation ?? 'withdraw']
	const close = () => !loading && onClose()

	return (
		<Modal visible={!!operation} transparent animationType="fade" statusBarTranslucent onRequestClose={close}>
			{/* Overlay + card canónicos del theme (el overlay trae el padding
			    horizontal que mantiene la card dentro de los márgenes). Con el
			    teclado abierto el overlay cede su altura como paddingBottom para
			    re-centrar la card en el espacio restante — KeyboardAvoidingView
			    no es fiable dentro de un Modal statusBarTranslucent en Android */}
			<Pressable
				style={[containerStyles.modalOverlay, keyboardVisible && { paddingBottom: keyboardHeight + 16 }]}
				onPress={close}
			>
				<Pressable onPress={() => { }} style={[containerStyles.modalCard, { maxHeight: keyboardVisible ? windowHeight - keyboardHeight - 48 : windowHeight * 0.75 }]}>

					{/* Header */}
					<View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
						<Text style={[textStyles.h4, { color: theme.colors.primaryText }]}>
							{t(ui.titleKey)}
						</Text>
						<Pressable onPress={close} hitSlop={8}>
							<FontAwesome6 name="xmark" size={20} color={theme.colors.secondaryText} iconStyle="solid" />
						</Pressable>
					</View>

					{/* Available balance hint */}
					<Text style={{ color: theme.colors.secondaryText, fontSize: theme.typography.fontSize.xs, fontFamily: theme.typography.fontFamily.regular, textAlign: 'center', marginBottom: 8 }}>
						{t(ui.availableKey, { amount: formatMoney(available) })}
					</Text>

					{/* Amount input */}
					<View style={{ alignItems: 'center', marginBottom: 24 }}>
						<View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}>
							{/* Símbolo al patrón de QPBalance: gris medio y un paso menor que las cifras */}
							<Text style={{ color: theme.colors.secondaryText, fontSize: theme.typography.fontSize.xxxl, fontFamily: theme.typography.fontFamily.semiBold, marginRight: 4 }}>$</Text>
							<TextInput
								value={amount}
								onChangeText={(text) => onChangeAmount(sanitizeAmountInput(text))}
								placeholder="0.00"
								placeholderTextColor={theme.colors.tertiaryText}
								keyboardType="decimal-pad"
								autoFocus
								style={{
									color: theme.colors.primaryText,
									fontSize: 40,
									fontFamily: theme.typography.fontFamily.semiBold,
									minWidth: 80,
									textAlign: 'center',
									padding: 0,
								}}
							/>
						</View>
					</View>

					{/* Max button */}
					<Pressable
						onPress={() => onChangeAmount(available.toFixed(2))}
						style={{ alignSelf: 'center', marginBottom: 24 }}
					>
						<Text style={{ color: theme.colors.primary, fontSize: theme.typography.fontSize.sm, fontFamily: theme.typography.fontFamily.semiBold }}>{t('crypto.savings.useMax')}</Text>
					</Pressable>

					{/* Submit */}
					<QPButton
						title={t(ui.titleKey)}
						icon={ui.icon}
						onPress={onSubmit}
						loading={loading}
						disabled={loading || !amount || parseAmountInput(amount) < 1}
					/>

				</Pressable>
			</Pressable>
		</Modal>
	)
}

export default SavingsOperationModal
