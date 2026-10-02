import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import FontAwesome6 from '@react-native-vector-icons/fontawesome6'

// Theme
import { useTheme } from '../../../../theme/ThemeContext'
import { useTextStyles } from '../../../../theme/themeUtils'

// Wallet
import { displayAmount, formatUnits } from '../../../../wallet/chains/units'
import type { RegistryStakeTarget } from '../../../../wallet/registry/types'
import type { StakingKind } from '../../../../wallet/staking/types'
import { shortAddress } from '../walletFormat'
import { isPlausibleApy } from '../../../../wallet/staking/apy'

// UI
import QPPressable from '../../../../ui/particles/QPPressable'

type Props = {
	visible: boolean
	kind: StakingKind
	targets: RegistryStakeTarget[]
	selectedId: string | null
	/** Símbolo y decimales del nativo, para el mínimo de los pools. */
	symbol: string
	decimals: number
	onPick: (target: RegistryStakeTarget) => void
	onClose: () => void
	/** APY estimado por id de destino; ausente o null = sin cifra (nunca se inventa). */
	apys?: Record<string, number | null>
	apyLoading?: boolean
}

/** APY de una fila: cifra si es creíble, spinner mientras llega, nada si no hay dato. */
const TargetApy = ({ apy, loading, testID }: { apy: number | null | undefined, loading: boolean, testID: string }) => {
	const { t } = useTranslation()
	const { theme } = useTheme()
	if (isPlausibleApy(apy)) {
		return (
			<Text testID={testID} style={{ color: theme.colors.successText, fontFamily: theme.typography.fontFamily.semiBold, fontSize: theme.typography.fontSize.sm }}>
				{t('crypto.staking.picker.apy', { apy: `${(apy * 100).toFixed(1)} %` })}
			</Text>
		)
	}
	return loading ? <ActivityIndicator size="small" color={theme.colors.tertiaryText} /> : null
}

/**
 * Selector de validador / Super Representative / pool, en tarjeta centrada
 * (patrón de modales de la app). La lista sale del registry ya ordenada
 * (partners → destacados → resto) y cada fila dice POR QUÉ está arriba: un
 * socio comercial se etiqueta como tal, nunca se cuela como "recomendado".
 */
const StakeTargetPicker = ({ visible, kind, targets, selectedId, symbol, decimals, onPick, onClose, apys, apyLoading = false }: Props) => {

	const { t } = useTranslation()
	const { theme, styles: themeStyles } = useTheme()
	const textStyles = useTextStyles(theme)
	const targetKind = t(`crypto.staking.targetKind.${kind}`)

	return (
		<Modal visible={visible} transparent statusBarTranslucent animationType="fade" onRequestClose={onClose}>
			{/* accessible={false} en fondo y tarjeta: un Pressable accesible funde a sus hijos en UN
			    solo elemento y ni VoiceOver ni Maestro llegan a los controles (mismo patrón que WalletAuthModal) */}
			<Pressable style={themeStyles.container.modalOverlay} onPress={onClose} accessible={false}>
				<Pressable testID="stake-target-picker" style={[themeStyles.container.modalCard, styles.card]} onPress={() => {}} accessible={false}>
					<Text style={[textStyles.h3, styles.title, { color: theme.colors.primaryText }]}>{t('crypto.staking.picker.title', { target: targetKind })}</Text>

					{targets.length === 0 ? (
						<Text style={[textStyles.h5, styles.empty, { color: theme.colors.secondaryText }]}>{t('crypto.staking.picker.empty')}</Text>
					) : (
						<ScrollView style={styles.list} showsVerticalScrollIndicator={false}>
							{targets.map((target, index) => {
								const selected = target.id === selectedId
								const tags = [
									target.partner ? t('crypto.staking.picker.partner') : null,
									!target.partner && target.featured ? t('crypto.staking.picker.featured') : null,
									target.payout ? t('crypto.staking.picker.payout', { symbol: target.payout.toUpperCase() }) : null,
									target.minAmount ? t('crypto.staking.picker.minAmount', { amount: displayAmount(formatUnits(BigInt(target.minAmount), decimals)), symbol }) : null,
								].filter(Boolean).join(' · ')
								return (
									<QPPressable
										key={target.id}
										onPress={() => onPick(target)}
										testID={`stake-target-${target.id}`}
										style={[styles.row, index < targets.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.colors.border + '60' }]}
										accessibilityRole="button"
										accessibilityState={{ selected }}
									>
										<View style={styles.info}>
											<Text style={[textStyles.h4, { color: theme.colors.primaryText }]} numberOfLines={1}>{target.name}</Text>
											<Text style={{ color: theme.colors.secondaryText, fontFamily: theme.typography.fontFamily.regular, fontSize: theme.typography.fontSize.xs }} numberOfLines={1}>
												{tags ? `${tags} · ${shortAddress(target.id)}` : shortAddress(target.id)}
											</Text>
										</View>
										<TargetApy apy={apys?.[target.id]} loading={apyLoading} testID={`stake-target-apy-${target.id}`} />
										{selected && <FontAwesome6 name="circle-check" size={18} color={theme.colors.primary} iconStyle="solid" />}
									</QPPressable>
								)
							})}
						</ScrollView>
					)}
					{!!apys && Object.values(apys).some(isPlausibleApy) && (
						<Text style={[styles.note, { color: theme.colors.tertiaryText, fontFamily: theme.typography.fontFamily.regular, fontSize: theme.typography.fontSize.xs }]}>
							{t(`crypto.staking.picker.apyNote.${kind}`)}
						</Text>
					)}
				</Pressable>
			</Pressable>
		</Modal>
	)
}

const styles = StyleSheet.create({
	card: { maxHeight: '75%' },
	title: { textAlign: 'center', marginBottom: 12 },
	empty: { textAlign: 'center', paddingVertical: 16 },
	list: { flexGrow: 0 },
	row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
	info: { flex: 1, minWidth: 0, gap: 2 },
	note: { textAlign: 'center', marginTop: 10, lineHeight: 16 },
})

export default StakeTargetPicker
