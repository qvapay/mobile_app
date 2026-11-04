import { useState } from 'react'
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native'
import QPModalCard from '../../../../ui/QPModalCard'
import { useTranslation } from 'react-i18next'
import FontAwesome6 from '@react-native-vector-icons/fontawesome6'

// Theme
import { useTheme } from '../../../../theme/ThemeContext'
import { useContainerStyles, useTextStyles } from '../../../../theme/themeUtils'

// UI
import QPButton from '../../../../ui/particles/QPButton'
import { useModalGate } from '../../../../ui/useModalGate'
import type { ModalGate } from '../../../../ui/useModalGate'

// Reglas
import { lnNameProblem, normalizeLnName } from '../../../../helpers/lightningAddress'

import LnNameField from './LnNameField'

type Props = {
	open: boolean
	onClose: () => void
	currentName: string
	domain: string
	renamesLeft: number
	/** Devuelve el error a pintar bajo el campo (o null si fue bien; entonces se cierra). */
	onRename: (name: string) => Promise<string | null>
}

/**
 * Hoja de cambio de nombre. Pasa por `useModalGate`: se cierra por código justo
 * después del POST, y en iOS un `<Modal>` cerrado antes de acabar su animación
 * deja un zombi que bloquea todos los demás.
 */
const LnRenameSheet = (props: Props) => {
	const gate = useModalGate(props.open)
	return gate.mounted ? <SheetCard key={gate.generation} gate={gate} {...props} /> : null
}

const SheetCard = ({ gate, onClose, currentName, domain, renamesLeft, onRename }: Props & { gate: ModalGate }) => {

	const { t } = useTranslation()
	const { theme } = useTheme()
	const textStyles = useTextStyles(theme)
	const containerStyles = useContainerStyles(theme)

	const [name, setName] = useState(currentName)
	const [busy, setBusy] = useState(false)
	const [serverError, setServerError] = useState<string | null>(null)

	const normalized = normalizeLnName(name)
	const invalid = !normalized || !!lnNameProblem(normalized) || normalized === currentName

	const confirm = async () => {
		if (invalid || busy) return
		setBusy(true)
		setServerError(null)
		const error = await onRename(normalized)
		setBusy(false)
		if (error) setServerError(error)
		else onClose()
	}

	return (
		<Modal visible={gate.visible} onShow={gate.onShow} onDismiss={gate.onDismiss} transparent animationType="fade" statusBarTranslucent onRequestClose={onClose}>
			<Pressable style={containerStyles.modalOverlay} onPress={busy ? undefined : onClose}>
				<QPModalCard style={styles.card}>
					<View style={styles.header}>
						<FontAwesome6 name="pen" size={16} color={theme.colors.primary} iconStyle="solid" />
						<Text style={[textStyles.h3, { flex: 1 }]}>{t('settings.lightningAddress.rename.title')}</Text>
					</View>
					<Text style={[textStyles.body, { color: theme.colors.secondaryText }]}>
						{t('settings.lightningAddress.rename.left', { count: renamesLeft })}
					</Text>
					<View style={[styles.warning, { backgroundColor: theme.colors.warning + '14' }]}>
						<FontAwesome6 name="triangle-exclamation" size={14} color={theme.colors.warning} iconStyle="solid" style={{ marginTop: 2 }} />
						<Text style={[textStyles.body, { color: theme.colors.primaryText, flex: 1 }]}>{t('settings.lightningAddress.rename.warning')}</Text>
					</View>
					<LnNameField value={name} onChange={(v) => { setName(v); setServerError(null) }} domain={domain} label={t('settings.lightningAddress.rename.newName')} serverError={serverError} autoFocus />
					<View style={styles.buttons}>
						<View style={styles.button}><QPButton title={t('common.actions.cancel')} onPress={onClose} outlined disabled={busy} /></View>
						<View style={styles.button}><QPButton title={t('settings.lightningAddress.rename.confirm')} onPress={confirm} loading={busy} disabled={busy || invalid} /></View>
					</View>
				</QPModalCard>
			</Pressable>
		</Modal>
	)
}

const styles = StyleSheet.create({
	card: { gap: 14 },
	header: { flexDirection: 'row', alignItems: 'center', gap: 10 },
	warning: { flexDirection: 'row', gap: 10, padding: 12, borderRadius: 12 },
	buttons: { flexDirection: 'row', gap: 10 },
	button: { flex: 1 },
})

export default LnRenameSheet
