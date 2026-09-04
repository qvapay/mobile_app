import { useAuth } from '../auth/AuthContext'
import { useSettings } from '../settings/SettingsContext'

/**
 * Gate del rollout de la wallet self-custody (branch crypto, Fase 0):
 * se enciende por el ajuste local `crypto.selfCustody` (default off) o por
 * el flag remoto `features.self_custody` que llega con `/user/extended`.
 * Mientras el backend no mande el campo, solo manda el ajuste local.
 */
export default function useSelfCustodyFlag(): boolean {
	const { user } = useAuth()
	const { getSetting } = useSettings()
	const local = getSetting('crypto', 'selfCustody', false)
	const remote = user?.features?.self_custody
	return Boolean(local) || remote === true || remote === 1
}
