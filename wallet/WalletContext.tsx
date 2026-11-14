/**
 * Estado de la wallet self-custody: existencia, direcciones públicas y
 * estado de backup. Vive BAJO AuthProvider pero es independiente de la
 * sesión: la seed y este metadata sobreviven al logout (solo el flujo
 * explícito "Eliminar wallet" los borra).
 *
 * Aquí NUNCA se retiene el mnemonic: `createWallet` lo devuelve una vez para
 * el flujo de backup (la pantalla lo descarta al salir) y todo lo demás son
 * datos públicos (direcciones derivadas), persistidos en AsyncStorage.
 *
 * Tres estados, no dos (reglas en `walletHydration.ts`): sin wallet, wallet
 * usable (`hasWallet`) y `recovery` — en el teléfono hay una wallet cuyas
 * llaves no se pueden usar (la seed no se deja leer, o no se pudo comprobar).
 * En `recovery`, `hasWallet` es false a propósito: ni saldos, ni Recibir, ni
 * firmas; y tampoco se puede crear o importar otra encima. Se sale restaurando
 * con la frase de ESA wallet, reintentando la lectura o eliminándola.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { AppState } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'

import { createMnemonic, isValidMnemonic, mnemonicToSeed, normalizeMnemonic } from './seed'
import { deriveAddresses } from './derive'
import type { WalletAddresses } from './derive'
import { getWalletCheck, getWalletMnemonic, removeWalletCheck, removeWalletId, removeWalletMnemonic, setWalletCheck, setWalletMnemonic, walletSeedEntry } from './keystore'
import { hydrateWallet, sameWallet } from './walletHydration'
import type { Hydration, HydrationDeps, WalletMeta, WalletRecovery } from './walletHydration'
import { useAppRpcRouter } from './registry/appRpcRouter'
import { walletApi } from '../api/walletApi'
import { useAuth } from '../auth/AuthContext'

/** Metadata pública (direcciones + backup, `WalletMeta`); el secreto vive solo en Keychain. */
const WALLET_META_KEY = '@qpwallet:meta'

/** Cadencia del probe de RPCs con la app en foreground (plan crypto, Fase 1). */
const PROBE_INTERVAL_MS = 10 * 60_000

/**
 * Resultado de restaurar una wallet en `recovery` con su frase.
 * - `mismatch`: la frase es válida pero de OTRA wallet (no da las direcciones de esta).
 * - `unverifiable`: no se conocen las direcciones de la que hay, así que no hay con qué
 *   comprobar la frase; pisar la seed a ciegas podría ser perder otra wallet.
 */
export type RestoreResult = 'ok' | 'invalid' | 'mismatch' | 'unverifiable' | 'failed'

export type WalletContextValue = {
	/** false hasta hidratar Keychain+AsyncStorage: no decidir UI antes. */
	isReady: boolean
	/** Hay una wallet USABLE: direcciones conocidas y seed legible. */
	hasWallet: boolean
	/**
	 * En el teléfono hay una wallet cuyas llaves no se pueden usar ahora. Mientras no sea
	 * null, `hasWallet` es false y crear/importar se niegan: se restaura, se reintenta o se elimina.
	 */
	recovery: WalletRecovery | null
	/** Vuelve a mirar el Keychain (un fallo de lectura puede ser pasajero). @returns true si la wallet ya es usable. */
	recheckKeys: () => Promise<boolean>
	/** Devuelve las llaves a la wallet en `recovery`. Solo acepta la frase que da sus mismas direcciones. */
	restoreWallet: (mnemonic: string) => Promise<RestoreResult>
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
	/**
	 * Borrado explícito de seed + metadata. Irreversible sin el backup.
	 *
	 * @returns false si el Keychain no confirma que la seed ya no está: en ese caso no se
	 * borra nada más y la wallet sigue ahí.
	 */
	deleteWallet: () => Promise<boolean>
}

const WalletContext = createContext<WalletContextValue | null>(null)

export const useWallet = (): WalletContextValue => {
	const context = useContext(WalletContext)
	if (!context) throw new Error('useWallet must be used within a WalletProvider')
	return context
}

/**
 * Ejecuta `tick` cada `ms` mientras la app está en foreground (se pausa al ir a
 * segundo plano y se rearma al volver). Devuelve `dispose`. Vive fuera del
 * componente a propósito: react-doctor no empareja un timer armado dentro de un
 * helper del efecto con su limpieza, y lo daba como timer sin limpiar.
 */
const startForegroundLoop = (tick: () => void, ms: number): (() => void) => {
	let interval: ReturnType<typeof setInterval> | null = null
	const arm = () => { if (!interval) interval = setInterval(tick, ms) }
	const disarm = () => { if (interval) { clearInterval(interval); interval = null } }
	arm()
	const sub = AppState.addEventListener('change', state => { state === 'active' ? arm() : disarm() })
	return () => { disarm(); sub.remove() }
}

/** Lecturas reales que alimentan `hydrateWallet` (puro). */
const HYDRATION_DEPS: HydrationDeps = {
	readMeta: () => AsyncStorage.getItem(WALLET_META_KEY),
	seedEntry: walletSeedEntry,
	readCheck: getWalletCheck,
	readMnemonic: getWalletMnemonic,
	isValidMnemonic,
	derive: mnemonic => deriveAddresses(mnemonicToSeed(mnemonic)),
}

/** Si la propia hidratación revienta no se sabe nada: jamás «sin wallet». */
const UNKNOWN: Hydration = { kind: 'recovery', recovery: { addresses: null, reason: 'unknown' } }

export const WalletProvider = ({ children }: { children: React.ReactNode }) => {

	const [isReady, setIsReady] = useState(false)
	const [meta, setMeta] = useState<WalletMeta | null>(null)
	const metaRef = useRef<WalletMeta | null>(null)
	const [recovery, setRecoveryState] = useState<WalletRecovery | null>(null)
	const recoveryRef = useRef<WalletRecovery | null>(null)
	const setRecovery = useCallback((next: WalletRecovery | null) => {
		recoveryRef.current = next
		setRecoveryState(next)
	}, [])

	const persistMeta = useCallback(async (next: WalletMeta | null) => {
		metaRef.current = next
		setMeta(next)
		if (next) await AsyncStorage.setItem(WALLET_META_KEY, JSON.stringify(next)).catch(() => {})
		else await AsyncStorage.removeItem(WALLET_META_KEY).catch(() => {})
	}, [])

	/** Vuelca en el estado lo que decidió `hydrateWallet`. */
	const applyHydration = useCallback(async (result: Hydration) => {
		if (result.kind === 'ready') {
			setRecovery(null)
			if (result.verified) {
				// Se leyó la seed: la metadata se guarda (pudo corregirse) y el testigo se renueva
				await persistMeta(result.meta)
				await setWalletCheck(result.meta.addresses.evm)
			} else {
				metaRef.current = result.meta
				setMeta(result.meta)
			}
			return
		}
		// Sin llaves no hay wallet que enseñar. La metadata se queda en disco: en `recovery`
		// es lo que permite comprobar la frase al restaurar
		metaRef.current = null
		setMeta(null)
		setRecovery(result.kind === 'recovery' ? result.recovery : null)
	}, [persistMeta, setRecovery])

	const hydratingRef = useRef<Promise<Hydration> | null>(null)
	/** Una hidratación a la vez (la del arranque, un reintento y la vuelta al frente pueden coincidir). */
	const rehydrate = useCallback((): Promise<Hydration> => {
		hydratingRef.current ??= hydrateWallet(HYDRATION_DEPS)
			.catch((): Hydration => UNKNOWN)
			.then(async result => { await applyHydration(result); return result })
			.finally(() => { hydratingRef.current = null })
		return hydratingRef.current
	}, [applyHydration])

	// Hidratación al arrancar
	useEffect(() => {
		let cancelled = false
		let waiting: { remove: () => void } | null = null
		const run = async () => {
			const result = await hydrateWallet(HYDRATION_DEPS).catch((): Hydration => UNKNOWN)
			if (cancelled) return
			// Proceso arrancado en segundo plano con el teléfono bloqueado: el Keychain aún no
			// se deja leer, y eso no es una wallet sin llaves. Se decide cuando la app salga
			// al frente (hasta entonces nadie está mirando)
			if (result.kind === 'recovery' && AppState.currentState === 'background') {
				waiting = AppState.addEventListener('change', state => {
					if (state !== 'active') return
					waiting?.remove()
					waiting = null
					run()
				})
				return
			}
			await applyHydration(result)
			if (!cancelled) setIsReady(true)
		}
		run()
		return () => { cancelled = true; waiting?.remove() }
	}, [applyHydration])

	// En `recovery`, cada vuelta al frente lo reintenta: un Keychain que no respondió suele
	// ser pasajero y la wallet tiene que volver sola, sin que el usuario haga nada
	useEffect(() => {
		if (!recovery) return
		const sub = AppState.addEventListener('change', state => { if (state === 'active') rehydrate().catch(() => {}) })
		return () => sub.remove()
	}, [recovery, rehydrate])

	const recheckKeys = useCallback(async (): Promise<boolean> => (await rehydrate()).kind === 'ready', [rehydrate])

	// El singleton del router sigue el registro efectivo (remoto + nodos del
	// usuario) desde aquí, que vive toda la sesión — no solo desde la pantalla
	// Nodos, o la wallet hablaría con el bundled hasta que alguien la abriera.
	const router = useAppRpcRouter()

	// Probe de RPCs: al armar la wallet y cada 10 min en foreground. Solo con
	// wallet creada — sin ella no hay tráfico on-chain que optimizar.
	useEffect(() => {
		if (!meta) return
		router.probe().catch(() => {})
		return startForegroundLoop(() => { router.probe().catch(() => {}) }, PROBE_INTERVAL_MS)
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

	/**
	 * ¿Se puede guardar una seed nueva? Solo si el Keychain CONFIRMA que no hay ninguna. No
	 * basta con lo que este contexto cree: si hay una seed que la hidratación no vio, se
	 * recoge (y la pantalla pasa a enseñarla) en vez de pisarla.
	 */
	const canStoreNewSeed = useCallback(async (): Promise<boolean> => {
		if (metaRef.current || recoveryRef.current) return false
		if ((await walletSeedEntry()) === 'absent') return true
		await rehydrate().catch(() => {})
		return false
	}, [rehydrate])

	const createWallet = useCallback(async (): Promise<string | null> => {
		if (!(await canStoreNewSeed())) return null // ya hay wallet (usable o no): jamás pisarla
		const mnemonic = createMnemonic()
		if (!(await setWalletMnemonic(mnemonic))) return null
		const addresses = deriveAddresses(mnemonicToSeed(mnemonic))
		await setWalletCheck(addresses.evm)
		await persistMeta({ addresses, backedUp: false })
		return mnemonic
	}, [persistMeta, canStoreNewSeed])

	const importWallet = useCallback(async (input: string): Promise<boolean> => {
		if (!isValidMnemonic(input)) return false
		if (!(await canStoreNewSeed())) return false
		const mnemonic = normalizeMnemonic(input)
		if (!(await setWalletMnemonic(mnemonic))) return false
		const addresses = deriveAddresses(mnemonicToSeed(mnemonic))
		await setWalletCheck(addresses.evm)
		await persistMeta({ addresses, backedUp: true })
		return true
	}, [persistMeta, canStoreNewSeed])

	const restoreWallet = useCallback(async (input: string): Promise<RestoreResult> => {
		const current = recoveryRef.current
		if (!current) return 'failed'
		if (!isValidMnemonic(input)) return 'invalid'
		// Sin las direcciones de la wallet que hay no se puede comprobar que la frase sea la
		// suya, y pisar una seed que quizá solo falla ahora sería perder OTRA wallet
		if (!current.addresses) return 'unverifiable'
		const mnemonic = normalizeMnemonic(input)
		const addresses = deriveAddresses(mnemonicToSeed(mnemonic))
		if (!sameWallet(addresses, current.addresses)) return 'mismatch'
		// Es la misma wallet: sobrescribir la entrada ilegible no pierde nada
		if (!(await setWalletMnemonic(mnemonic, { overwrite: true }))) return 'failed'
		await setWalletCheck(addresses.evm)
		setRecovery(null)
		await persistMeta({ addresses, backedUp: true })
		return 'ok'
	}, [persistMeta, setRecovery])

	const markBackedUp = useCallback(async () => {
		const current = metaRef.current
		if (current && !current.backedUp) await persistMeta({ ...current, backedUp: true })
	}, [persistMeta])

	const revealMnemonic = useCallback(() => getWalletMnemonic(), [])

	const deleteWallet = useCallback(async (): Promise<boolean> => {
		// Si el Keychain no confirma que la seed ya no está, la wallet NO está eliminada:
		// decir que sí la dejaría ahí, sin metadata y sin que nadie lo supiera
		if (!(await removeWalletMnemonic())) return false
		await removeWalletCheck()
		await removeWalletId()
		setRecovery(null)
		await persistMeta(null)
		return true
	}, [persistMeta, setRecovery])

	const value = useMemo<WalletContextValue>(() => ({
		isReady,
		hasWallet: meta != null,
		recovery,
		recheckKeys,
		restoreWallet,
		isBackedUp: meta?.backedUp ?? false,
		addresses: meta?.addresses ?? null,
		createWallet,
		importWallet,
		markBackedUp,
		revealMnemonic,
		deleteWallet,
	}), [isReady, meta, recovery, recheckKeys, restoreWallet, createWallet, importWallet, markBackedUp, revealMnemonic, deleteWallet])

	return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>
}
