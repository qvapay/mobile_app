import { useCallback, useEffect, useState } from 'react'
import { ScrollView, StyleSheet, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'

// Theme
import { useTheme } from '../../../theme/ThemeContext'
import { createTextStyles, createContainerStyles } from '../../../theme/themeUtils'

// Wallet registry
import { useAppRpcRouter, subscribeRpcHealth } from '../../../wallet/registry/appRpcRouter'
import { useRegistry } from '../../../wallet/registry/useRegistry'
import type { HealthMap } from '../../../wallet/registry/rpcRouter'
import type { RegistryRpc } from '../../../wallet/registry/types'

// UI
import QPButton from '../../../ui/particles/QPButton'

import type { Theme } from '../../../theme/ThemeContext'

/**
 * Pantalla oculta (Ajustes → Avanzado → Nodos, visible solo con el flag
 * self-custody o en dev): qué RPC usa cada cadena de la wallet, con latencia
 * y fallos en vivo. Sirve para vigilar el flip de los nodos propios del
 * registro remoto (priority 0) desde el teléfono, sin publicar versión.
 */
const RpcNodes = () => {

	const { t } = useTranslation()
	const { theme } = useTheme()
	const textStyles = createTextStyles(theme)
	const containerStyles = createContainerStyles(theme)

	const registry = useRegistry()
	const router = useAppRpcRouter()

	const [health, setHealth] = useState<HealthMap>(() => router.getHealth())
	const [probing, setProbing] = useState(false)

	useEffect(() => subscribeRpcHealth(setHealth), [])

	const probeAll = useCallback(async () => {
		setProbing(true)
		try { await router.probe() } finally { setProbing(false) }
	}, [router])

	// Primera medición al entrar: sin ella la pantalla nace "Sin medir".
	useEffect(() => { probeAll() }, [probeAll])

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
							return (
								<View key={rpc.url} style={[styles.row, { borderTopColor: theme.colors.border + '60' }]}>
									<View style={[styles.dot, { backgroundColor: dotColor(rpc) }]} />
									<View style={styles.rowBody}>
										<Text style={[textStyles.h5, { color: theme.colors.primaryText }]} numberOfLines={1}>
											{rpc.owner}
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
										<Text style={[textStyles.h7, styles.activePill, { color: theme.colors.success, borderColor: theme.colors.success }]}>
											{t('crypto.nodes.active')}
										</Text>
									)}
								</View>
							)
						})}
					</View>
				)
			})}

			<QPButton
				title={probing ? t('crypto.nodes.probing') : t('crypto.nodes.probe')}
				onPress={probeAll}
				disabled={probing}
			/>
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
})

export default RpcNodes
