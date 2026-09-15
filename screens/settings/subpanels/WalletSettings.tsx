import { useCallback, useEffect, useState } from 'react'
import { AppState, Modal, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner-native'
import Clipboard from '@react-native-clipboard/clipboard'
import FontAwesome6 from '@react-native-vector-icons/fontawesome6'
import { useNavigation } from '@react-navigation/native'
import { useQueryClient } from '@tanstack/react-query'

// Theme
import { useTheme } from '../../../theme/ThemeContext'
import type { Theme } from '../../../theme/ThemeContext'
import { createTextStyles, createContainerStyles } from '../../../theme/themeUtils'

// Wallet
import { useWallet } from '../../../wallet/WalletContext'
import { disableWalletBiometrics, enableWalletBiometrics } from '../../../wallet/keystore'
import { getSupportedBiometryType } from '../../../api/client'
import { useSettings } from '../../../settings/SettingsContext'
import { shortAddress } from '../../crypto/wallet/walletFormat'
import { clearHistoryCaches } from '../../crypto/wallet/historyCache'

// UI
import QPButton from '../../../ui/particles/QPButton'
import QPPressable from '../../../ui/particles/QPPressable'
import WalletAuthModal from '../../crypto/wallet/components/WalletAuthModal'

const FAMILIES = [
	{ key: 'tron', labelKey: 'crypto.wallet.settings.families.tron' },
	{ key: 'evm', labelKey: 'crypto.wallet.settings.families.evm' },
	{ key: 'btc', labelKey: 'crypto.wallet.settings.families.btc' },
] as const

/** La frase revelada se oculta sola pasado esto (y al irse la app a segundo plano). */
const REVEAL_TIMEOUT_MS = 60_000

type Pending = 'reveal' | 'delete' | 'biometrics' | null

/**
 * Ajustes → Avanzado → Mi wallet: direcciones públicas, ver la frase secreta
 * y eliminar la wallet. Las dos acciones sensibles pasan por el gate de
 * PIN/biometría (WalletAuthModal) ANTES de tocar el Keychain. La frase vive
 * solo en el estado local mientras se muestra, se oculta sola a los 60s y al
 * ir la app a segundo plano. Eliminar exige además confirmar que se tiene el
 * respaldo: es irreversible y el logout NO borra la seed (regla 3), así que
 * este es el único camino para quitarla del teléfono.
 */
const WalletSettings = () => {

	const { t } = useTranslation()
	const { theme } = useTheme()
	const textStyles = createTextStyles(theme)
	const containerStyles = createContainerStyles(theme)
	const navigation = useNavigation()
	const queryClient = useQueryClient()

	const { hasWallet, isBackedUp, addresses, revealMnemonic, deleteWallet } = useWallet()
	const { getSetting, updateSetting } = useSettings()
	const walletBiometrics = getSetting('crypto', 'walletBiometrics', true) as boolean
	const [biometryType, setBiometryType] = useState<string | null>(null)
	useEffect(() => { getSupportedBiometryType().then(setBiometryType) }, [])

	const [pending, setPending] = useState<Pending>(null)
	const [mnemonic, setMnemonic] = useState<string | null>(null)
	const [confirmDelete, setConfirmDelete] = useState(false)
	const [acknowledged, setAcknowledged] = useState(false)
	const [deleting, setDeleting] = useState(false)

	const hide = useCallback(() => setMnemonic(null), [])

	// La frase no se queda en pantalla: timeout y ocultado al perder el foreground
	useEffect(() => {
		if (!mnemonic) return
		const timer = setTimeout(hide, REVEAL_TIMEOUT_MS)
		const sub = AppState.addEventListener('change', state => { if (state !== 'active') hide() })
		return () => { clearTimeout(timer); sub.remove() }
	}, [mnemonic, hide])

	const onAuthorized = useCallback(async () => {
		const action = pending
		setPending(null)
		if (action === 'reveal') {
			const value = await revealMnemonic()
			if (!value) { toast.error(t('crypto.wallet.settings.revealFailed')); return }
			setMnemonic(value)
		} else if (action === 'delete') {
			setAcknowledged(false)
			setConfirmDelete(true)
		} else if (action === 'biometrics') {
			// Encender exige el PIN (si no, un teléfono desbloqueado bastaría para armarla)
			if (await enableWalletBiometrics()) updateSetting('crypto', 'walletBiometrics', true)
			else toast.error(t('crypto.wallet.settings.biometricsFailed'))
		}
	}, [pending, revealMnemonic, updateSetting, t])

	const toggleBiometrics = useCallback((value: boolean) => {
		if (value) { setPending('biometrics'); return }
		updateSetting('crypto', 'walletBiometrics', false)
		disableWalletBiometrics()
	}, [updateSetting])

	const performDelete = useCallback(async () => {
		if (!acknowledged || deleting) return
		setDeleting(true)
		try {
			await deleteWallet()
			await clearHistoryCaches()
			// Saldos/historial de la wallet borrada no deben sobrevivir en memoria
			queryClient.removeQueries({ queryKey: ['wallet', 'balances'] })
			queryClient.removeQueries({ queryKey: ['wallet', 'history'] })
			setConfirmDelete(false)
			toast.success(t('crypto.wallet.settings.deleted'))
			navigation.goBack()
		} finally {
			setDeleting(false)
		}
	}, [acknowledged, deleting, deleteWallet, queryClient, t, navigation])

	const copy = (value: string) => { Clipboard.setString(value); toast.success(t('crypto.wallet.card.copied')) }

	if (!hasWallet || !addresses) {
		return (
			<View style={[containerStyles.subContainer, styles.empty]}>
				<FontAwesome6 name="wallet" size={28} color={theme.colors.secondaryText} iconStyle="solid" />
				<Text style={[textStyles.h4, { color: theme.colors.secondaryText, textAlign: 'center' }]}>{t('crypto.wallet.settings.noWallet')}</Text>
			</View>
		)
	}

	const words = mnemonic?.split(' ') ?? []
	const authSubtitle = pending === 'delete' ? t('crypto.wallet.auth.deleteSubtitle') : pending === 'biometrics' ? t('crypto.wallet.auth.biometricsSubtitle') : t('crypto.wallet.auth.revealSubtitle')

	return (
		<ScrollView style={containerStyles.subContainer} showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>

			<View style={styles.header}>
				<Text style={textStyles.h1}>{t('crypto.wallet.settings.title')}</Text>
				<Text style={[textStyles.h3, { color: theme.colors.secondaryText }]}>{t('crypto.wallet.settings.subtitle')}</Text>
			</View>

			{/* Direcciones públicas */}
			<Text style={[styles.sectionTitle, { color: theme.colors.secondaryText, fontFamily: theme.typography.fontFamily.medium, fontSize: theme.typography.fontSize.xs }]}>{t('crypto.wallet.settings.addresses').toUpperCase()}</Text>
			<View style={[styles.card, { backgroundColor: theme.colors.surface }, cardBorder(theme)]}>
				{FAMILIES.map((family, index) => (
					<QPPressable key={family.key} onPress={() => copy(addresses[family.key])} style={[styles.row, index < FAMILIES.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.colors.border + '60' }]}>
						<Text style={[textStyles.h6, styles.familyLabel, { color: theme.colors.secondaryText }]}>{t(family.labelKey)}</Text>
						<Text style={[textStyles.h5, styles.address, { color: theme.colors.primaryText }]} numberOfLines={1}>{shortAddress(addresses[family.key], 10, 8)}</Text>
						<FontAwesome6 name="copy" size={13} color={theme.colors.secondaryText} iconStyle="regular" />
					</QPPressable>
				))}
			</View>

			{/* Frase secreta */}
			<Text style={[styles.sectionTitle, { color: theme.colors.secondaryText, fontFamily: theme.typography.fontFamily.medium, fontSize: theme.typography.fontSize.xs }]}>{t('crypto.wallet.settings.phrase').toUpperCase()}</Text>
			<View style={[styles.card, styles.cardPadded, { backgroundColor: theme.colors.surface }, cardBorder(theme)]}>
				{!isBackedUp && (
					<View style={[styles.notice, { backgroundColor: theme.colors.warning + '14' }]}>
						<FontAwesome6 name="triangle-exclamation" size={14} color={theme.colors.warning} iconStyle="solid" />
						<Text style={[textStyles.h6, styles.noticeText, { color: theme.colors.primaryText }]}>{t('crypto.wallet.settings.notBackedUp')}</Text>
					</View>
				)}
				{mnemonic ? (
					<>
						<View style={styles.grid}>
							{words.map((word, index) => (
								<View key={index} style={[styles.wordChip, { backgroundColor: theme.colors.elevation }]}>
									<Text style={[textStyles.h6, { color: theme.colors.secondaryText }]}>{index + 1}</Text>
									<Text style={[textStyles.h5, { color: theme.colors.primaryText }]}>{word}</Text>
								</View>
							))}
						</View>
						<Text style={[textStyles.h6, styles.hint, { color: theme.colors.tertiaryText }]}>{t('crypto.wallet.settings.revealHint')}</Text>
						<QPButton title={t('crypto.wallet.settings.hide')} icon="eye-slash" outlined onPress={hide} />
					</>
				) : (
					<>
						<Text style={[textStyles.h5, { color: theme.colors.secondaryText }]}>{t('crypto.wallet.settings.phraseHint')}</Text>
						<QPButton title={t('crypto.wallet.settings.reveal')} icon="eye" onPress={() => setPending('reveal')} />
					</>
				)}
			</View>

			{/* Biometría propia de la wallet */}
			{!!biometryType && (
				<>
					<Text style={[styles.sectionTitle, { color: theme.colors.secondaryText, fontFamily: theme.typography.fontFamily.medium, fontSize: theme.typography.fontSize.xs }]}>{t('crypto.wallet.settings.security').toUpperCase()}</Text>
					<View style={[styles.card, styles.cardPadded, styles.switchRow, { backgroundColor: theme.colors.surface }, cardBorder(theme)]}>
						<View style={styles.switchTexts}>
							<Text style={[textStyles.h4, { color: theme.colors.primaryText }]}>{t(biometryType === 'FaceID' ? 'crypto.wallet.settings.biometricsFaceId' : 'crypto.wallet.settings.biometricsTouchId')}</Text>
							<Text style={[textStyles.h6, { color: theme.colors.secondaryText }]}>{t('crypto.wallet.settings.biometricsHint')}</Text>
						</View>
						<Switch value={walletBiometrics} onValueChange={toggleBiometrics} trackColor={{ false: theme.colors.tertiaryText, true: theme.colors.primary }} />
					</View>
				</>
			)}

			{/* Eliminar */}
			<Text style={[styles.sectionTitle, { color: theme.colors.secondaryText, fontFamily: theme.typography.fontFamily.medium, fontSize: theme.typography.fontSize.xs }]}>{t('crypto.wallet.settings.dangerZone').toUpperCase()}</Text>
			<View style={[styles.card, styles.cardPadded, { backgroundColor: theme.colors.surface }, cardBorder(theme)]}>
				<Text style={[textStyles.h5, { color: theme.colors.secondaryText }]}>{t('crypto.wallet.settings.deleteHint')}</Text>
				<QPButton title={t('crypto.wallet.settings.delete')} icon="trash" danger outlined onPress={() => setPending('delete')} />
			</View>

			<WalletAuthModal visible={pending !== null} subtitle={authSubtitle} onClose={() => setPending(null)} onAuthorized={onAuthorized} />

			{/* Segunda confirmación de borrado: hay que reconocer que se tiene la frase */}
			<Modal visible={confirmDelete} transparent animationType="fade" statusBarTranslucent onRequestClose={() => setConfirmDelete(false)}>
				<Pressable style={styles.overlay} onPress={() => !deleting && setConfirmDelete(false)}>
					<Pressable style={[styles.modalCard, { backgroundColor: theme.colors.surface }]} onPress={() => {}}>
						<View style={[styles.modalIcon, { backgroundColor: theme.colors.danger + '15' }]}>
							<FontAwesome6 name="trash" size={20} color={theme.colors.danger} iconStyle="solid" />
						</View>
						<Text style={[textStyles.h3, styles.centered, { color: theme.colors.primaryText }]}>{t('crypto.wallet.settings.confirmTitle')}</Text>
						<Text style={[textStyles.h5, styles.centered, { color: theme.colors.secondaryText }]}>{t('crypto.wallet.settings.confirmBody')}</Text>
						<Pressable onPress={() => setAcknowledged(v => !v)} style={styles.ackRow} accessibilityRole="switch" accessibilityState={{ checked: acknowledged }}>
							<Text style={[textStyles.h5, styles.ackText, { color: theme.colors.primaryText }]}>{t('crypto.wallet.settings.confirmAck')}</Text>
							<Switch value={acknowledged} onValueChange={setAcknowledged} trackColor={{ false: theme.colors.tertiaryText, true: theme.colors.danger }} />
						</Pressable>
						<QPButton title={t('crypto.wallet.settings.confirmDelete')} danger disabled={!acknowledged} loading={deleting} onPress={performDelete} />
						<QPButton title={t('common.actions.cancel')} outlined disabled={deleting} onPress={() => setConfirmDelete(false)} />
					</Pressable>
				</Pressable>
			</Modal>
		</ScrollView>
	)
}

const cardBorder = (theme: Theme) => !theme.isDark ? { borderWidth: StyleSheet.hairlineWidth, borderColor: theme.colors.border } : null

const styles = StyleSheet.create({
	content: { paddingBottom: 40 },
	empty: { alignItems: 'center', justifyContent: 'center', gap: 12 },
	header: { gap: 4, marginBottom: 18 },
	sectionTitle: { letterSpacing: 0.6, marginLeft: 4, marginBottom: 6, marginTop: 14 },
	card: { borderRadius: 14, paddingHorizontal: 12 },
	cardPadded: { paddingVertical: 14, gap: 12 },
	switchRow: { flexDirection: 'row', alignItems: 'center' },
	switchTexts: { flex: 1, gap: 2 },
	row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 11 },
	familyLabel: { width: 96 },
	address: { flex: 1 },
	notice: { flexDirection: 'row', gap: 10, padding: 10, borderRadius: 10, alignItems: 'flex-start' },
	noticeText: { flex: 1 },
	grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
	wordChip: { flexDirection: 'row', gap: 6, alignItems: 'center', borderRadius: 10, paddingVertical: 8, paddingHorizontal: 10, flexBasis: '31%', flexGrow: 1 },
	hint: { textAlign: 'center' },
	overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center', padding: 24 },
	modalCard: { width: '100%', borderRadius: 16, padding: 24, gap: 12 },
	modalIcon: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', alignSelf: 'center' },
	centered: { textAlign: 'center' },
	ackRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 6 },
	ackText: { flex: 1 },
})

export default WalletSettings
