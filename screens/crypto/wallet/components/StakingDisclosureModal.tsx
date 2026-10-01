import { useEffect, useState } from 'react'
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import FontAwesome6 from '@react-native-vector-icons/fontawesome6'
import type { FontAwesome6SolidIconName } from '@react-native-vector-icons/fontawesome6'

// Theme
import { useTheme } from '../../../../theme/ThemeContext'
import type { Theme } from '../../../../theme/ThemeContext'
import { useTextStyles } from '../../../../theme/themeUtils'

// UI
import QPButton from '../../../../ui/particles/QPButton'

import type { StakingKind } from '../../../../wallet/staking/types'

type Props = {
	visible: boolean
	kind: StakingKind
	onAccept: () => void
	onClose: () => void
}

const Point = ({ icon, text, theme }: { icon: FontAwesome6SolidIconName, text: string, theme: Theme }) => (
	<View style={styles.point}>
		<FontAwesome6 name={icon} size={14} color={theme.colors.primary} iconStyle="solid" style={styles.pointIcon} />
		<Text style={[styles.pointText, { color: theme.colors.primaryText, fontFamily: theme.typography.fontFamily.regular, fontSize: theme.typography.fontSize.sm }]}>{text}</Text>
	</View>
)

/**
 * Aviso previo al PRIMER staking de cada red: custodia, bloqueo propio de la
 * cadena y rendimiento variable. Exige marcar la casilla (no basta un botón
 * que se pulsa sin leer); la aceptación se guarda por familia en Ajustes
 * (`crypto.stakingDisclosure`), así que cambiar de red la vuelve a pedir
 * porque los plazos de salida son distintos.
 */
const StakingDisclosureModal = ({ visible, kind, onAccept, onClose }: Props) => {

	const { t } = useTranslation()
	const { theme, styles: themeStyles } = useTheme()
	const textStyles = useTextStyles(theme)
	const [checked, setChecked] = useState(false)

	// Cada apertura empieza sin marcar
	useEffect(() => { if (visible) setChecked(false) }, [visible])

	return (
		<Modal visible={visible} transparent statusBarTranslucent animationType="fade" onRequestClose={onClose}>
			{/* accessible={false} en fondo y tarjeta: un Pressable accesible funde a sus hijos en UN
			    solo elemento y ni VoiceOver ni Maestro llegan a los controles (mismo patrón que WalletAuthModal) */}
			<Pressable style={themeStyles.container.modalOverlay} onPress={onClose} accessible={false}>
				{/* El Pressable interior corta el tap para que tocar la tarjeta no la cierre */}
				<Pressable testID="staking-disclosure" style={[themeStyles.container.modalCard, styles.card]} onPress={() => {}} accessible={false}>
					<FontAwesome6 name="seedling" size={34} color={theme.colors.primary} iconStyle="solid" style={styles.icon} />
					<Text style={[textStyles.h3, styles.title, { color: theme.colors.primaryText }]}>{t('crypto.staking.disclosure.title')}</Text>

					<Point icon="shield-halved" theme={theme} text={t('crypto.staking.disclosure.custody')} />
					<Point icon="hourglass-half" theme={theme} text={t(`crypto.staking.disclosure.lock.${kind}`)} />
					<Point icon="chart-line" theme={theme} text={t('crypto.staking.disclosure.variable')} />

					<Pressable
						onPress={() => setChecked(value => !value)}
						style={styles.check}
						accessibilityRole="checkbox"
						accessibilityState={{ checked }}
						testID="staking-disclosure-check"
					>
						<View style={[styles.box, { borderColor: checked ? theme.colors.primary : theme.colors.border }, checked && { backgroundColor: theme.colors.primary }]}>
							{checked && <FontAwesome6 name="check" size={11} color={theme.colors.buttonText} iconStyle="solid" />}
						</View>
						<Text style={[styles.checkText, { color: theme.colors.primaryText, fontFamily: theme.typography.fontFamily.medium, fontSize: theme.typography.fontSize.sm }]}>
							{t('crypto.staking.disclosure.accept')}
						</Text>
					</Pressable>

					<QPButton title={t('crypto.staking.disclosure.continue')} onPress={onAccept} disabled={!checked} testID="staking-disclosure-continue" />
					<QPButton title={t('crypto.staking.disclosure.cancel')} onPress={onClose} outlined style={styles.cancel} />
				</Pressable>
			</Pressable>
		</Modal>
	)
}

const styles = StyleSheet.create({
	card: { gap: 12 },
	icon: { alignSelf: 'center' },
	title: { textAlign: 'center', marginBottom: 4 },
	point: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
	pointIcon: { marginTop: 3, width: 16, textAlign: 'center' },
	pointText: { flex: 1, lineHeight: 20 },
	check: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 },
	box: { width: 20, height: 20, borderRadius: 6, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
	checkText: { flex: 1 },
	cancel: { marginTop: -4 },
})

export default StakingDisclosureModal
