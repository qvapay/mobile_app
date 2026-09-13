# plan.md — QvaPay Crypto Wallet (self-custody) · Guía de continuación

Branch: **`crypto`**. Leer `CLAUDE.md` antes de tocar nada (React Query, i18n es/en/pt, Keychain, tipos en `types/`, tests node). Este archivo es el estado real del proyecto wallet + lo que falta, para retomar en cualquier equipo.

## Setup en un equipo nuevo

```bash
git checkout crypto
npm install                # Node >= 22.11
npm run pods               # iOS (la 1ª vez puede pedir: pod install --repo-update)
npm run typecheck && npm test && npm run lint && npm run i18n:check && npm run i18n:usage
npx jest wallet/           # 41 tests: router + nodos custom + vectores de derivación
```

- Android necesita SDK (`ANDROID_HOME` o `android/local.properties` con `sdk.dir=...`, gitignorado). **El build Android aún no se ha validado con quick-crypto** — primera cosa a comprobar en un equipo con SDK: `cd android && ./gradlew assembleDebug`.
- `config.ts`: la IP dev del backend (`10.0.0.208:3000`) puede necesitar ajuste por máquina. Si no responde en 15s, el build debug cae solo a api.qvapay.com (`api/apiHost.ts`).
- El script `ios:build` apunta al simulador "iPhone 16"; con Xcode nuevo usar destino existente (iPhone 17/Air) o `-destination 'generic/platform=iOS Simulator'`.

## Estado: qué está HECHO (commits `2e843b7..ecd1ed3`)

- **Fase 0** — Tab Invest → **Crypto**: ruta `ROUTES.CRYPTO_SCREEN`, deep link `/crypto`, `screens/crypto/`, `cryptoQueries` (raíz RQ `['crypto']`), i18n `crypto.*`. Flag de rollout: `hooks/useSelfCustodyFlag.ts` = ajuste local `crypto.selfCustody` (SettingsContext, default off) OR `features.self_custody` de `/user/extended` (el backend aún no lo manda). En `__DEV__` la sección Nodos ya es visible sin flag.
- **Fase 0.5** — Stack cripto instalado: `react-native-quick-crypto` (única nativa; **build iOS validado**, BUILD SUCCEEDED), `@scure/bip39+bip32`, `@noble/curves+hashes`, `viem`, `@scure/btc-signer`, `bs58`. **`polyfills.ts` es el PRIMER import de `index.js`** (global.crypto + Buffer; en dev revienta si falta). `jest.config.js` ya transforma el stack ESM (`@scure|@noble|viem|abitype|ox|micro-packed`).
- **Fase 1** — `wallet/registry/`: `types.ts`, `bundled.json` (v4, 6 cadenas: ethereum/bsc/polygon/base/tron/bitcoin; **ninguna URL de RPC vive fuera de este archivo, salvo las que el usuario añade a mano en Ajustes → Nodos**), `rpcRouter.ts` PURO (prioridad → salud → latencia, breaker 3 fallos/2min, rota solo errores de infraestructura; deps inyectadas), `useRegistry.ts` (RQ `['wallet','registry']`, TTL 1h, remoto gana solo si `version >= bundled`), `appRpcRouter.ts` (singleton, salud en `@qpwallet:rpc-health`, `useAppRpcRouter`). Pantalla **Ajustes → Avanzado → Nodos** (`screens/settings/subpanels/RpcNodes.tsx`). Repo espejo en `~/webs/rpc-registry` (registry.json + schema.json + `scripts/check.mjs` + CI).
- **Fase 2** — Llaves: `wallet/seed.ts` (BIP-39, 12 palabras, quiz), `wallet/derive.ts` (EVM `m/44'/60'/0'/0/0` compartida ETH/BSC/Base, TRON `m/44'/195'/0'/0/0`, BTC `m/84'/0'/0'/0/0`; **vectores de la frase "abandon…about" fijados por test** en `wallet/derive.test.js` — interop Trust/MetaMask garantizada), `wallet/keystore.ts` (Keychain `com.qvapay.wallet`), `wallet/WalletContext.tsx` (bajo AuthProvider; probe de RPCs cada 10 min con wallet), `api/walletApi.ts` (solo `POST /wallet/addresses`, best-effort). Pantallas: `screens/crypto/wallet/` — WalletOnboarding, WalletBackup (crea/retoma + 12 palabras + quiz; **Backup y Verify van fusionadas para que el mnemonic no viaje por params**), WalletImport, WalletCard (en `Crypto.tsx` detrás del flag).

## Reglas duras (threat model — NO negociables)

1. La seed NUNCA sale del dispositivo. Ningún endpoint recibe llaves ni firmas.
2. `com.qvapay.wallet` va **SIN access control biométrico a nivel Keychain** y **ningún catch borra la entrada** — el patrón de `getBiometricCredentials` (api/client.ts) auto-borra al re-enrolar huellas: con una seed = pérdida de fondos. El gate biométrico/PIN es de capa de app (AppLockContext/usePinEntry) antes de leer la seed.
3. El logout NO borra la seed (`clearAuthData` no toca `com.qvapay.wallet`). Solo el flujo explícito "Eliminar wallet".
4. El mnemonic no viaja por params de navegación ni por contexts: vive en estado local de la pantalla que lo usa.
5. Datos on-chain en RQ con `meta: { noPersist: true }` (el persister `@qpquery:v1` escribe AsyncStorage sin cifrar). El registry sí puede persistir.
6. La app decodifica y muestra lo que va a firmar ANTES de firmar (TRON: verificar protobuf `raw_data` + recomputar `txID = sha256(raw_data)`).
7. Ningún log de seeds/llaves/payloads firmados; Sentry `beforeSend` debe filtrar `mnemonic|privateKey|seed` (pendiente de configurar cuando se toque Sentry).

## Pendientes INMEDIATOS (no código de fases)

- [ ] **Validar en device**: crear wallet, importar la frase en Trust Wallet → mismas direcciones (aceptación Fase 2 en vivo; los vectores ya lo fijan por test).
- [x] **`qvapay/rpc-registry` publicado** (v4, 120 RPCs públicos verificados, 6 cadenas con Polygon). La app lee SOLO GitHub raw; `bundled.json` va sincronizado al v4 (2026-09-09).
- [ ] **Espejo `https://rpc.qvapay.com/registry.json`** — APLAZADO a propósito: por ahora solo nodos públicos + nodos custom del usuario. Cuando se monte (Cloudflare Pages), va PRIMERO en `REGISTRY_URLS` de `wallet/registry/useRegistry.ts` (se quitó del array porque, caído, costaba el timeout de 5s en cada refresh).
- [x] **Nodos custom del usuario** (2026-09-09): `wallet/registry/customRpcs.ts` (puro: validar/normalizar https, mapa inmutable, `applyCustomRpcs` los pone delante con `owner: 'user'` y priority -1, por debajo del 0 de qvapay), ajuste `crypto.customRpcs` en SettingsContext, `useEffectiveRegistry` en `appRpcRouter.ts` (remoto/bundled + custom — es lo que consumen router y pantalla; `useRegistry` a pelo ya no se usa desde UI) y alta/baja en Ajustes → Nodos (`RpcNodeAddModal`: se prueba contra el nodo con `probeRpc` ANTES de guardar; tope 5 por cadena). `WalletProvider` monta `useAppRpcRouter` para que el singleton siga el registro efectivo toda la sesión (antes solo lo enganchaba la pantalla Nodos: la wallet hablaba con el bundled hasta abrirla).
- [ ] **Validar build Android** en equipo con SDK (quick-crypto compiló solo en iOS).
- [ ] **qpweb: `POST /wallet/addresses`** — modelo Prisma `UserWallet` (user_id, family `evm|tron|btc`, address, unique por user+family) + endpoint `withAuth` + migración. El móvil ya lo llama best-effort y tolera el 404.
- [ ] Backend: mandar `features.self_custody` en `/user/extended` para el rollout remoto del flag.

## Fase 3 — Receive + balances + histórico (siguiente)

- `wallet/chains/index.ts`: interfaz `ChainAdapter` + factory por `kind` del registry.
- `wallet/chains/evm.ts` (viem con transporte custom sobre `router.call(chainKey, fn)`): balance nativo (`eth_getBalance`), `balanceOf` ERC-20 de los tokens del registry, histórico por `getLogs` de `Transfer` (topic con la address, ventanas de bloques).
- `wallet/chains/tron.ts` (HTTP TronGrid-style vía fetch + router): `/wallet/getaccount` (TRX), `triggerconstantcontract` balanceOf USDT, histórico `/v1/accounts/{addr}/transactions/trc20`.
- `wallet/chains/btc.ts` (esplora vía router): `/address/{addr}` (balance por `chain_stats`), `/address/{addr}/txs`, fee estimates `/fee-estimates`.
- `screens/crypto/wallet/walletQueries.ts`: `['wallet','balances']` staleTime 30s + refetch al foreground; `['wallet','history',chain]` infinita `meta:{noPersist:true}`; precios USD desde `['coins']` existente (`useCoins`/`coinsApi`) — mapear tick↔chainKey.
- `Receive.tsx`: QR por cadena (`react-native-qrcode-styled`, patrón de `screens/add/DepositDetailsModal`), selector de red, copy con aviso de red correcta.
- WalletCard: pasar de direcciones a total USD + tokens.
- Tests node de mapeos (respuesta RPC → balance decimal con `decimals` del registry) con fixtures.
- **Aceptación**: enviar 1 USDT TRC-20 desde otra wallet → visible en < 60s.

## Fase 4 — Send (TRON USDT primero, luego BSC/ETH/Base, BTC al final)

- `wallet/decode.ts`: tx sin firmar → `{ to, token, amount, fee }` legible. TRON: protobuf `raw_data` con protobufjs (proto vendorizado), verificar destino/monto/contrato, recomputar txID.
- `wallet/sign.ts`: `signEvmTx` (viem, `derivePrivateKey(seed,'evm')` leída del Keychain justo antes, no retener), `signTronTx`, `signBtcPsbt` (@scure/btc-signer, UTXO selection).
- Flujo: `Send` (dirección/QR/contacto) → `SendConfirm` (intención decodificada + fee) → gate PIN/biometría (AppLockContext/usePinEntry) → firma → broadcast vía router → `SendSuccess` → `TxDetail` con polling de confirmaciones.
- Extender `parseQRData` en `helpers.ts` (¡no duplicar parser!): direcciones pelas TRON/EVM/BTC, EIP-681; ojo: la rama `bitcoin:` sin `lightning=` hoy retorna null (helpers.ts:119-126).
- Validación local de destino: EIP-55, base58check TRON, bech32 BTC.
- Idempotencia local: hash de la tx firmada como clave; doble tap no difunde dos veces.
- Gas: TRON avisar "tienes USDT pero no TRX" (~13–28 TRX por transfer TRC-20); EVM bloquear sin nativo.
- **Aceptación**: USDT TRC-20 y BEP-20 reales enviados, confirmación en app y explorer.

## Fase 5 — Puente con saldo QvaPay (½ semana)

- "Pasar a saldo QvaPay": `useDepositOrder` (screens/add) genera la dirección de depósito → prefilar Send desde Mi Wallet en vez del deep link a Trust (`WalletPickerSheet` es el precedente).
- "Sacar a Mi Wallet": `Withdraw` con destino prellenado desde `WalletContext.addresses`.
- **Aceptación**: round trip saldo → wallet → saldo sin teclear una dirección.

## Fase 6 — Nodos propios (cuando la torre sincronice)

- Cloudflare Tunnel: `tron|bsc|eth|base|btc.qvapay.com` (btc = esplora/Electrs). Solo lectura + broadcast; nunca `personal_*`/`admin_*`/`debug_*`. Rate limit.
- Flip en `rpc-registry`: `enabled: true` en los `owner: "qvapay"` → verificar en Ajustes → Nodos que la app cambió sola (priority 0 gana en el próximo probe/refresh, TTL 1h).

## Fuera de alcance v1

Swap, on-ramp fiat, Solana, WalletConnect, cloud backup, indexer propio, multi-cuenta HD, delegación de energía TRON, Lightning self-custody.

## Checklist por PR

- Tests node (`@jest-environment node`) para todo `wallet/` (sin imports de RN salvo `keystore.ts`/`appRpcRouter.ts`)
- i18n en es/en/pt (dominio `crypto.json`); `npm run i18n:check` + `i18n:usage`
- Ninguna URL de RPC fuera de `wallet/registry/bundled.json`
- `npm run lint` (0 errores) + `typecheck` + `test` en verde
- Actualizar `CLAUDE.md` (y este plan.md) al cerrar cada fase
