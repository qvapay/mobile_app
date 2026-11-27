import { StyleSheet, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import FontAwesome6 from '@react-native-vector-icons/fontawesome6'

// Theme
import { useTheme } from '../theme/ThemeContext'
import { useContainerStyles, useTextStyles } from '../theme/themeUtils'

// UI
import QPPressable from './particles/QPPressable'

import { getDateLocale } from '../i18n'
import { cipNoticeCopy } from '../helpers/cipRequirement'

import type { StyleProp, ViewStyle } from 'react-native'
import type { CipGateAction } from '../helpers/cipRequirement'
import type { CipWithdrawRequirement } from '../types/domain'

type Props = {
	requirement: CipWithdrawRequirement | null
	/** La salida de la pantalla donde sale (decide el texto). */
	action: CipGateAction
	/** Abre Ajustes → Datos personales. */
	onPress: () => void
	style?: StyleProp<ViewStyle>
}

/**
 * Aviso de la ficha CIP en una salida de valor (calco del `CipRequiredNotice` de qpweb):
 * en los días de aviso dice desde cuándo hará falta; con la salida ya frenada, en rojo,
 * qué falta. La tarjeta entera lleva a Datos personales. No se puede cerrar: es un
 * requisito, y desaparece en cuanto la ficha queda completa.
 */
const CipRequiredNotice = ({ requirement, action, onPress, style }: Props) => {

	const { t } = useTranslation()
	const { theme } = useTheme()
	const textStyles = useTextStyles(theme)
	const containerStyles = useContainerStyles(theme)

	if (!requirement) { return null }

	const blocking = requirement.blocking === true
	const tint = blocking ? theme.colors.danger : theme.colors.primary
	const { title, body } = cipNoticeCopy({ action, blocking, missing: requirement.missing, enforceFrom: requirement.enforce_from }, t, getDateLocale())

	return (
		<QPPressable onPress={onPress} style={[containerStyles.card, styles.card, style]} accessibilityRole="button" testID="cip-required-notice">
			<View style={[styles.icon, { backgroundColor: tint + '1F' }]}>
				<FontAwesome6 name="id-card-clip" size={18} color={blocking ? theme.colors.dangerText : theme.colors.primary} iconStyle="solid" />
			</View>
			<View style={styles.texts}>
				<Text style={[textStyles.h5, { color: theme.colors.primaryText, marginBottom: 2 }]}>{title}</Text>
				<Text style={[textStyles.caption, { color: theme.colors.secondaryText }]}>{body}</Text>
				<Text style={[textStyles.caption, { color: theme.colors.primary, fontFamily: theme.typography.fontFamily.medium, marginTop: 6 }]}>{t('ui.cipNotice.cta')}</Text>
			</View>
			<FontAwesome6 name="chevron-right" size={14} color={theme.colors.tertiaryText} iconStyle="solid" />
		</QPPressable>
	)
}

const styles = StyleSheet.create({
	card: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 },
	icon: { width: 38, height: 38, borderRadius: 11, borderCurve: 'continuous', alignItems: 'center', justifyContent: 'center' },
	texts: { flex: 1 },
})

export default CipRequiredNotice
