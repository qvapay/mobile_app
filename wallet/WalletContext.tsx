/**
 * Estado de la wallet self-custody: existencia, direcciones públicas y
 * estado de backup. Vive BAJO AuthProvider pero es independiente de la
 * sesión: la seed y este metadata sobreviven al logout (solo el flujo
 * explícito "Eliminar wallet" los borra).
 *
 * Aquí NUNCA se retiene el mnemonic: `createWallet` lo devuelve una vez para
 * el flujo de backup (la pantalla lo descarta al salir) y todo lo demás son
 * datos públicos (direcciones derivadas), persistidos en AsyncStorage.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { AppState } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'

import { createMnemonic, isValidMnemonic, mnemonicToSeed, normalizeMnemonic } from './seed'
import { deriveAddresses } from './derive'
import type { WalletAddresses } from './derive'
import { getWalletMnemonic, hasWalletMnemonic, removeWalletMnemonic, setWalletMnemonic } from './keystore'
import { useAppRpcRouter } from './registry/appRpcRouter'
import { walletApi } from '../api/walletApi'
import { useAuth } from '../auth/AuthContext'

/** Metadata pública (direcciones + backup); el secreto vive solo en Keychain. */
const WALLET_META_KEY = '@qpwallet:meta'

/** Cadencia del probe de RPCs con la app en foreground (plan crypto, Fase 1). */
const PROBE_INTERVAL_MS = 10 * 60_000

type WalletMeta = { addresses: WalletAddresses, backedUp: boolean }

export type WalletContextValue = {
	/** false hasta hidratar Keychain+AsyncStorage: no decidir UI antes. */
	isReady: boolean
	hasWallet: boolean
	/** false = aún no pasó el quiz de backup (la UI no muestra Receive hasta entonces). */
	isBackedUp: boolean
	addresses: WalletAddresses | null
	/** Crea la wallet y devuelve el mnemonic UNA vez para el flujo de backup. */
	createWallet: () => Promise<string | null>
	/** Importa un mnemonic existente (queda marcado como respaldado). */
	importWallet: (mnemonic: string) => Promise<boolean>
	/** El quiz de backup pasó: desbloquea el resto de la wallet. */
	markBackedUp: () => Promise<void>
	/** Lee el mnemonic para mostrar/exportar. Llamar SOLO tras el gate de AppLock. */
	revealMnemonic: () => Promise<string | null>
	/** Borrado explícito de seed + metadata. Irreversible sin el backup. */
	deleteWallet: () => Promise<void>
}

const WalletContext = createContext<WalletContextValue | null>(null)

export const useWallet = (): WalletContextValue => {
	const context = useContext(WalletContext)
	if (!context) throw new Error('useWallet must be used within a WalletProvider')
	return context
}

export const WalletProvider = ({ children }: { children: React.ReactNode }) => {

	const [isReady, setIsReady] = useState(false)
	const [meta, setMeta] = useState<WalletMeta | null>(null)
	const metaRef = useRef<WalletMeta | null>(null)

	const persistMeta = useCallback(async (next: WalletMeta | null) => {
		metaRef.current = next
		setMeta(next)
		if (next) await AsyncStorage.setItem(WALLET_META_KEY, JSON.stringify(next)).catch(() => {})
		else await AsyncStorage.removeItem(WALLET_META_KEY).catch(() => {})
	}, [])

	// Hidratación: metadata de AsyncStorage; si hay seed pero no metadata
	// (upgrade/limpieza parcial), se re-deriva de la seed una única vez.
	useEffect(() => {
		let cancelled = false
		const hydrate = async () => {
			try {
				const [raw, hasSeed] = await Promise.all([
					AsyncStorage.getItem(WALLET_META_KEY),
					hasWalletMnemonic(),
				])
				if (cancelled) return
				if (raw && hasSeed) {
					const parsed = JSON.parse(raw) as WalletMeta
					if (!parsed.addresses.stx || !parsed.addresses.stxPublicKey || !parsed.addresses.sol) {
						// Metadata anterior a Stacks o a Solana: re-derivar TODAS las direcciones una vez
						// (mismo camino que la hidratación sin metadata; el backup no cambia)
						const mnemonic = await getWalletMnemonic()
						if (!cancelled && mnemonic) { await persistMeta({ ...parsed, addresses: deriveAddresses(mnemonicToSeed(mnemonic)) }) }
						else { metaRef.current = parsed; setMeta(parsed) }
					} else {
						metaRef.current = parsed
						setMeta(parsed)
					}
				} else if (hasSeed) {
					const mnemonic = await getWalletMnemonic()
					if (!cancelled && mnemonic) {
						const addresses = deriveAddresses(mnemonicToSeed(mnemonic))
						// Sin metadata no sabemos si el backup pasó: asumir que sí —
						// la seed ya estaba instalada y bloquear la wallet sería peor.
						await persistMeta({ addresses, backedUp: true })
					}
				}
			} catch { /* sin metadata: la UI ofrece crear/importar */ }
			if (!cancelled) setIsReady(true)
		}
		hydrate()
		return () => { cancelled = true }
	}, [persistMeta])

	// El singleton del router sigue el registro efectivo (remoto + nodos del
	// usuario) desde aquí, que vive toda la sesión — no solo desde la pantalla
	// Nodos, o la wallet hablaría con el bundled hasta que alguien la abriera.
	const router = useAppRpcRouter()

	// Probe de RPCs: al armar la wallet y cada 10 min en foreground. Solo con
	// wallet creada — sin ella no hay tráfico on-chain que optimizar.
	useEffect(() => {
		if (!meta) return
		router.probe().catch(() => {})
		let interval: ReturnType<typeof setInterval> | null = null
		const arm = () => { if (!interval) interval = setInterval(() => router.probe().catch(() => {}), PROBE_INTERVAL_MS) }
		const disarm = () => { if (interval) { clearInterval(interval); interval = null } }
		arm()
		const sub = AppState.addEventListener('change', state => { state === 'active' ? arm() : disarm() })
		return () => { disarm(); sub.remove() }
	}, [meta, router])

	// Registro de direcciones públicas una vez por cuenta y sesión: cubre las
	// wallets creadas antes de que el endpoint existiera (el POST inicial dio
	// 404) y el cambio de cuenta en el mismo teléfono. Upsert idempotente.
	const { isAuthenticated, user } = useAuth()
	const registeredForRef = useRef<string | null>(null)
	useEffect(() => {
		const userKey = user?.uuid ?? null
		if (!isAuthenticated || !userKey || !meta) return
		const registrationKey = `${userKey}:${meta.addresses.evm}`
		if (registeredForRef.current === registrationKey) return
		registeredForRef.current = registrationKey
		walletApi.registerAddresses(meta.addresses).catch(() => {})
	}, [isAuthenticated, user?.uuid, meta])

	const createWallet = useCallback(async (): Promise<string | null> => {
		if (metaRef.current) return null // ya hay wallet: jamás pisarla
		const mnemonic = createMnemonic()
		if (!(await setWalletMnemonic(mnemonic))) return null
		const addresses = deriveAddresses(mnemonicToSeed(mnemonic))
		await persistMeta({ addresses, backedUp: false })
		return mnemonic
	}, [persistMeta])

	const importWallet = useCallback(async (input: string): Promise<boolean> => {
		if (metaRef.current) return false
		if (!isValidMnemonic(input)) return false
		const mnemonic = normalizeMnemonic(input)
		if (!(await setWalletMnemonic(mnemonic))) return false
		const addresses = deriveAddresses(mnemonicToSeed(mnemonic))
		await persistMeta({ addresses, backedUp: true })
		return true
	}, [persistMeta])

	const markBackedUp = useCallback(async () => {
		const current = metaRef.current
		if (current && !current.backedUp) await persistMeta({ ...current, backedUp: true })
	}, [persistMeta])

	const revealMnemonic = useCallback(() => getWalletMnemonic(), [])

	const deleteWallet = useCallback(async () => {
		await removeWalletMnemonic()
		await persistMeta(null)
	}, [persistMeta])

	const value = useMemo<WalletContextValue>(() => ({
		isReady,
		hasWallet: meta != null,
		isBackedUp: meta?.backedUp ?? false,
		addresses: meta?.addresses ?? null,
		createWallet,
		importWallet,
		markBackedUp,
		revealMnemonic,
		deleteWallet,
	}), [isReady, meta, createWallet, importWallet, markBackedUp, revealMnemonic, deleteWallet])

	return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>
}
