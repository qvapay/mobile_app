import { useEffect, useState } from 'react'
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'

// Theme
import { useTheme } from '../../../theme/ThemeContext'
import { createTextStyles, createContainerStyles } from '../../../theme/themeUtils'

// Wallet registry
import { PROBE_TIMEOUT_MS, probeRpc } from '../../../wallet/registry/rpcRouter'
import { MAX_CUSTOM_RPCS_PER_CHAIN, normalizeRpcUrl, toCustomRpc, validateCustomRpc } from '../../../wallet/registry/customRpcs'
import type { CustomRpcError, CustomRpcMap } from '../../../wallet/registry/customRpcs'
import type { RegistryChain } from '../../../wallet/registry/types'

// UI
import QPInput from '../../../ui/particles/QPInput'
import QPButton from '../../../ui/particles/QPButton'

type RpcNodeAddModalProps = {
	/** null = cerrado. */
	target: { chainKey: string, chain: RegistryChain } | null
	customRpcs: CustomRpcMap
	onClose: () => void
	/** Recibe la URL ya normalizada y verificada contra el nodo. */
	onAdd: (chainKey: string, url: string) => Promise<void>
}

/**
 * Alta de un nodo RPC del usuario para una cadena (Ajustes → Nodos). La URL
 * se valida en local (https, sin credenciales, sin duplicar, tope por cadena)
 * y se PRUEBA contra el endpoint con el mismo ping que usa el router antes de
 * guardarla: un nodo muerto no debe entrar en la lista con prioridad máxima.
 */
const RpcNodeAddModal = ({ target, customRpcs, onClose, onAdd }: RpcNodeAddModalProps) => {

	const { t } = useTranslation()
	const { theme } = useTheme()
	const textStyles = createTextStyles(theme)
	const containerStyles = createContainerStyles(theme)

	const [url, setUrl] = useState('')
	const [error, setError] = useState<CustomRpcError | 'unreachable' | null>(null)
	const [testing, setTesting] = useState(false)

	// Cada apertura arranca limpia.
	useEffect(() => { if (target) { setUrl(''); setError(null); setTesting(false) } }, [target])

	const submit = async () => {
		if (!target || testing) return
		const reason = validateCustomRpc(customRpcs, target.chainKey, url)
		if (reason) { setError(reason); return }
		const normalized = normalizeRpcUrl(url) as string
		setTesting(true)
		setError(null)
		try {
			await probeRpc(target.chainKey, target.chain, toCustomRpc(normalized), PROBE_TIMEOUT_MS)
		} catch {
			setTesting(false)
			setError('unreachable')
			return
		}
		await onAdd(target.chainKey, normalized)
		setTesting(false)
	}

	const chainLabel = target?.chainKey.toUpperCase() ?? ''

	return (
		<Modal visible={target !== null} transparent animationType="fade" statusBarTranslucent onRequestClose={onClose}>
			<Pressable style={containerStyles.modalOverlay} onPress={onClose}>
				<Pressable style={containerStyles.modalCard} onPress={() => { }}>
					<Text style={[textStyles.h3, { color: theme.colors.primaryText }]}>{t('crypto.nodes.add.title', { chain: chainLabel })}</Text>
					<Text style={[textStyles.h6, styles.subtitle, { color: theme.colors.secondaryText }]}>
						{t('crypto.nodes.add.subtitle', { chain: chainLabel })}
					</Text>

					<QPInput
						placeholder={t('crypto.nodes.add.placeholder')}
						value={url}
						onChangeText={v => { setUrl(v); setError(null) }}
						autoCapitalize="none"
						autoCorrect={false}
						keyboardType="url"
						textContentType="URL"
						returnKeyType="go"
						onSubmitEditing={submit}
						editable={!testing}
						prefixIconName="server"
						style={styles.input}
					/>

					<View style={styles.errorSlot}>
						{error && (
							<Text style={[textStyles.h6, { color: theme.colors.danger }]}>
								{t(`crypto.nodes.add.errors.${error}`, { count: MAX_CUSTOM_RPCS_PER_CHAIN })}
							</Text>
						)}
					</View>

					<QPButton
						title={testing ? t('crypto.nodes.add.testing') : t('crypto.nodes.add.save')}
						onPress={submit}
						loading={testing}
						disabled={!url.trim()}
					/>
					<Pressable onPress={onClose} disabled={testing} style={styles.cancel} hitSlop={8}>
						<Text style={[textStyles.h6, { color: theme.colors.secondaryText }]}>{t('crypto.nodes.add.cancel')}</Text>
					</Pressable>
				</Pressable>
			</Pressable>
		</Modal>
	)
}

const styles = StyleSheet.create({
	subtitle: { marginTop: 6, marginBottom: 16 },
	input: { marginVertical: 0 },
	errorSlot: { minHeight: 22, justifyContent: 'center', marginTop: 8, marginBottom: 8 },
	cancel: { alignSelf: 'center', paddingVertical: 12 },
})

export default RpcNodeAddModal
