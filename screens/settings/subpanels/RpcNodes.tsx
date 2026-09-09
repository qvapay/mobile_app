import { useCallback, useEffect, useState } from 'react'
import { ScrollView, StyleSheet, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner-native'
import FontAwesome6 from '@react-native-vector-icons/fontawesome6'

// Settings
import { useSettings } from '../../../settings/SettingsContext'

// Theme
import { useTheme } from '../../../theme/ThemeContext'
import { createTextStyles, createContainerStyles } from '../../../theme/themeUtils'

// Wallet registry
import { useAppRpcRouter, useEffectiveRegistry, subscribeRpcHealth } from '../../../wallet/registry/appRpcRouter'
import { CUSTOM_RPC_OWNER, addCustomRpc, removeCustomRpc } from '../../../wallet/registry/customRpcs'
import type { CustomRpcMap } from '../../../wallet/registry/customRpcs'
import type { HealthMap } from '../../../wallet/registry/rpcRouter'
import type { RegistryChain, RegistryRpc } from '../../../wallet/registry/types'

// UI
import QPButton from '../../../ui/particles/QPButton'
import QPPressable from '../../../ui/particles/QPPressable'
import RpcNodeAddModal from './RpcNodeAddModal'

import type { Theme } from '../../../theme/ThemeContext'

const NO_CUSTOM: CustomRpcMap = {}

/**
 * Pantalla oculta (Ajustes → Avanzado → Nodos, visible solo con el flag
 * self-custody o en dev): qué RPC usa cada cadena de la wallet, con latencia
 * y fallos en vivo, más el alta/baja de nodos del usuario (`crypto.customRpcs`,
 * que van delante de todo en el router). Sirve también para vigilar el flip
 * de los nodos propios del registro remoto (priority 0) sin publicar versión.
 */
const RpcNodes = () => {

	const { t } = useTranslation()
	const { theme } = useTheme()
	const textStyles = createTextStyles(theme)
	const containerStyles = createContainerStyles(theme)

	const registry = useEffectiveRegistry()
	const router = useAppRpcRouter()
	const { getSetting, updateSetting } = useSettings()
	const customRpcs = getSetting('crypto', 'customRpcs', NO_CUSTOM) as CustomRpcMap

	const [health, setHealth] = useState<HealthMap>(() => router.getHealth())
	const [probing, setProbing] = useState(false)
	const [adding, setAdding] = useState<{ chainKey: string, chain: RegistryChain } | null>(null)

	useEffect(() => subscribeRpcHealth(setHealth), [])

	const probeAll = useCallback(async () => {
		setProbing(true)
		try { await router.probe() } finally { setProbing(false) }
	}, [router])

	// Primera medición al entrar: sin ella la pantalla nace "Sin medir".
	useEffect(() => { probeAll() }, [probeAll])

	const addNode = useCallback(async (chainKey: string, url: string) => {
		const result = await updateSetting('crypto', 'customRpcs', addCustomRpc(customRpcs, chainKey, url))
		if (!result.success) { toast.error(result.error ?? ''); return }
		setAdding(null)
		toast.success(t('crypto.nodes.toasts.added'))
		// El registro efectivo cambia en el siguiente render; medir entonces
		// para que la fila nazca con latencia y el pill "Activo" se mueva.
		setTimeout(() => { router.probe(chainKey).catch(() => {}) }, 0)
	}, [customRpcs, router, t, updateSetting])

	const removeNode = useCallback(async (chainKey: string, url: string) => {
		const result = await updateSetting('crypto', 'customRpcs', removeCustomRpc(customRpcs, chainKey, url))
		if (result.success) toast.success(t('crypto.nodes.toasts.removed'))
	}, [customRpcs, t, updateSetting])

	const dotColor = (rpc: RegistryRpc): string => {
		if (rpc.enabled === false) return theme.colors.secondaryText + '55'
		const h = health[rpc.url]
		if (!h) return theme.colors.secondaryText
		return h.ok ? theme.colors.success : theme.colors.danger
	}

	return (
		<ScrollView style={containerStyles.subContainer} showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>

			<View style={styles.header}>
				<Text style={textStyles.h1}>{t('crypto.nodes.title')}</Text>
				<Text style={[textStyles.h3, { color: theme.colors.secondaryText }]}>{t('crypto.nodes.subtitle')}</Text>
			</View>

			{Object.entries(registry.chains).map(([chainKey, chain]) => {
				const active = router.pickRpc(chainKey)
				return (
					<View key={chainKey} style={[styles.card, { backgroundColor: theme.colors.surface }, cardBorder(theme)]}>
						<View style={styles.cardHeader}>
							<Text style={[textStyles.h4, { color: theme.colors.primaryText }]}>{chainKey.toUpperCase()}</Text>
							<Text style={[textStyles.h6, { color: theme.colors.secondaryText }]}>{chain.native.symbol}</Text>
						</View>

						{chain.rpcs.map(rpc => {
							const h = health[rpc.url]
							const isActive = active?.url === rpc.url && rpc.enabled !== false
							const isCustom = rpc.owner === CUSTOM_RPC_OWNER
							return (
								<View key={rpc.url} style={[styles.row, { borderTopColor: theme.colors.border + '60' }]}>
									<View style={[styles.dot, { backgroundColor: dotColor(rpc) }]} />
									<View style={styles.rowBody}>
										<Text style={[textStyles.h5, { color: isCustom ? theme.colors.primary : theme.colors.primaryText }]} numberOfLines={1}>
											{isCustom ? t('crypto.nodes.custom') : rpc.owner}
											<Text style={[textStyles.h6, { color: theme.colors.secondaryText }]}>  {rpc.url.replace('https://', '')}</Text>
										</Text>
										<Text style={[textStyles.h6, { color: theme.colors.secondaryText }]}>
											{rpc.enabled === false
												? t('crypto.nodes.disabled')
												: h?.latencyMs != null
													? t('crypto.nodes.latencyMs', { ms: Math.round(h.latencyMs) })
													: t('crypto.nodes.unmeasured')}
											{h && h.failures > 0 ? `  ·  ${t('crypto.nodes.failures', { count: h.failures })}` : ''}
										</Text>
									</View>
									{isActive && (
										<Text style={[textStyles.h7, styles.activePill, { color: theme.colors.successText, borderColor: theme.colors.successText }]}>
											{t('crypto.nodes.active')}
										</Text>
									)}
									{isCustom && (
										<QPPressable
											variant="opacity"
											onPress={() => removeNode(chainKey, rpc.url)}
											style={styles.trash}
											accessibilityRole="button"
											accessibilityLabel={t('crypto.nodes.removeNode')}
										>
											<FontAwesome6 name="trash" size={14} color={theme.colors.danger} iconStyle="solid" />
										</QPPressable>
									)}
								</View>
							)
						})}

						<QPPressable
							variant="opacity"
							onPress={() => setAdding({ chainKey, chain })}
							style={[styles.addRow, { borderTopColor: theme.colors.border + '60' }]}
							accessibilityRole="button"
						>
							<FontAwesome6 name="plus" size={12} color={theme.colors.primary} iconStyle="solid" />
							<Text style={[textStyles.h6, { color: theme.colors.primary }]}>{t('crypto.nodes.addNode')}</Text>
						</QPPressable>
					</View>
				)
			})}

			<QPButton
				title={probing ? t('crypto.nodes.probing') : t('crypto.nodes.probe')}
				onPress={probeAll}
				disabled={probing}
			/>

			<RpcNodeAddModal target={adding} customRpcs={customRpcs} onClose={() => setAdding(null)} onAdd={addNode} />
		</ScrollView>
	)
}

// Borde solo en claro: las cards de superficie no llevan borde en oscuro.
const cardBorder = (theme: Theme) =>
	!theme.isDark ? { borderWidth: StyleSheet.hairlineWidth, borderColor: theme.colors.border } : null

const styles = StyleSheet.create({
	content: { paddingBottom: 40, gap: 10 },
	header: { marginBottom: 10, gap: 4 },
	card: { borderRadius: 14, padding: 12 },
	cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
	row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderTopWidth: StyleSheet.hairlineWidth },
	rowBody: { flex: 1, gap: 2 },
	dot: { width: 8, height: 8, borderRadius: 4 },
	activePill: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2, overflow: 'hidden' },
	trash: { padding: 6 },
	addRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingTop: 12, paddingBottom: 2, borderTopWidth: StyleSheet.hairlineWidth },
})

export default RpcNodes
